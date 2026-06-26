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
  getTeamBalanceScore,
  getActiveRating,
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
    // Only exclude players whose match is still in progress (PENDING).
    // Completed matches must not block players from the next round.
    if (court.currentMatch && court.currentMatch.result === "PENDING") {
      court.currentMatch.teamA.playerIds.forEach((id) => ids.add(id));
      court.currentMatch.teamB.playerIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

// ============================================
// COMBO SCORER
// Scores one specific 2v2 arrangement.
//
// Weights by mode:
//   FAIR_PLAY:  team balance 60% | partner 25% | opponent 15%
//   SOCIAL:     team balance 30% | partner 45% | opponent 25%
//
// Hard penalties applied when skillMatching is set:
//   STRICT: any individual gap > maxSkillGap  → score × 0.05
//   SOFT:   any individual gap > maxSkillGap×1.5 → score × 0.40
// ============================================

type ScoringMode = "FAIR_PLAY" | "SOCIAL";

function scoreCombo(
  teamA: Player[],
  teamB: Player[],
  session: Session,
  mode: ScoringMode
): number {
  const all4 = [...teamA, ...teamB];
  const ratings = all4.map(getActiveRating);
  const spread = Math.max(...ratings) - Math.min(...ratings);

  // Skill spread: prefer groups of 4 with the smallest rating range.
  // Normalized over 12 points (≈ two full tiers). Spread of 0 → 1.0, spread of 12+ → 0.
  // This is the PRIMARY criterion — it ensures we don't mix Beginners with Advanced players
  // unless truly no better combination exists.
  const spreadScore = Math.max(0, 1 - spread / 12);

  // Team balance: how equal are the two team averages within the chosen 4?
  const balance = getTeamBalanceScore(teamA, teamB);

  const partnerA = getPartnerDiversityScore(teamA[0], teamA[1]);
  const partnerB = getPartnerDiversityScore(teamB[0], teamB[1]);
  const partner = (partnerA + partnerB) / 2;
  const opponent = getOpponentDiversityScore(teamA, teamB);

  let score: number;
  if (mode === "SOCIAL") {
    // Social: variety over skill proximity
    score = spreadScore * 0.10 + balance * 0.25 + partner * 0.45 + opponent * 0.20;
  } else {
    // FAIR_PLAY: minimise spread first, then balance the two teams
    score = spreadScore * 0.45 + balance * 0.35 + partner * 0.15 + opponent * 0.05;
  }

  // Skill gap enforcement from session rules
  const { skillMatching, maxSkillGap } = session.rules;
  if (skillMatching !== "OFF" && maxSkillGap != null) {
    if (skillMatching === "STRICT" && spread > maxSkillGap) {
      score *= 0.05;
    } else if (skillMatching === "SOFT" && spread > maxSkillGap * 1.5) {
      score *= 0.40;
    }
  }

  return score;
}

// ============================================
// BEST TEAM COMBINATION
// Finds the best 2v2 from a candidate pool.
//
// Strategy:
//   1. Priority-rank the pool (who waited longest / played fewest games)
//   2. Take top N candidates (more candidates → better skill matching)
//   3. Try every C(N,4) group-of-4, then all 3 possible 2v2 splits
//   4. Return the split with the highest scoreCombo()
//
// N=8 gives C(8,4)=70 groups × 3 splits = 210 combos — fast.
// N capped at 8 so we still prefer players who most need to play.
// ============================================

function getBestTeamCombo(
  pool: Player[],
  session: Session,
  currentTime: number,
  rng: () => number,
  mode: ScoringMode = "FAIR_PLAY"
): { teamA: Team; teamB: Team } | null {
  if (pool.length < 4) return null;

  const maxGames = Math.max(...session.players.map((p) => p.gamesPlayed), 1);

  const ranked = pool
    .map((p) => ({
      player: p,
      priority: getPlayerPriorityScore(p, currentTime, maxGames),
    }))
    .sort((a, b) => {
      if (Math.abs(a.priority - b.priority) < 0.01) return rng() - 0.5;
      return b.priority - a.priority;
    });

  // Take the top 8 most-deserving players as candidates.
  // Priority ensures wait-time/games-played is respected;
  // the larger pool gives the skill matcher room to find balance.
  const candidates = ranked
    .slice(0, Math.min(8, ranked.length))
    .map((r) => r.player);

  const n = candidates.length;
  let bestScore = -Infinity;
  let best: { teamA: Player[]; teamB: Player[] } | null = null;

  // C(n,4) × 3 splits
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          const four = [candidates[i], candidates[j], candidates[k], candidates[l]];

          // All 3 distinct 2v2 splits of 4 players
          const splits: [[number, number], [number, number]][] = [
            [[0, 1], [2, 3]],
            [[0, 2], [1, 3]],
            [[0, 3], [1, 2]],
          ];

          for (const [[a0, a1], [b0, b1]] of splits) {
            const teamA = [four[a0], four[a1]];
            const teamB = [four[b0], four[b1]];
            const s = scoreCombo(teamA, teamB, session, mode);
            if (s > bestScore) {
              bestScore = s;
              best = { teamA, teamB };
            }
          }
        }
      }
    }
  }

  if (!best) return null;

  return {
    teamA: { playerIds: best.teamA.map((p) => p.id) },
    teamB: { playerIds: best.teamB.map((p) => p.id) },
  };
}

