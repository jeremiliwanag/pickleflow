// ============================================
// SESSION STORE
// Zustand store with Firebase sync
// ============================================

import { create } from "zustand";
import { generateNextRound, recordMatchResult } from "../engine/scheduler";
import { saveSession, updateSession } from "../db/sessionDB";
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

  // Scheduler
  generateRound: () => void;
  recordResult: (match: Match, result: "TEAM_A" | "TEAM_B") => Promise<void>;
  applyAssignments: (assignments: CourtAssignment[]) => void;

  // Templates
  saveTemplate: (name: string) => void;
  loadTemplate: (templateId: string) => void;

  // Firebase sync
  syncSession: () => Promise<void>;
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
    set({ session: updated });
    await updateSession(session.id, {
      state: "ENDED",
      endedAt: updated.endedAt,
    });
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
  // SCHEDULER
  // ============================================

  generateRound: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;

    const resetSession = {
      ...session,
      players: session.players.map((p) =>
        p.attendanceStatus === "PLAYING"
          ? { ...p, attendanceStatus: "PRESENT" as const }
          : p
      ),
    };

    const output = generateNextRound({
      session: resetSession,
      currentTime: Date.now(),
    });

    const updated = {
      ...resetSession,
      players: output.updatedPlayers,
      currentRound: output.round,
    };

    set({ lastOutput: output, session: updated });
    updateSession(session.id, {
      players: updated.players,
      currentRound: updated.currentRound,
    });
  },

  applyAssignments: (assignments) => {
    const { session } = get();
    if (!session) return;

    const updatedCourts = session.courts.map((court) => {
      const assignment = assignments.find((a) => a.courtId === court.id);
      if (!assignment) return court;

      const match: Match = {
        id: generateId("match"),
        courtId: court.id,
        teamA: assignment.teamA,
        teamB: assignment.teamB,
        result: "PENDING",
        startTime: Date.now(),
        endTime: null,
        round: session.currentRound,
      };

      return { ...court, currentMatch: match };
    });

    const updated = { ...session, courts: updatedCourts };
    set({ session: updated });
    updateSession(session.id, { courts: updatedCourts });
  },

  recordResult: async (match, result) => {
    const { session } = get();
    if (!session) return;

    const updatedPlayers = recordMatchResult(
      session,
      match,
      result,
      Date.now()
    );

    const completedMatch: Match = {
      ...match,
      result,
      endTime: Date.now(),
    };

    const updatedCourts = session.courts.map((court) => {
      if (court.currentMatch?.id !== match.id) return court;
      return {
        ...court,
        currentMatch:
          null,
      };
    });

    const updated = {
      ...session,
      players: updatedPlayers,
      courts: updatedCourts,
      matchHistory: [...session.matchHistory, completedMatch],
    };

    set({ session: updated });
    await updateSession(session.id, {
      players: updatedPlayers,
      courts: updatedCourts,
      matchHistory: updated.matchHistory,
    });
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