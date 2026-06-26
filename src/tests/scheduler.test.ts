// ============================================
// SCHEDULER TESTS
// Run with: npx vitest
// ============================================

import { describe, it, expect } from "vitest";
import { generateNextRound, recordMatchResult } from "../engine/scheduler";
import { getSessionFairnessScore, getActiveRating } from "../engine/fairness";
import type { Session, Player, Court, Match, SkillTier } from "../types";
import { skillRatingToNumber } from "../types";

// ============================================
// TEST HELPERS
// ============================================

function makePlayer(
  id: string,
  name: string,
  selfTier: SkillTier,
  selfDivision: number,
  orgTier?: SkillTier,
  orgDivision?: number
): Player {
  return {
    id,
    name,
    ratings: {
      self: { tier: selfTier, division: selfDivision },
      organizer:
        orgTier && orgDivision
          ? { tier: orgTier, division: orgDivision }
          : null,
      system: null,
    },
    attendanceStatus: "PRESENT",
    payment: { status: "UNPAID" },
    leavingSoon: null,
    notes: "",
    gamesPlayed: 0,
    gamesWon: 0,
    waitingSince: null,
    consecutiveGames: 0,
    partners: [],
    opponents: [],
    joinedAt: Date.now(),
  };
}

function makeCourt(
  id: string,
  number: number,
  mode: "FAIR_PLAY" | "WINNER_VS_WINNER" | "SOCIAL"
): Court {
  return {
    id,
    number,
    rotationMode: mode,
    backToBackPolicy: mode === "FAIR_PLAY" ? "STRICT" : "ALLOWED",
    currentMatch: null,
    isActive: true,
  };
}

function makeSession(players: Player[], courts: Court[]): Session {
  return {
    id: "session_test",
    name: "Test Session",
    state: "ACTIVE",
    courts,
    players,
    rules: {
      matchFormat: "TIMED",
      matchDurationMinutes: 15,
      skillMatching: "SOFT",
      maxSkillGap: 1.5,
    },
    matchHistory: [],
    currentRound: 0,
    createdAt: Date.now(),
    startedAt: Date.now(),
    endedAt: null,
  };
}

// ============================================
// TEST DATA -- 16 PLAYERS
// ============================================

const TEST_PLAYERS = [
  makePlayer("p1", "Toni", "ADVANCED", 4.5, "ADVANCED", 4.5),
  makePlayer("p2", "Carlo", "ADVANCED", 4.0, "ADVANCED", 4.0),
  makePlayer("p3", "Paolo", "ADVANCED", 4.0, "ADVANCED", 4.0),
  makePlayer("p4", "Grace", "INTERMEDIATE", 3.5, "INTERMEDIATE", 3.5),
  makePlayer("p5", "Jeremi", "INTERMEDIATE", 3.5, "INTERMEDIATE", 3.5),
  makePlayer("p6", "Rico", "INTERMEDIATE", 3.5, "INTERMEDIATE", 3.5),
  makePlayer("p7", "Raffy", "INTERMEDIATE", 3.5, "INTERMEDIATE", 3.5),
  makePlayer("p8", "Donna", "INTERMEDIATE", 3.0, "INTERMEDIATE", 3.0),
  makePlayer("p9", "Mark", "INTERMEDIATE", 3.0, "INTERMEDIATE", 3.0),
  makePlayer("p10", "Claire", "INTERMEDIATE", 3.0, "INTERMEDIATE", 3.0),
  makePlayer("p11", "Jojo", "NOVICE", 2.5, "NOVICE", 2.5),
  makePlayer("p12", "Ana", "NOVICE", 2.5, "NOVICE", 2.5),
  makePlayer("p13", "Emman", "NOVICE", 2.5, "NOVICE", 2.5),
  makePlayer("p14", "Bea", "NOVICE", 2.0, "NOVICE", 2.0),
  makePlayer("p15", "Mia", "NOVICE", 2.0, "NOVICE", 2.0),
  makePlayer("p16", "Liza", "NOVICE", 2.0, "NOVICE", 2.0),
];

const TEST_COURTS = [
  makeCourt("c1", 1, "FAIR_PLAY"),
  makeCourt("c2", 2, "FAIR_PLAY"),
  makeCourt("c3", 3, "FAIR_PLAY"),
];

// ============================================
// TESTS
// ============================================