// ============================================
// FAIR PLAY SCHEDULER
// Equal games for everyone + best skill balance
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
    rng,
    "FAIR_PLAY"
  );
  if (!combo) return null;
  return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
}

// ============================================
// WINNER VS WINNER SCHEDULER
// Winners face winners, losers face losers.
// Within each pool, still picks for best balance.
// ============================================

function scheduleWinnerVsWinner(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): CourtAssignment | null {
  const lastRoundMatches = session.matchHistory.filter(
    (m) => m.round === session.currentRound && m.result !== "PENDING"
  );

  const winnerIds = new Set<string>();
  const loserIds = new Set<string>();

  for (const match of lastRoundMatches) {
    const winners =
      match.result === "TEAM_A" ? match.teamA.playerIds : match.teamB.playerIds;
    const losers =
      match.result === "TEAM_A" ? match.teamB.playerIds : match.teamA.playerIds;
    winners.forEach((id) => winnerIds.add(id));
    losers.forEach((id) => loserIds.add(id));
  }

  const availableWinners = availablePlayers.filter((p) => winnerIds.has(p.id));
  const availableLosers = availablePlayers.filter((p) => loserIds.has(p.id));

  if (availableWinners.length >= 4) {
    const combo = getBestTeamCombo(
      availableWinners,
      session,
      currentTime,
      rng,
      "FAIR_PLAY"
    );
    if (combo)
      return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
  }

  if (availableLosers.length >= 4) {
    const combo = getBestTeamCombo(
      availableLosers,
      session,
      currentTime,
      rng,
      "FAIR_PLAY"
    );
    if (combo)
      return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
  }

  return scheduleFairPlay(court, availablePlayers, session, currentTime, rng);
}

// ============================================
// SOCIAL ROTATION SCHEDULER
// Maximize partner + opponent variety.
// Still applies light team balance so it's fun.
// ============================================

function scheduleSocial(
  court: Court,
  availablePlayers: Player[],
  session: Session,
  currentTime: number,
  rng: () => number
): CourtAssignment | null {
  // Social uses a shuffled pool so variety beats strict priority.
  // We still pass through getBestTeamCombo so balance is considered.
  const shuffled = seededShuffle([...availablePlayers], rng);
  const combo = getBestTeamCombo(
    shuffled,
    session,
    currentTime,
    rng,
    "SOCIAL"
  );
  if (!combo) return null;
  return { courtId: court.id, teamA: combo.teamA, teamB: combo.teamB };
}

// ============================================
// STAGE 1 — PLAYER SELECTION
// Decides WHICH four players should play.
// Rotation mode does NOT influence this stage.
//
// Hard rules (never violated):
//   1. No PLAYING players
//   2. No players reserved on another court's pending
//   3. No RESTING or LEFT players
//   4. No back-to-back for normal players (if enough waiting)
//
// Selection order:
//   1. Priority players (⭐ late arrivals) bypass back-to-back rule
//   2. Non-consecutive eligible players, ranked by fairness score
//   3. Consecutive players only if not enough from above
//   4. Among the top-8 fairest, pick the 4 with smallest skill spread
// ============================================

