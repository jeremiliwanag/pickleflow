// ============================================
// SESSION STORE
// Zustand store with Firebase sync
// ============================================

import { create } from "zustand";
import {
  generateNextRound,
  generateMatchForCourt as generateMatchForCourtEngine,
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

  // Per-court scheduler
  generateMatchForCourt: (courtId: string) => void;
  startMatch: (courtId: string) => void;
  replacePlayerInPending: (courtId: string, outId: string, inId: string) => void;
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
          set({ session: { ...latest, courts: migratedCourts } });
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
    const updated = {
      ...session,
      state: "ACTIVE" as const,
      startedAt: Date.now(),
    };
    set({ session: updated });
    await updateSession(session.id, {
      state: "ACTIVE",
      startedAt: updated.startedAt,
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

    const updated = {
      ...session,
      players: [...session.players, newPlayer],
    };
    set({ session: updated });
    updateSession(session.id, { players: updated.players });
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
    if (!court?.pendingAssignment) return;

    const pa = court.pendingAssignment;
    const assignedIds = new Set([
      ...pa.teamA.playerIds,
      ...pa.teamB.playerIds,
    ]);

    const newRound = session.currentRound + 1;
    const now = Date.now();

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

    const updatedCourts = session.courts.map((c) =>
      c.id === courtId
        ? { ...c, currentMatch: match, pendingAssignment: null }
        : c
    );

    const updatedPlayers = session.players.map((p) =>
      assignedIds.has(p.id)
        ? {
            ...p,
            attendanceStatus: "PLAYING" as const,
            consecutiveGames: p.consecutiveGames + 1,
            waitingSince: null,
          }
        : p
    );

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

    // Update player stats (gamesPlayed, gamesWon, partners, opponents, consecutiveGames, etc.)
    const statsUpdatedPlayers = recordMatchResult(session, match, result, now);

    const completedMatch: Match = { ...match, result, scoreA, scoreB, endTime: now };

    // Find the court for this match
    const thisCourt = session.courts.find((c) => c.currentMatch?.id === match.id);
    const pa = thisCourt?.pendingAssignment ?? null;

    // If there's a pending next match, auto-start it
    let newCurrentMatch: Match | null = null;
    let playersAfterAutoStart = statsUpdatedPlayers;

    if (pa) {
      const assignedIds = new Set([...pa.teamA.playerIds, ...pa.teamB.playerIds]);
      newCurrentMatch = {
        id: generateId("match"),
        courtId: match.courtId,
        teamA: pa.teamA,
        teamB: pa.teamB,
        result: "PENDING",
        startTime: now,
        endTime: null,
        round: session.currentRound + 1,
      };
      // Set newly-starting players to PLAYING
      playersAfterAutoStart = statsUpdatedPlayers.map((p) =>
        assignedIds.has(p.id)
          ? {
              ...p,
              attendanceStatus: "PLAYING" as const,
              consecutiveGames: p.consecutiveGames + 1,
              waitingSince: null,
            }
          : p
      );
    }

    const updatedCourts = session.courts.map((court) => {
      if (court.currentMatch?.id !== match.id) return court;
      return {
        ...court,
        currentMatch: newCurrentMatch,
        pendingAssignment: null, // consumed — we'll auto-generate a new one below
      };
    });

    const newRound = newCurrentMatch ? session.currentRound + 1 : session.currentRound;

    const updated: Session = {
      ...session,
      players: playersAfterAutoStart,
      courts: updatedCourts,
      matchHistory: [...session.matchHistory, completedMatch],
      currentRound: newRound,
    };

    set({ session: updated });
    await updateSession(session.id, {
      players: playersAfterAutoStart,
      courts: updatedCourts,
      matchHistory: updated.matchHistory,
      currentRound: newRound,
    });

    // Auto-generate a new Next Match for this court
    const courtAfter = updatedCourts.find((c) => c.id === match.courtId);
    if (courtAfter && !courtAfter.pendingAssignment) {
      get().generateMatchForCourt(match.courtId);
    }
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