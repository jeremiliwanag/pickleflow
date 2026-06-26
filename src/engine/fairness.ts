// ============================================
// FAIRNESS ENGINE
// Scores each player for scheduling priority
// Higher score = should play sooner
// ============================================

import type { Player, Session, SkillMatchingSetting } from "../types";
import { skillRatingToNumber, getActiveRating as getActiveSkillRating } from "../types";

// Weight constants -- adjust these to tune fairness
const WEIGHTS = {
  gamesPlayed: 40,
  waitTime: 30,
  consecutive: 15,
  partnerDiversity: 10,
  opponentDiversity: 5,
};

// ============================================
// ACTIVE RATING
// Uses community rating if available, else self rating
// ============================================

export function getActiveRating(player: Player): number {
  return skillRatingToNumber(getActiveSkillRating(player.ratings));
}

// ============================================
// SKILL GAP
// Difference between two players' ratings
// ============================================

export function getSkillGap(playerA: Player, playerB: Player): number {
  return Math.abs(getActiveRating(playerA) - getActiveRating(playerB));
}

// ============================================
// TEAM BALANCE SCORE  ← THE KEY METRIC
// How close are the two team averages?
// Returns 0 to 1 (1 = perfectly balanced)
//
// A gap of 0   → 1.00 (identical team averages)
// A gap of 0.3 → 0.55 (slight imbalance, acceptable)
// A gap of 0.5 → 0.25 (noticeable)
// A gap of 0.7+→ 0.00 (lopsided, one team clearly stronger)
//
// Uses 1 - (gap * 1.5)^1.5 so small gaps are still rewarded
// and the curve drops steeply past 0.5
// ============================================

export function getTeamBalanceScore(
  teamA: Player[],
  teamB: Player[]
): number {
  const avgA =
    teamA.reduce((s, p) => s + getActiveRating(p), 0) / teamA.length;
  const avgB =
    teamB.reduce((s, p) => s + getActiveRating(p), 0) / teamB.length;
  const gap = Math.abs(avgA - avgB);
  // Steeper curve so 0.5 gap scores ~0.25 (not still "ok")
  return Math.max(0, 1 - Math.pow(gap * 1.5, 1.5));
}

// ============================================
// SKILL FIT SCORE
// Is there a wildly mismatched individual in the group?
// Used as a penalty multiplier when maxSkillGap is set.
// Returns 0 to 1 (1 = all players similar skill)
// ============================================

export function getSkillFitScore(
  players: Player[],
  setting: SkillMatchingSetting
): number {
  if (setting === "OFF") return 1;

  const ratings = players.map(getActiveRating);
  const max = Math.max(...ratings);
  const min = Math.min(...ratings);
  const gap = max - min;

  // Gap of 0 = perfect, gap of 2+ = poor
  const score = Math.max(0, 1 - gap / 2);

  if (setting === "STRICT") {
    return score * score;
  }

  return score;
}

// ============================================
// PARTNER DIVERSITY SCORE
// Have these two players been partners before?
// Returns 0 to 1 (1 = never played together)
// ============================================

export function getPartnerDiversityScore(
  playerA: Player,
  playerB: Player
): number {
  const timesTogether = playerA.partners.filter(
    (id) => id === playerB.id
  ).length;
  return Math.max(0, 1 - timesTogether * 0.3);
}

// ============================================
// OPPONENT DIVERSITY SCORE
// Have these players faced each other before?
// Returns 0 to 1 (1 = never faced)
// ============================================

export function getOpponentDiversityScore(
  teamA: Player[],
  teamB: Player[]
): number {
  let totalFaceoffs = 0;
  for (const a of teamA) {
    for (const b of teamB) {
      totalFaceoffs += a.opponents.filter((id) => id === b.id).length;
    }
  }
  return Math.max(0, 1 - totalFaceoffs * 0.15);
}

// ============================================
// PLAYER PRIORITY SCORE
// Higher = should be scheduled sooner
// ============================================

export function getPlayerPriorityScore(
  player: Player,
  currentTime: number,
  maxGamesInSession: number
): number {
  // ⭐ Priority players (late arrivals) always go first — massive boost
  const hasPriority = player.priority === true && (player.priorityGamesLeft ?? 0) > 0;
  if (hasPriority) return 1000;

  // Games played -- fewer games = higher priority
  const gamesScore =
    maxGamesInSession > 0
      ? (1 - player.gamesPlayed / maxGamesInSession) * WEIGHTS.gamesPlayed
      : WEIGHTS.gamesPlayed;

  // Wait time -- longer wait = higher priority
  const waitMs =
    player.waitingSince !== null ? currentTime - player.waitingSince : 0;
  const waitMinutes = waitMs / 60000;
  const waitScore = Math.min(waitMinutes / 30, 1) * WEIGHTS.waitTime;

  // Consecutive games -- more consecutive = lower priority
  const consecutiveScore =
    Math.max(0, 1 - player.consecutiveGames * 0.5) * WEIGHTS.consecutive;

  return gamesScore + waitScore + consecutiveScore;
}

// ============================================
// SESSION FAIRNESS SCORE
// Overall fairness of the session 0 to 100
// Based on spread of games played across players
// ============================================

export function getSessionFairnessScore(session: Session): number {
  const activePlayers = session.players.filter(
    (p) =>
      p.attendanceStatus !== "ABSENT" && p.attendanceStatus !== "LEFT"
  );

  if (activePlayers.length === 0) return 100;

  const games = activePlayers.map((p) => p.gamesPlayed);
  const max = Math.max(...games);
  const min = Math.min(...games);
  const spread = max - min;

  // Spread of 0 = 100%, spread of 3+ = drops fast
  const score = Math.max(0, 100 - spread * 15);
  return Math.round(score);
}