function getReservedIds(session: Session, excludeCourtId: string): Set<string> {
  const ids = new Set<string>();
  for (const c of session.courts) {
    if (c.id === excludeCourtId) continue;
    const pa = c.pendingAssignment ?? null;
    if (pa) {
      pa.teamA.playerIds.forEach((id) => ids.add(id));
      pa.teamB.playerIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

// Given a locked-in anchor player, find the 3 companions from candidates
// that produce the smallest skill spread across all 4.
function selectBestCompanions(anchor: Player, candidates: Player[]): Player[] | null {
  if (candidates.length < 3) return null;
  if (candidates.length === 3) return candidates;

  let bestSpread = Infinity;
  let best: Player[] | null = null;
  const n = candidates.length;

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const group = [anchor, candidates[i], candidates[j], candidates[k]];
        const ratings = group.map(getActiveRating);
        const spread = Math.max(...ratings) - Math.min(...ratings);
        if (spread < bestSpread) {
          bestSpread = spread;
          best = [candidates[i], candidates[j], candidates[k]];
        }
      }
    }
  }

  return best;
}

function selectFourPlayers(
  eligible: Player[],
  session: Session,
  currentTime: number
): Player[] | null {
  if (eligible.length < 4) return null;

  const maxGames = Math.max(...session.players.map((p) => p.gamesPlayed), 1);

  const hasPriority = (p: Player) =>
    p.priority === true && (p.priorityGamesLeft ?? 0) > 0;

  // Hard back-to-back rule applies regardless of court mode.
  // Rotation mode only affects team pairing (Stage 2), never player selection.
  const priorityPlayers = eligible.filter(hasPriority);
  const restPlayers = eligible.filter(
    (p) => !hasPriority(p) && p.consecutiveGames === 0
  );
  const consecutivePlayers = eligible.filter(
    (p) => !hasPriority(p) && p.consecutiveGames > 0
  );

  const primaryPool = [...priorityPlayers, ...restPlayers];
  const pool =
    primaryPool.length >= 4
      ? primaryPool
      : [...primaryPool, ...consecutivePlayers];

  if (pool.length < 4) return null;

  // Rank by fairness — who deserves court time most?
  const ranked = pool
    .map((p) => ({
      player: p,
      score: getPlayerPriorityScore(p, currentTime, maxGames),
    }))
    .sort((a, b) => b.score - a.score);

  // FAIRNESS FIRST: the #1 ranked player is always locked in.
  // They have the strongest claim to court time regardless of skill level.
  // This prevents a solo advanced/beginner player from being perpetually skipped
  // just because they widen the skill spread.
  const mustPlay = ranked[0].player;

  // Among the next 7 most-deserving players, find the 3 that minimise spread
  // when combined with the locked-in player.
  const rest = ranked.slice(1, Math.min(8, ranked.length)).map((r) => r.player);
  const companions = selectBestCompanions(mustPlay, rest);
  if (!companions) return null;

  return [mustPlay, ...companions];
}

// ============================================
// STAGE 2 — TEAM PAIRING
// Given exactly 4 selected players, decide how
// to split them into two teams of 2.
// THIS is where rotation mode matters.
// ============================================

function pairForBalance(four: Player[]): { teamA: Team; teamB: Team } {
  const splits: [[number, number], [number, number]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];

  let best = { tA: [four[0], four[1]], tB: [four[2], four[3]], score: -Infinity };
  for (const [[a0, a1], [b0, b1]] of splits) {
    const tA = [four[a0], four[a1]];
    const tB = [four[b0], four[b1]];
    const score = getTeamBalanceScore(tA, tB);
    if (score > best.score) best = { tA, tB, score };
  }

  return {
    teamA: { playerIds: best.tA.map((p) => p.id) },
    teamB: { playerIds: best.tB.map((p) => p.id) },
  };
}

