// ============================================
// SESSION STORE
// Zustand store with Firebase sync
// ============================================

import { create } from "zustand";
import {
  generateNextRound,
  generateMatchForCourt as generateMatchForCourtEngine,
  generateGlobalNextMatch,
  recordMatchResult,
} from "../engine/scheduler";
import { saveSession, updateSession, getRecentSessions } from "../db/sessionDB";
import { saveSessionHistory } from "../db/historyDB";
import type {
  Session,
  Player,
  Court,
  Match,
  CourtAssignment,
  SchedulerOutput,
  SessionTemplate,
} from "../types";

// ============================================
// HELPERS
// ============================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultCourt(number: number): Court {
  return {
    id: generateId("court"),
    number,
    rotationMode: "FAIR_PLAY",
    backToBackPolicy: "STRICT",
    currentMatch: null,
    pendingAssignment: null,
    isActive: true,
  };
}

function createDefaultSession(name: string, courtCount: number): Session {
  return {
    id: generateId("session"),
    name,
    state: "SETUP",
    courts: Array.from({ length: courtCount }, (_, i) =>
      createDefaultCourt(i + 1)
    ),
    players: [],
    rules: {
      matchFormat: "TIMED",
      matchDurationMinutes: 15,
      skillMatching: "SOFT",
      maxSkillGap: 1.5,
    },
    matchHistory: [],
    currentRound: 0,
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    nextMatch: null,
  };
}

// ============================================
// STORE INTERFACE
// ============================================

interface SessionStore {
  session: Session | null;
  lastOutput: SchedulerOutput | null;
  templates: SessionTemplate[];
  saving: boolean;
  error: string | null;

  // Session lifecycle
  createSession: (name: string, courtCount: number) => Promise<void>;
  startSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  endSession: () => Promise<void>;

  // Player management
  addPlayer: (player: Omit<Player, "id" | "joinedAt">) => void;
  addPlayerToActiveSession: (player: Omit<Player, "id" | "joinedAt">) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerId: string, updates: Partial<Player>) => void;
  setPlayerStatus: (
    playerId: string,
    status: Player["attendanceStatus"]
  ) => void;
  setPlayerPaid: (playerId: string, paid: boolean) => void;

  // Court management
  updateCourt: (courtId: string, updates: Partial<Court>) => void;

  // Global scheduler
  generateInitialMatches: () => void;
  generateNextMatch: () => void;
  regenerateNextMatch: () => "ok" | "no_alternative" | "needs_just_finished";
  regenerateNextMatchForce: () => void;
  regenerateCourtMatch: (courtId: string) => "ok" | "no_alternative";
  claimNextMatch: (courtId: string) => void;
  replacePlayerInNextMatch: (outId: string, inId: string) => void;
  // Per-court (still used for Replace in ready current match)
  generateMatchForCourt: (courtId: string) => void;
  startMatch: (courtId: string) => void;
  replacePlayerInPending: (courtId: string, outId: string, inId: string) => void;
  replacePlayerInCurrent: (courtId: string, outId: string, inId: string) => void;
  setPriority: (playerId: string, enabled: boolean) => void;
  recordResult: (match: Match, result: "TEAM_A" | "TEAM_B", scoreA?: number, scoreB?: number) => Promise<void>;
  // Legacy — kept for tests and backward compat
  generateRound: () => void;
  applyAssignments: (assignments: CourtAssignment[]) => void;

  // Templates
  saveTemplate: (name: string) => void;
  loadTemplate: (templateId: string) => void;

  // Firebase sync
  syncSession: () => Promise<void>;
  loadLatestSession: () => Promise<void>;
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  lastOutput: null,
  templates: [],
  saving: false,
  error: null,

  // ============================================
  // FIREBASE SYNC
  // ============================================

  syncSession: async () => {
    const { session } = get();
    if (!session) return;
    set({ saving: true });
    try {
      await saveSession(session);
    } catch (error) {
      set({ error: "Failed to sync session" });
    } finally {
      set({ saving: false });
    }
  },

