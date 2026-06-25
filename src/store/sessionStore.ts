// ============================================
// SESSION STORE
// Zustand store for managing session state
// ============================================

import { create } from "zustand";
import { generateNextRound, recordMatchResult } from "../engine/scheduler";
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
  // State
  session: Session | null;
  lastOutput: SchedulerOutput | null;
  templates: SessionTemplate[];

  // Session lifecycle
  createSession: (name: string, courtCount: number) => void;
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;

  // Player management
  addPlayer: (player: Omit<Player, "id" | "joinedAt">) => void;
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
  recordResult: (
    match: Match,
    result: "TEAM_A" | "TEAM_B"
  ) => void;
  applyAssignments: (assignments: CourtAssignment[]) => void;

  // Templates
  saveTemplate: (name: string) => void;
  loadTemplate: (templateId: string) => void;
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  lastOutput: null,
  templates: [],

  // ============================================
  // SESSION LIFECYCLE
  // ============================================

  createSession: (name, courtCount) => {
    const session = createDefaultSession(name, courtCount);
    set({ session, lastOutput: null });
  },

  startSession: () => {
    const { session } = get();
    if (!session || session.state !== "SETUP") return;
    set({
      session: {
        ...session,
        state: "ACTIVE",
        startedAt: Date.now(),
      },
    });
  },

  pauseSession: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;
    set({ session: { ...session, state: "PAUSED" } });
  },

  resumeSession: () => {
    const { session } = get();
    if (!session || session.state !== "PAUSED") return;
    set({ session: { ...session, state: "ACTIVE" } });
  },

  endSession: () => {
    const { session } = get();
    if (!session) return;
    set({
      session: {
        ...session,
        state: "ENDED",
        endedAt: Date.now(),
      },
    });
  },

  // ============================================
  // PLAYER MANAGEMENT
  // ============================================

  addPlayer: (playerData) => {
    const { session } = get();
    if (!session) return;

    const newPlayer: Player = {
      ...playerData,
      id: generateId("player"),
      joinedAt: Date.now(),
    };

    set({
      session: {
        ...session,
        players: [...session.players, newPlayer],
      },
    });
  },

  removePlayer: (playerId) => {
    const { session } = get();
    if (!session) return;
    set({
      session: {
        ...session,
        players: session.players.filter((p) => p.id !== playerId),
      },
    });
  },

  updatePlayer: (playerId, updates) => {
    const { session } = get();
    if (!session) return;
    set({
      session: {
        ...session,
        players: session.players.map((p) =>
          p.id === playerId ? { ...p, ...updates } : p
        ),
      },
    });
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
    set({
      session: {
        ...session,
        courts: session.courts.map((c) =>
          c.id === courtId ? { ...c, ...updates } : c
        ),
      },
    });
  },

  // ============================================
  // SCHEDULER
  // ============================================

  generateRound: () => {
    const { session } = get();
    if (!session || session.state !== "ACTIVE") return;

    const output = generateNextRound({
      session,
      currentTime: Date.now(),
    });

    set({
      lastOutput: output,
      session: {
        ...session,
        players: output.updatedPlayers,
        currentRound: output.round,
      },
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

    set({ session: { ...session, courts: updatedCourts } });
  },

  recordResult: (match, result) => {
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
          court.rotationMode === "WINNER_STAYS"
            ? completedMatch
            : null,
      };
    });

    set({
      session: {
        ...session,
        players: updatedPlayers,
        courts: updatedCourts,
        matchHistory: [...session.matchHistory, completedMatch],
      },
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
    const courtsWithModes = session.courts.map((court, i) => ({
      ...court,
      rotationMode: template.courtModes[i] ?? "FAIR_PLAY",
      backToBackPolicy:
        template.courtModes[i] === "WINNER_STAYS" ? "ALLOWED" : "STRICT",
    } as Court));

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