// ============================================
// CORE ENUMS
// ============================================

export type SessionState = "SETUP" | "ACTIVE" | "PAUSED" | "ENDED";

export type RotationMode = "FAIR_PLAY" | "WINNER_VS_WINNER" | "SOCIAL";

export type BackToBackPolicy = "STRICT" | "SOFT" | "ALLOWED";

export type SkillMatchingSetting = "OFF" | "SOFT" | "STRICT";

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "PLAYING"
  | "WAITING"
  | "RESTING"
  | "LEFT";

export type PaymentStatus = "PAID" | "UNPAID";

export type MatchFormat = "TIMED" | "FIRST_TO_11" | "FIRST_TO_15";

export type LeavingSoon = "IN_15" | "IN_30" | "AFTER_NEXT" | null;

// ============================================
// PLAYER
// ============================================

export type SkillTier =
  | "BEGINNER"
  | "NOVICE"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "ELITE";

export interface SkillRating {
  tier: SkillTier;
  division: number; // 1.0 to 5.9 with decimals
}

export interface CommunityRating {
  id: string;
  rating: SkillRating;
  createdAt: number;
}

export interface PlayerRatings {
  self: SkillRating;
  community?: CommunityRating[]; // max 5
  system: SkillRating | null;
  /** @deprecated legacy field — use community ratings instead */
  organizer?: SkillRating | null;
}

export function getActiveRating(ratings: PlayerRatings): SkillRating {
  if ((ratings.community?.length ?? 0) > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const community = ratings.community!;
    const avgDivision =
      community.reduce((sum, r) => sum + r.rating.division, 0) /
      community.length;
    const tiers = community.map((r) => r.rating.tier);
    const tier = tiers.sort(
      (a, b) =>
        tiers.filter((t) => t === b).length -
        tiers.filter((t) => t === a).length
    )[0];
    return { tier, division: parseFloat(avgDivision.toFixed(1)) };
  }
  // Legacy organizer field — used when no community ratings exist
  if (ratings.organizer) {
    return ratings.organizer;
  }
  return ratings.self;
}

// Display: "Novice 2.7"
export function formatSkillRating(rating: SkillRating): string {
  const tier =
    rating.tier.charAt(0) + rating.tier.slice(1).toLowerCase();
  return `${tier} ${rating.division.toFixed(1)}`;
}

// Internal number for scheduler math
// Beginner 1-5, Novice 6-11, Intermediate 12-17, Advanced 18-23, Elite 24-29
export function skillRatingToNumber(rating: SkillRating): number {
  const base: Record<SkillTier, number> = {
    BEGINNER: 0,
    NOVICE: 6,
    INTERMEDIATE: 12,
    ADVANCED: 18,
    ELITE: 24,
  };
  return base[rating.tier] + rating.division;
}

export interface Payment {
  status: PaymentStatus;
  amount?: number;
  method?: "cash" | "gcash" | "card";
  timestamp?: Date;
}

export interface Player {
  id: string;
  name: string;
  ratings: PlayerRatings;
  attendanceStatus: AttendanceStatus;
  payment: Payment;
  leavingSoon: LeavingSoon;
  notes: string;
  photoURL?: string;
  // Stats for this session
  gamesPlayed: number;
  gamesWon: number;
  winStreak?: number;
  waitingSince: number | null; // timestamp in ms
  consecutiveGames: number;
  partners: string[]; // player IDs played with
  opponents: string[]; // player IDs played against
  joinedAt: number; // timestamp in ms
}

// ============================================
// COURT
// ============================================

export interface Court {
  id: string;
  number: number;
  rotationMode: RotationMode;
  backToBackPolicy: BackToBackPolicy;
  currentMatch: Match | null;
  isActive: boolean;
}

// ============================================
// MATCH
// ============================================

export interface Team {
  playerIds: string[];
}

export type MatchResult = "TEAM_A" | "TEAM_B" | "PENDING";

export interface Match {
  id: string;
  courtId: string;
  teamA: Team;
  teamB: Team;
  result: MatchResult;
  scoreA?: number;
  scoreB?: number;
  startTime: number | null; // timestamp in ms
  endTime: number | null;
  round: number;
}

// ============================================
// SESSION
// ============================================

export interface SessionRules {
  matchFormat: MatchFormat;
  matchDurationMinutes: number;
  skillMatching: SkillMatchingSetting;
  maxSkillGap: number;
}

export interface Session {
  id: string;
  name: string;
  state: SessionState;
  courts: Court[];
  players: Player[];
  rules: SessionRules;
  matchHistory: Match[];
  currentRound: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

// ============================================
// SCHEDULER
// ============================================

export interface PlayerScore {
  playerId: string;
  priorityScore: number;
  breakdown: {
    gamesPlayedScore: number;
    waitTimeScore: number;
    consecutiveScore: number;
    skillFitScore: number;
    partnerDiversityScore: number;
    opponentDiversityScore: number;
  };
}

export interface SchedulerInput {
  session: Session;
  currentTime: number; // timestamp in ms
}

export interface CourtAssignment {
  courtId: string;
  teamA: Team;
  teamB: Team;
}

export interface SchedulerOutput {
  assignments: CourtAssignment[];
  updatedPlayers: Player[];
  fairnessScore: number;
  round: number;
}

// ============================================
// PLAYER HISTORY
// ============================================

export interface PlayerSessionRecord {
  id: string; // `${playerId}_${sessionId}`
  playerId: string;
  sessionId: string;
  sessionName: string;
  date: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number; // 0–100
  peakWinStreak: number;
}

// ============================================
// SESSION TEMPLATE
// ============================================

export interface SessionTemplate {
  id: string;
  name: string;
  courtCount: number;
  courtModes: RotationMode[];
  rules: SessionRules;
}