loadLatestSession: async () => {
    set({ saving: true });
    try {
      const sessions = await getRecentSessions(1);
      if (sessions.length > 0) {
        const latest = sessions[0];
        if (latest.state === "ACTIVE" || latest.state === "PAUSED") {
          // Migrate old WINNER_STAYS to FAIR_PLAY
          const migratedCourts = latest.courts.map((c) => ({
            ...c,
            rotationMode:
              c.rotationMode === ("WINNER_STAYS" as never)
                ? ("FAIR_PLAY" as const)
                : c.rotationMode,
            backToBackPolicy:
              c.rotationMode === ("WINNER_STAYS" as never)
                ? ("STRICT" as const)
                : c.backToBackPolicy,
          }));
          const loaded = { ...latest, courts: migratedCourts };
          set({ session: loaded });
          // Seed global next match if the loaded session doesn't have one yet
          if (!loaded.nextMatch && loaded.state === "ACTIVE") {
            get().generateNextMatch();
          }
        }
      }
    } catch (error) {
      set({ error: "Failed to load session" });
    } finally {
      set({ saving: false });
    }
  },
  

  // ============================================
  // SESSION LIFECYCLE
  // ============================================

  createSession: async (name, courtCount) => {
    const session = createDefaultSession(name, courtCount);
    set({ session, lastOutput: null });
    await saveSession(session);
  },

  startSession: async () => {
    const { session } = get();
    if (!session || session.state !== "SETUP") return;

    const now = Date.now();
    let updated: Session = {
      ...session,
      state: "ACTIVE" as const,
      startedAt: now,
    };

    // Auto-assign Ready matches to every active court immediately —
    // organizer should not have to press anything to see the first matches.
    for (const court of updated.courts.filter((c) => c.isActive)) {
      const assignment = generateGlobalNextMatch(updated, now);
      if (!assignment) break;

      const match: Match = {
        id: generateId("match"),
        courtId: court.id,
        teamA: assignment.teamA,
        teamB: assignment.teamB,
        result: "PENDING",
        startTime: null, // Ready — organizer presses Start Match
        endTime: null,
        round: 1,
      };

      updated = {
        ...updated,
        courts: updated.courts.map((c) =>
          c.id === court.id ? { ...c, currentMatch: match } : c
        ),
      };
    }

    // Seed the global Next Up card for whoever finishes first
    const nextMatch = generateGlobalNextMatch(updated, now) ?? null;
    updated = { ...updated, nextMatch };

    set({ session: updated });
    await updateSession(session.id, {
      state: updated.state,
      startedAt: updated.startedAt,
      courts: updated.courts,
      nextMatch: updated.nextMatch,
    });
  },

  pauseSession: async () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;
    const updated = { ...session, state: "PAUSED" as const };
    set({ session: updated });
    await updateSession(session.id, { state: "PAUSED" });
  },

  resumeSession: async () => {
    const { session } = get();
    if (!session || session.state !== "PAUSED") return;
    const updated = { ...session, state: "ACTIVE" as const };
    set({ session: updated });
    await updateSession(session.id, { state: "ACTIVE" });
  },

endSession: async () => {
    const { session } = get();
    if (!session) return;
    const updated = {
      ...session,
      state: "ENDED" as const,
      endedAt: Date.now(),
    };
    await updateSession(session.id, {
      state: "ENDED",
      endedAt: updated.endedAt,
    });
    // Save per-player history before clearing
    try {
      await saveSessionHistory(updated);
    } catch {
      // non-fatal — history save failure shouldn't block ending the session
    }
    set({ session: null, lastOutput: null });
  },

  // Add player during active session
  addPlayerToActiveSession: (playerData: Omit<Player, "id" | "joinedAt">) => {
    const { session } = get();
    if (!session) return;

    const newPlayer: Player = {
      ...playerData,
      id: generateId("player"),
      joinedAt: Date.now(),
      waitingSince: Date.now(),
      attendanceStatus: "PRESENT",
    };

    const s: Session = { ...session, players: [...session.players, newPlayer] };
    set({ session: s });
    updateSession(session.id, { players: s.players });
    // No auto-fill — organiser clicks "Generate Initial Matches" when ready
  },

  // ============================================
  // PLAYER MANAGEMENT
  // ============================================