describe("Scheduler -- Basic Round Generation", () => {
  it("should assign exactly 12 players across 3 courts", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    const assignedIds = new Set(
      output.assignments.flatMap((a) => [
        ...a.teamA.playerIds,
        ...a.teamB.playerIds,
      ])
    );

    expect(output.assignments.length).toBe(3);
    expect(assignedIds.size).toBe(12);
  });

  it("should not assign same player to two courts", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    const allIds = output.assignments.flatMap((a) => [
      ...a.teamA.playerIds,
      ...a.teamB.playerIds,
    ]);

    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });

  it("should assign 4 players per court", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    for (const assignment of output.assignments) {
      const total =
        assignment.teamA.playerIds.length +
        assignment.teamB.playerIds.length;
      expect(total).toBe(4);
    }
  });

  it("should leave 4 players waiting with 16 players and 3 courts", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    const assignedIds = new Set(
      output.assignments.flatMap((a) => [
        ...a.teamA.playerIds,
        ...a.teamB.playerIds,
      ])
    );

    const waiting = output.updatedPlayers.filter(
      (p) => !assignedIds.has(p.id)
    );

    expect(waiting.length).toBe(4);
  });
});

describe("Scheduler -- Session State Guard", () => {
  it("should return empty assignments when session is in SETUP state", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    session.state = "SETUP";
    const output = generateNextRound({ session, currentTime: Date.now() });
    expect(output.assignments.length).toBe(0);
  });

  it("should return empty assignments when session is PAUSED", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    session.state = "PAUSED";
    const output = generateNextRound({ session, currentTime: Date.now() });
    expect(output.assignments.length).toBe(0);
  });

  it("should return empty assignments when session is ENDED", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    session.state = "ENDED";
    const output = generateNextRound({ session, currentTime: Date.now() });
    expect(output.assignments.length).toBe(0);
  });
});

describe("Scheduler -- Fairness", () => {
  it("should start with 100 fairness score when no games played", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const score = getSessionFairnessScore(session);
    expect(score).toBe(100);
  });

  it("should never assign the same player twice in one round", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);

    for (let round = 0; round < 5; round++) {
      const output = generateNextRound({
        session,
        currentTime: Date.now() + round * 60000,
      });

      const allIds = output.assignments.flatMap((a) => [
        ...a.teamA.playerIds,
        ...a.teamB.playerIds,
      ]);

      const unique = new Set(allIds);
      expect(allIds.length).toBe(unique.size);
    }
  });
});

describe("Scheduler -- Record Match Result", () => {
  it("should increment gamesPlayed for all match participants", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    const firstAssignment = output.assignments[0];
    const match: Match = {
      id: "match_test_1",
      courtId: firstAssignment.courtId,
      teamA: firstAssignment.teamA,
      teamB: firstAssignment.teamB,
      result: "TEAM_A",
      startTime: Date.now(),
      endTime: Date.now() + 900000,
      round: 1,
    };

    const updatedSession = {
      ...session,
      players: output.updatedPlayers,
    };

    const updatedPlayers = recordMatchResult(
      updatedSession,
      match,
      "TEAM_A",
      Date.now()
    );

    const matchPlayerIds = new Set([
      ...match.teamA.playerIds,
      ...match.teamB.playerIds,
    ]);

    for (const player of updatedPlayers) {
      if (matchPlayerIds.has(player.id)) {
        expect(player.gamesPlayed).toBe(1);
      }
    }
  });

  it("should only increment gamesWon for winning team", () => {
    const session = makeSession([...TEST_PLAYERS], [...TEST_COURTS]);
    const output = generateNextRound({ session, currentTime: Date.now() });

    const firstAssignment = output.assignments[0];
    const match: Match = {
      id: "match_test_2",
      courtId: firstAssignment.courtId,
      teamA: firstAssignment.teamA,
      teamB: firstAssignment.teamB,
      result: "TEAM_A",
      startTime: Date.now(),
      endTime: Date.now() + 900000,
      round: 1,
    };

    const updatedSession = { ...session, players: output.updatedPlayers };
    const updatedPlayers = recordMatchResult(
      updatedSession,
      match,
      "TEAM_A",
      Date.now()
    );

    for (const player of updatedPlayers) {
      if (match.teamA.playerIds.includes(player.id)) {
        expect(player.gamesWon).toBe(1);
      }
      if (match.teamB.playerIds.includes(player.id)) {
        expect(player.gamesWon).toBe(0);
      }
    }
  });
});

describe("Scheduler -- Active Rating", () => {
  it("should average self and organizer ratings when organizer is present", () => {
    // self = NOVICE 2.5 → 8.5, organizer = INTERMEDIATE 3.8 → 15.8
    // numeric avg = 12.15 → INTERMEDIATE div 0.15, clamped to 1.0 → number 13
    const player = makePlayer("px", "Test", "NOVICE", 2.5, "INTERMEDIATE", 3.8);
    expect(getActiveRating(player)).toBe(13);
  });

  it("should fall back to self rating when organizer rating is null", () => {
    const player = makePlayer("px", "Test", "NOVICE", 2.5);
    expect(getActiveRating(player)).toBe(
      skillRatingToNumber({ tier: "NOVICE", division: 2.5 })
    );
  });
});