function pairForVariety(four: Player[]): { teamA: Team; teamB: Team } {
  const splits: [[number, number], [number, number]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];

  let best = { tA: [four[0], four[1]], tB: [four[2], four[3]], score: -Infinity };
  for (const [[a0, a1], [b0, b1]] of splits) {
    const tA = [four[a0], four[a1]];
    const tB = [four[b0], four[b1]];
    const partnerScore =
      (getPartnerDiversityScore(tA[0], tA[1]) + getPartnerDiversityScore(tB[0], tB[1])) / 2;
    const opponentScore = getOpponentDiversityScore(tA, tB);
    const score = partnerScore * 0.6 + opponentScore * 0.4;
    if (score > best.score) best = { tA, tB, score };
  }

  return {
    teamA: { playerIds: best.tA.map((p) => p.id) },
    teamB: { playerIds: best.tB.map((p) => p.id) },
  };
}

function pairWinnersVsWinners(
  four: Player[],
  session: Session
): { teamA: Team; teamB: Team } {
  const lastWon = (player: Player): boolean => {
    for (let i = session.matchHistory.length - 1; i >= 0; i--) {
      const m = session.matchHistory[i];
      const inA = m.teamA.playerIds.includes(player.id);
      const inB = m.teamB.playerIds.includes(player.id);
      if (!inA && !inB) continue;
      if (m.result === "PENDING") continue;
      return m.result === "TEAM_A" ? inA : inB;
    }
    return false;
  };

  const winners = four.filter(lastWon);
  const losers = four.filter((p) => !lastWon(p));

  if (winners.length === 2 && losers.length === 2) {
    return {
      teamA: { playerIds: winners.map((p) => p.id) },
      teamB: { playerIds: losers.map((p) => p.id) },
    };
  }

  return pairForBalance(four);
}

function pairIntoTeams(
  four: Player[],
  court: Court,
  session: Session
): { teamA: Team; teamB: Team } {
  if (court.rotationMode === "WINNER_VS_WINNER") {
    return pairWinnersVsWinners(four, session);
  }
  if (court.rotationMode === "SOCIAL") {
    return pairForVariety(four);
  }
  return pairForBalance(four);
}

// ============================================
// PER-COURT MATCH GENERATOR
// Stage 1 selects the fairest four players.
// Stage 2 pairs them based on this court's mode.
// ============================================

export function generateMatchForCourt(
  court: Court,
  session: Session,
  currentTime: number
): { teamA: Team; teamB: Team } | null {
  if (session.state !== "ACTIVE") return null;

  const playingIds = getPlayingPlayerIds(session);
  const reservedIds = getReservedIds(session, court.id);

  const eligible = getEligiblePlayers(session).filter(
    (p) => !playingIds.has(p.id) && !reservedIds.has(p.id)
  );

  // Stage 1: who plays? (rotation mode plays no role here)
  const four = selectFourPlayers(eligible, session, currentTime);
  if (!four) return null;

  // Stage 2: how are they paired?
  return pairIntoTeams(four, court, session);
}

// ============================================
// MAIN SCHEDULER (used by tests + legacy flow)
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
    assignments.flatMap((a) => [...a.teamA.playerIds, ...a.teamB.playerIds])
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
      result === "TEAM_A" ? match.teamB.playerIds : match.teamA.playerIds;

    const isWinner = winningIds.has(player.id);

    // Decrement priority games left; auto-disable when exhausted
    const priorityGamesLeft = Math.max(0, (player.priorityGamesLeft ?? 0) - 1);
    const priority = priorityGamesLeft > 0 ? player.priority : false;

    return {
      ...player,
      gamesPlayed: player.gamesPlayed + 1,
      gamesWon: isWinner ? player.gamesWon + 1 : player.gamesWon,
      winStreak: isWinner ? (player.winStreak ?? 0) + 1 : 0,
      attendanceStatus: "PRESENT" as const,
      waitingSince: currentTime,
      consecutiveGames: player.consecutiveGames, // reset to 0 happens in startMatch when they sit out
      priority,
      priorityGamesLeft,
      partners: [...player.partners, ...teammates],
      opponents: [...player.opponents, ...opponents],
    };
  });
}