addPlayer: (playerData) => {
    const { session } = get();
    if (!session) return;

    // Prevent duplicate players
    const alreadyIn = session.players.some(
      (p) => p.id === (playerData as Player).id || p.name === playerData.name
    );
    if (alreadyIn) return;

    const newPlayer: Player = {
      ...playerData,
      id: (playerData as Player).id ?? generateId("player"),
      joinedAt: Date.now(),
    };

    const updated = {
      ...session,
      players: [...session.players, newPlayer],
    };
    set({ session: updated });
    updateSession(session.id, { players: updated.players });
  },

  removePlayer: (playerId) => {
    const { session } = get();
    if (!session) return;
    const updated = {
      ...session,
      players: session.players.filter((p) => p.id !== playerId),
    };
    set({ session: updated });
    updateSession(session.id, { players: updated.players });
  },

  updatePlayer: (playerId, updates) => {
    const { session } = get();
    if (!session) return;
    const updated = {
      ...session,
      players: session.players.map((p) =>
        p.id === playerId ? { ...p, ...updates } : p
      ),
    };
    set({ session: updated });
    updateSession(session.id, { players: updated.players });
  },

  setPlayerStatus: (playerId, status) => {
    get().updatePlayer(playerId, { attendanceStatus: status });
  },

  setPlayerPaid: (playerId, paid) => {
    get().updatePlayer(playerId, {
      payment: { status: paid ? "PAID" : "UNPAID" },
    });
  },

  // ============================================
  // COURT MANAGEMENT
  // ============================================

  updateCourt: (courtId, updates) => {
    const { session } = get();
    if (!session) return;
    const updated = {
      ...session,
      courts: session.courts.map((c) =>
        c.id === courtId ? { ...c, ...updates } : c
      ),
    };
    set({ session: updated });
    updateSession(session.id, { courts: updated.courts });
  },

  // ============================================
  // PER-COURT SCHEDULER
  // ============================================

  generateInitialMatches: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;

    const now = Date.now();
    let s = { ...session };

    for (const court of s.courts.filter((c) => c.isActive && !c.currentMatch)) {
      const assignment = generateGlobalNextMatch(s, now);
      if (!assignment) break;
      const match: Match = {
        id: generateId("match"),
        courtId: court.id,
        teamA: assignment.teamA,
        teamB: assignment.teamB,
        result: "PENDING",
        startTime: null,
        endTime: null,
        round: s.currentRound + 1,
      };
      s = { ...s, courts: s.courts.map((c) => c.id === court.id ? { ...c, currentMatch: match } : c) };
    }

    if (!s.nextMatch) {
      const nextMatch = generateGlobalNextMatch(s, now);
      if (nextMatch) s = { ...s, nextMatch };
    }

    set({ session: s });
    updateSession(session.id, { courts: s.courts, nextMatch: s.nextMatch });
  },

  regenerateCourtMatch: (courtId) => {
    const { session } = get();
    if (!session) return "no_alternative";

    const court = session.courts.find((c) => c.id === courtId);
    if (!court?.currentMatch || court.currentMatch.startTime !== null) return "no_alternative";

    const currentIds = new Set([
      ...court.currentMatch.teamA.playerIds,
      ...court.currentMatch.teamB.playerIds,
    ]);

    // Temporarily clear the match so those players re-enter the pool
    const tempSession: Session = {
      ...session,
      courts: session.courts.map((c) => c.id === courtId ? { ...c, currentMatch: null } : c),
    };

    const now = Date.now();
    // Prefer a combo that doesn't include the current 4
    const different = generateGlobalNextMatch(tempSession, now, currentIds);
    const assignment = different ?? generateGlobalNextMatch(tempSession, now);
    if (!assignment) return "no_alternative";

    const match: Match = {
      id: generateId("match"),
      courtId,
      teamA: assignment.teamA,
      teamB: assignment.teamB,
      result: "PENDING",
      startTime: null,
      endTime: null,
      round: session.currentRound + 1,
    };

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId ? { ...c, currentMatch: match } : c
    );
    const updated = { ...session, courts: updatedCourts };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts });
    return "ok";
  },

  regenerateNextMatch: () => {
    const { session } = get();
    if (!session?.nextMatch) return "no_alternative";

    const currentIds = new Set([
      ...session.nextMatch.teamA.playerIds,
      ...session.nextMatch.teamB.playerIds,
    ]);

    const now = Date.now();
    // Try a different combo (excluding current 4, fresh players only)
    const different = generateGlobalNextMatch(session, now, currentIds);
    if (different) {
      const updated = { ...session, nextMatch: different };
      set({ session: updated });
      updateSession(session.id, { nextMatch: different });
      return "ok";
    }

    // Check if there are enough just-finished players to form an alternative
    const assignedIds = new Set<string>();
    for (const court of session.courts) {
      if (court.currentMatch?.result === "PENDING") {
        court.currentMatch.teamA.playerIds.forEach((id) => assignedIds.add(id));
        court.currentMatch.teamB.playerIds.forEach((id) => assignedIds.add(id));
      }
    }
    const available = session.players.filter(
      (p) =>
        (p.attendanceStatus === "PRESENT" || p.attendanceStatus === "WAITING") &&
        !assignedIds.has(p.id) &&
        !currentIds.has(p.id)
    );
    if (available.length >= 4) return "needs_just_finished";
    return "no_alternative";
  },

  regenerateNextMatchForce: () => {
    // Called after organiser confirms the "will use just-finished players" dialog
    const { session } = get();
    if (!session?.nextMatch) return;

    const currentIds = new Set([
      ...session.nextMatch.teamA.playerIds,
      ...session.nextMatch.teamB.playerIds,
    ]);

    // Allow just-finished players by regenerating without fresh-only constraint
    const assignment = generateGlobalNextMatch(session, Date.now(), currentIds);
    if (!assignment) return;

    const updated = { ...session, nextMatch: assignment };
    set({ session: updated });
    updateSession(session.id, { nextMatch: assignment });
  },

  generateNextMatch: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;

    const nextMatch = generateGlobalNextMatch(session, Date.now());
    if (!nextMatch) return;

    const updated = { ...session, nextMatch };
    set({ session: updated });
    updateSession(session.id, { nextMatch });
  },

  claimNextMatch: (courtId) => {
    const { session } = get();
    if (!session) return;

    const nm = session.nextMatch;
    if (!nm) return;

    const match: Match = {
      id: generateId("match"),
      courtId,
      teamA: nm.teamA,
      teamB: nm.teamB,
      result: "PENDING",
      startTime: null, // Ready — organizer presses Start Match when set
      endTime: null,
      round: session.currentRound + 1,
    };

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId ? { ...c, currentMatch: match } : c
    );

    const updated = { ...session, courts: updatedCourts, nextMatch: null };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts, nextMatch: null });

    // Immediately queue the next global match
    get().generateNextMatch();
  },

  replacePlayerInNextMatch: (outId, inId) => {
    const { session } = get();
    if (!session?.nextMatch) return;

    const swap = (ids: string[]) => ids.map((id) => (id === outId ? inId : id));
    const updatedNextMatch = {
      teamA: { playerIds: swap(session.nextMatch.teamA.playerIds) },
      teamB: { playerIds: swap(session.nextMatch.teamB.playerIds) },
    };

    const updated = { ...session, nextMatch: updatedNextMatch };
    set({ session: updated });
    updateSession(session.id, { nextMatch: updatedNextMatch });
  },

  generateMatchForCourt: (courtId) => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;

    const court = session.courts.find((c) => c.id === courtId);
    if (!court) return;

    const assignment = generateMatchForCourtEngine(court, session, Date.now());
    if (!assignment) return;

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId ? { ...c, pendingAssignment: assignment } : c
    );

    const updated = { ...session, courts: updatedCourts };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts });
  },

  startMatch: (courtId) => {
    const { session } = get();
    if (!session) return;

    const court = session.courts.find((c) => c.id === courtId);
    if (!court) return;

    const now = Date.now();
    const newRound = session.currentRound + 1;

    let updatedCourts: Court[];
    let assignedIds: Set<string>;

    if (court.currentMatch && court.currentMatch.startTime === null && court.currentMatch.result === "PENDING") {
      // Case A: start a Ready current match (promoted from previous pending)
      assignedIds = new Set([
        ...court.currentMatch.teamA.playerIds,
        ...court.currentMatch.teamB.playerIds,
      ]);
      updatedCourts = session.courts.map((c) =>
        c.id === courtId
          ? { ...c, currentMatch: { ...court.currentMatch!, startTime: now }, }
          : c
      );
    } else if (court.pendingAssignment) {
      // Case B: start a fresh pending assignment (first match on this court)
      const pa = court.pendingAssignment;
      assignedIds = new Set([...pa.teamA.playerIds, ...pa.teamB.playerIds]);
      const match: Match = {
        id: generateId("match"),
        courtId,
        teamA: pa.teamA,
        teamB: pa.teamB,
        result: "PENDING",
        startTime: now,
        endTime: null,
        round: newRound,
      };
      updatedCourts = session.courts.map((c) =>
        c.id === courtId
          ? { ...c, currentMatch: match, pendingAssignment: null }
          : c
      );
    } else {
      return;
    }

    const updatedPlayers = session.players.map((p) => {
      if (assignedIds.has(p.id)) {
        // Starting to play — clear the "just finished" flag
        return {
          ...p,
          attendanceStatus: "PLAYING" as const,
          consecutiveGames: 0,
          waitingSince: null,
        };
      }
      // Everyone sitting out this round also clears their "just finished" flag.
      // They've now waited through one full rotation, so they're fully eligible again.
      if (p.attendanceStatus === "PRESENT" || p.attendanceStatus === "WAITING") {
        return { ...p, consecutiveGames: 0 };
      }
      return p;
    });

    const updated = {
      ...session,
      courts: updatedCourts,
      players: updatedPlayers,
      currentRound: newRound,
    };

    set({ session: updated });
    updateSession(session.id, {
      courts: updatedCourts,
      players: updatedPlayers,
      currentRound: newRound,
    });
  },

  replacePlayerInPending: (courtId, outId, inId) => {
    const { session } = get();
    if (!session) return;

    const court = session.courts.find((c) => c.id === courtId);
    if (!court?.pendingAssignment) return;

    const replace = (ids: string[]) =>
      ids.map((id) => (id === outId ? inId : id));

    const updatedAssignment = {
      teamA: { playerIds: replace(court.pendingAssignment.teamA.playerIds) },
      teamB: { playerIds: replace(court.pendingAssignment.teamB.playerIds) },
    };

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId ? { ...c, pendingAssignment: updatedAssignment } : c
    );

    const updated = { ...session, courts: updatedCourts };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts });
  },

  replacePlayerInCurrent: (courtId, outId, inId) => {
    const { session } = get();
    if (!session) return;

    const court = session.courts.find((c) => c.id === courtId);
    if (!court?.currentMatch || court.currentMatch.startTime !== null) return;

    const replace = (ids: string[]) => ids.map((id) => (id === outId ? inId : id));

    const updatedMatch: Match = {
      ...court.currentMatch,
      teamA: { playerIds: replace(court.currentMatch.teamA.playerIds) },
      teamB: { playerIds: replace(court.currentMatch.teamB.playerIds) },
    };

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId ? { ...c, currentMatch: updatedMatch } : c
    );

    const updated = { ...session, courts: updatedCourts };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts });
  },

  setPriority: (playerId, enabled) => {
    const { session } = get();
    if (!session) return;

    const updatedPlayers = session.players.map((p) =>
      p.id !== playerId
        ? p
        : enabled
        ? { ...p, priority: true, priorityGamesLeft: 2 }
        : { ...p, priority: false, priorityGamesLeft: 0 }
    );

    const updated = { ...session, players: updatedPlayers };
    set({ session: updated });
    updateSession(session.id, { players: updatedPlayers });
  },

  // ============================================
  // LEGACY SCHEDULER (kept for test compat)
  // ============================================

  generateRound: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;
    const previewSession = {
      ...session,
      players: session.players.map((p) =>
        p.attendanceStatus === "PLAYING"
          ? { ...p, attendanceStatus: "PRESENT" as const }
          : p
      ),
    };
    const output = generateNextRound({
      session: previewSession,
      currentTime: Date.now(),
    });
    set({ lastOutput: output });
  },

  applyAssignments: (assignments) => {
    const { session, lastOutput } = get();
    if (!session) return;
    const newRound = lastOutput?.round ?? session.currentRound + 1;
    const now = Date.now();
    const updatedCourts = session.courts.map((court) => {
      const assignment = assignments.find((a) => a.courtId === court.id);
      if (!assignment) return court;
      const match: Match = {
        id: generateId("match"),
        courtId: court.id,
        teamA: assignment.teamA,
        teamB: assignment.teamB,
        result: "PENDING",
        startTime: now,
        endTime: null,
        round: newRound,
      };
      return { ...court, currentMatch: match };
    });
    const updatedPlayers = lastOutput?.updatedPlayers ?? session.players;
    const updated = { ...session, courts: updatedCourts, players: updatedPlayers, currentRound: newRound };
    set({ session: updated, lastOutput: null });
    updateSession(session.id, { courts: updatedCourts, players: updatedPlayers, currentRound: newRound });
  },

  recordResult: async (match, result, scoreA, scoreB) => {
    const { session } = get();
    if (!session) return;

    const now = Date.now();

    // Update stats for players who just finished
    const statsUpdatedPlayers = recordMatchResult(session, match, result, now);

    const completedMatch: Match = { ...match, result, scoreA, scoreB, endTime: now };

    // Claim the global Next Match as this court's new Ready match
    const nm = session.nextMatch ?? null;
    const promotedMatch: Match | null = nm
      ? {
          id: generateId("match"),
          courtId: match.courtId,
          teamA: nm.teamA,
          teamB: nm.teamB,
          result: "PENDING",
          startTime: null, // Ready state — organizer presses Start when ready
          endTime: null,
          round: session.currentRound + 1,
        }
      : null;

    const updatedCourts = session.courts.map((court) => {
      if (court.currentMatch?.id !== match.id) return court;
      return { ...court, currentMatch: promotedMatch };
    });

    const updated: Session = {
      ...session,
      players: statsUpdatedPlayers,
      courts: updatedCourts,
      matchHistory: [...session.matchHistory, completedMatch],
      nextMatch: null, // consumed — will regenerate below
    };

    set({ session: updated });
    await updateSession(session.id, {
      players: statsUpdatedPlayers,
      courts: updatedCourts,
      matchHistory: updated.matchHistory,
      nextMatch: null,
    });

    // Immediately queue the next global match
    get().generateNextMatch();
  },

  // ============================================
  // TEMPLATES
  // ============================================

  saveTemplate: (name) => {
    const { session, templates } = get();
    if (!session) return;

    const template: SessionTemplate = {
      id: generateId("template"),
      name,
      courtCount: session.courts.length,
      courtModes: session.courts.map((c) => c.rotationMode),
      rules: session.rules,
    };

    set({ templates: [...templates, template] });
  },

  loadTemplate: (templateId) => {
    const { templates } = get();
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const session = createDefaultSession(template.name, template.courtCount);
    const courtsWithModes = session.courts.map(
      (court, i) =>
        ({
          ...court,
          rotationMode: template.courtModes[i] ?? "FAIR_PLAY",
          backToBackPolicy:
            template.courtModes[i] === "FAIR_PLAY" ? "STRICT" : "ALLOWED",
        } as Court)
    );

    set({
      session: {
        ...session,
        courts: courtsWithModes,
        rules: template.rules,
      },
      lastOutput: null,
    });
  },
}));