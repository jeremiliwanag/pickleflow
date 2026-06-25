// ============================================
// FAIRNESS ENGINE
// Scores each player for scheduling priority
// Higher score = should play sooner
// ============================================

import type { Player, Session, SkillMatchingSetting } from "../types";
import { skillRatingToNumber } from "../types";

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
// Uses organizer rating if available
// Falls back to self rating
// ============================================

export function getActiveRating(player: Player): number {
  const rating = player.ratings.organizer ?? player.ratings.self;
  return skillRatingToNumber(rating);
}

// ============================================
// SKILL GAP
// Difference between two players' ratings
// ============================================

export function getSkillGap(playerA: Player, playerB: Player): number {
  return Math.abs(getActiveRating(playerA) - getActiveRating(playerB));
}

// ============================================
// SKILL FIT SCORE
// How well does a group of players match skill-wise
// Returns 0 to 1 (1 = perfect match)
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
    // Penalize harder for mismatches
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