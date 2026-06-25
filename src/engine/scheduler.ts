// ============================================
// SCHEDULER ENGINE
// The core of PickleFlow
// Decides who plays next on each court
// ============================================

import type {
  Session,
  Player,
  Court,
  Match,
  Team,
  CourtAssignment,
  SchedulerInput,
  SchedulerOutput,
} from "../types";

import {
  getPlayerPriorityScore,
  getPartnerDiversityScore,
  getOpponentDiversityScore,
  getSkillFitScore,
  getSessionFairnessScore,
} from "./fairness";

import { mulberry32, generateSeed, seededShuffle } from "../utils/random";

// ============================================
// HELPERS
// ============================================

function getEligiblePlayers(session: Session): Player[] {
  return session.players.filter(
    (p) =>
      p.attendanceStatus === "PRESENT" ||
      p.attendanceStatus === "WAITING"
  );
}

function getPlayingPlayerIds(session: Session): Set<string> {
  const ids = new Set<string>();
  for (const court of session.courts) {
    if (court.currentMatch) {
      court.currentMatch.teamA.playerIds.forEach((id) => ids.add(id));
      court.currentMatch.teamB.playerIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

// ============================================
// BEST TEAM COMBINATION
// Given a pool of players, find the best
// 2v2 combination for a court
// ============================================

function getBestTeamCombo(
  pool: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): { teamA: Team; teamB: Team } | null {
  if (pool.length < 4) return null;

  const maxGames = Math.max(...session.players.map((p) => p.gamesPlayed), 1);

  // Score each player individually first
  const scored = pool.map((p) => ({
    player: p,
    priority: getPlayerPriorityScore(p, currentTime, maxGames),
  }));

  // Sort by priority descending, use seeded random for tiebreaking
  scored.sort((a, b) => {
    if (Math.abs(a.priority - b.priority) < 0.01) {
      return rng() - 0.5;
    }
    return b.priority - a.priority;
  });

  // Take top 4 candidates
  const top4 = scored.slice(0, 4).map((s) => s.player);

  // Try all possible 2v2 combinations from top 4
  // C(4,2) = 6 combinations
  const combos: Array<{ teamA: Player[]; teamB: Player[]; score: number }> = [];

  const indices = [0, 1, 2, 3];
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      const teamAPlayers = [top4[i], top4[j]];
      const teamBPlayers = indices
        .filter((idx) => idx !== i && idx !== j)
        .map((idx) => top4[idx]);

      const partnerScore =
        getPartnerDiversityScore(teamAPlayers[0], teamAPlayers[1]) +
        getPartnerDiversityScore(teamBPlayers[0], teamBPlayers[1]);

      const opponentScore = getOpponentDiversityScore(
        teamAPlayers,
        teamBPlayers
      );

      const skillScore = getSkillFitScore(
        [...teamAPlayers, ...teamBPlayers],
        session.rules.skillMatching
      );

      combos.push({
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        score: partnerScore * 0.4 + opponentScore * 0.3 + skillScore * 0.3,
      });
    }
  }

  // Pick best combo
  combos.sort((a, b) => b.score - a.score);
  const best = combos[0];

  return {
    teamA: { playerIds: best.teamA.map((p) => p.id) },
    teamB: { playerIds: best.teamB.map((p) => p.id) },
  };
}

// ============================================
// FAIR PLAY SCHEDULER
// Assigns players purely by fairness
// ============================================

function scheduleFairPlay(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): CourtAssignment | null {
  const combo = getBestTeamCombo(
    availablePlayers,
    session,
    currentTime,
    rng
  );

  if (!combo) return null;

  return {
    courtId: court.id,
    teamA: combo.teamA,
    teamB: combo.teamB,
  };
}

// ============================================
// WINNER STAYS SCHEDULER
// Winning team stays, new challengers rotate in
// ============================================

function scheduleWinnerStays(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): CourtAssignment | null {
  const lastMatch = court.currentMatch;

  // If there's a winner staying on this court
  if (lastMatch && lastMatch.result !== "PENDING") {
    const winningTeam =
      lastMatch.result === "TEAM_A" ? lastMatch.teamA : lastMatch.teamB;

    // Filter out the winning team players from available pool
    const challengerPool = availablePlayers.filter(
      (p) => !winningTeam.playerIds.includes(p.id)
    );

    if (challengerPool.length < 2) return null;

    // Pick best 2 challengers
    const maxGames = Math.max(
      ...session.players.map((p) => p.gamesPlayed),
      1
    );

    const scored = challengerPool
      .map((p) => ({
        player: p,
        priority: getPlayerPriorityScore(p, currentTime, maxGames),
      }))
      .sort((a, b) => b.priority - a.priority);

    const challengers = scored.slice(0, 2).map((s) => s.player);

    return {
      courtId: court.id,
      teamA: winningTeam,
      teamB: { playerIds: challengers.map((p) => p.id) },
    };
  }

  // No winner yet -- treat like Fair Play for first match
  return scheduleFairPlay(court, availablePlayers, session, currentTime, rng);
}

// ============================================
// MAIN SCHEDULER FUNCTION
// Entry point -- call this to get next round
// ============================================

export function generateNextRound(input: SchedulerInput): SchedulerOutput {
  const { session, currentTime } = input;

  if (session.state !== "ACTIVE") {
    return {
      assignments: [],
      updatedPlayers: session.players,
      fairnessScore: getSessionFairnessScore(session),
      round: session.currentRound,
    };
  }

  const rng = mulberry32(generateSeed());
  const playingIds = getPlayingPlayerIds(session);

  // Only players not currently on a court
  const eligiblePlayers = getEligiblePlayers(session).filter(
    (p) => !playingIds.has(p.id)
  );

  const assignments: CourtAssignment[] = [];
  const usedPlayerIds = new Set<string>();

  // Shuffle courts slightly for fairness across courts
  const shuffledCourts = seededShuffle([...session.courts], rng);

  for (const court of shuffledCourts) {
    if (!court.isActive) continue;

    // Players not yet assigned this round
    const availableForCourt = eligiblePlayers.filter(
      (p) => !usedPlayerIds.has(p.id)
    );

    let assignment: CourtAssignment | null = null;

    if (court.rotationMode === "FAIR_PLAY") {
      assignment = scheduleFairPlay(
        court,
        availableForCourt,
        session,
        currentTime,
        rng
      );
    } else if (court.rotationMode === "WINNER_STAYS") {
      assignment = scheduleWinnerStays(
        court,
        availableForCourt,
        session,
        currentTime,
        rng
      );
    }

    if (assignment) {
      assignments.push(assignment);
      assignment.teamA.playerIds.forEach((id) => usedPlayerIds.add(id));
      assignment.teamB.playerIds.forEach((id) => usedPlayerIds.add(id));
    }
  }

  // Update player states based on assignments
  const assignedIds = new Set(
    assignments.flatMap((a) => [
      ...a.teamA.playerIds,
      ...a.teamB.playerIds,
    ])
  );

  const updatedPlayers = session.players.map((player) => {
    if (assignedIds.has(player.id)) {
      return {
        ...player,
        attendanceStatus: "PLAYING" as const,
        consecutiveGames: player.consecutiveGames + 1,
        waitingSince: null,
      };
    }

    // Player is waiting
    if (
      player.attendanceStatus === "PRESENT" ||
      player.attendanceStatus === "WAITING"
    ) {
      return {
        ...player,
        attendanceStatus: "WAITING" as const,
        consecutiveGames: 0,
        waitingSince: player.waitingSince ?? currentTime,
      };
    }

    return player;
  });

  return {
    assignments,
    updatedPlayers,
    fairnessScore: getSessionFairnessScore(session),
    round: session.currentRound + 1,
  };
}

// ============================================
// RECORD MATCH RESULT
// Call this when a match ends
// Updates player stats
// ============================================

export function recordMatchResult(
  session: Session,
  match: Match,
  result: "TEAM_A" | "TEAM_B",
  currentTime: number
): Player[] {
  const winningIds = new Set(
    result === "TEAM_A"
      ? match.teamA.playerIds
      : match.teamB.playerIds
  );

  const allMatchPlayerIds = new Set([
    ...match.teamA.playerIds,
    ...match.teamB.playerIds,
  ]);

  return session.players.map((player) => {
    if (!allMatchPlayerIds.has(player.id)) return player;

    const teammates =
      result === "TEAM_A"
        ? match.teamA.playerIds.filter((id) => id !== player.id)
        : match.teamB.playerIds.filter((id) => id !== player.id);

    const opponents =
      result === "TEAM_A"
        ? match.teamB.playerIds
        : match.teamA.playerIds;

    return {
      ...player,
      gamesPlayed: player.gamesPlayed + 1,
      gamesWon: winningIds.has(player.id)
        ? player.gamesWon + 1
        : player.gamesWon,
      attendanceStatus: "PRESENT" as const,
      waitingSince: currentTime,
      partners: [...player.partners, ...teammates],
      opponents: [...player.opponents, ...opponents],
    };
  });
}