// ============================================
// SCHEDULER ENGINE
// Core of PickleFlow
// Handles Fair Play, Winner vs Winner, Social
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
// Finds best 2v2 from a pool of players
// ============================================

function getBestTeamCombo(
  pool: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): { teamA: Team; teamB: Team } | null {
  if (pool.length < 4) return null;

  const maxGames = Math.max(...session.players.map((p) => p.gamesPlayed), 1);

  const scored = pool.map((p) => ({
    player: p,
    priority: getPlayerPriorityScore(p, currentTime, maxGames),
  }));

  scored.sort((a, b) => {
    if (Math.abs(a.priority - b.priority) < 0.01) return rng() - 0.5;
    return b.priority - a.priority;
  });

  const top4 = scored.slice(0, 4).map((s) => s.player);

  const combos: Array<{
    teamA: Player[];
    teamB: Player[];
    score: number;
  }> = [];

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

  combos.sort((a, b) => b.score - a.score);
  const best = combos[0];

  return {
    teamA: { playerIds: best.teamA.map((p) => p.id) },
    teamB: { playerIds: best.teamB.map((p) => p.id) },
  };
}

// ============================================
// FAIR PLAY SCHEDULER
// Pure fairness -- equal games for everyone
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
  return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
}

// ============================================
// WINNER VS WINNER SCHEDULER
// Winners face winners, losers face losers
// Teams remixed by skill within each pool
// ============================================

function scheduleWinnerVsWinner(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): CourtAssignment | null {
  // Get last round match results
  const lastRoundMatches = session.matchHistory.filter(
    (m) => m.round === session.currentRound && m.result !== "PENDING"
  );

  // Build winner and loser pools
  const winnerIds = new Set<string>();
  const loserIds = new Set<string>();

  for (const match of lastRoundMatches) {
    const winners =
      match.result === "TEAM_A"
        ? match.teamA.playerIds
        : match.teamB.playerIds;
    const losers =
      match.result === "TEAM_A"
        ? match.teamB.playerIds
        : match.teamA.playerIds;
    winners.forEach((id) => winnerIds.add(id));
    losers.forEach((id) => loserIds.add(id));
  }

  const availableWinners = availablePlayers.filter((p) =>
    winnerIds.has(p.id)
  );
  const availableLosers = availablePlayers.filter((p) =>
    loserIds.has(p.id)
  );

  // Try winners pool first, then losers, then fall back to fair play
  if (availableWinners.length >= 4) {
    const combo = getBestTeamCombo(
      availableWinners,
      session,
      currentTime,
      rng
    );
    if (combo)
      return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
  }

  if (availableLosers.length >= 4) {
    const combo = getBestTeamCombo(
      availableLosers,
      session,
      currentTime,
      rng
    );
    if (combo)
      return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
  }

  // Fall back to fair play if pools are too small
  return scheduleFairPlay(court, availablePlayers, session, currentTime, rng);
}

// ============================================
// SOCIAL ROTATION SCHEDULER
// Maximize partner and opponent variety
// ============================================

function scheduleSocial(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  _currentTime: number,
  rng: () => number
): CourtAssignment | null {
  if (availablePlayers.length < 4) return null;

  const maxGames = Math.max(...session.players.map((p) => p.gamesPlayed), 1);

  // Score purely on diversity -- ignore priority score mostly
  const shuffled = seededShuffle([...availablePlayers], rng);
  const top6 = shuffled.slice(0, Math.min(6, shuffled.length));

  const combos: Array<{
    teamA: Player[];
    teamB: Player[];
    score: number;
  }> = [];

  for (let i = 0; i < top6.length; i++) {
    for (let j = i + 1; j < top6.length; j++) {
      for (let k = 0; k < top6.length; k++) {
        for (let l = k + 1; l < top6.length; l++) {
          if (i === k || i === l || j === k || j === l) continue;
          const teamA = [top6[i], top6[j]];
          const teamB = [top6[k], top6[l]];

          const partnerScore =
            getPartnerDiversityScore(teamA[0], teamA[1]) +
            getPartnerDiversityScore(teamB[0], teamB[1]);

          const opponentScore = getOpponentDiversityScore(teamA, teamB);

          const fairScore =
            maxGames > 0
              ? (2 -
                  (teamA[0].gamesPlayed +
                    teamA[1].gamesPlayed +
                    teamB[0].gamesPlayed +
                    teamB[1].gamesPlayed) /
                    (maxGames * 4)) *
                0.3
              : 0;

          combos.push({
            teamA,
            teamB,
            score: partnerScore * 0.45 + opponentScore * 0.35 + fairScore,
          });
        }
      }
    }
  }

  if (combos.length === 0) return null;

  combos.sort((a, b) => b.score - a.score);
  const best = combos[0];

  return {
    courtId: court.id,
    teamA: { playerIds: best.teamA.map((p) => p.id) },
    teamB: { playerIds: best.teamB.map((p) => p.id) },
  };
}

// ============================================
// MAIN SCHEDULER
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

  const eligiblePlayers = getEligiblePlayers(session).filter(
    (p) => !playingIds.has(p.id)
  );

  const assignments: CourtAssignment[] = [];
  const usedPlayerIds = new Set<string>();

  const shuffledCourts = seededShuffle([...session.courts], rng);

  for (const court of shuffledCourts) {
    if (!court.isActive) continue;

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
    } else if (court.rotationMode === "WINNER_VS_WINNER") {
      assignment = scheduleWinnerVsWinner(
        court,
        availableForCourt,
        session,
        currentTime,
        rng
      );
    } else if (court.rotationMode === "SOCIAL") {
      assignment = scheduleSocial(
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
// ============================================

export function recordMatchResult(
  session: Session,
  match: Match,
  result: "TEAM_A" | "TEAM_B",
  currentTime: number
): Player[] {
  const winningIds = new Set(
    result === "TEAM_A" ? match.teamA.playerIds : match.teamB.playerIds
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