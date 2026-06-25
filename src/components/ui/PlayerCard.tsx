import type { Player } from "../../types";
import { formatSkillRating } from "../../types";

interface PlayerCardProps {
  player: Player;
  showStatus?: boolean;
  onStatusChange?: (status: Player["attendanceStatus"]) => void;
  compact?: boolean;
  onReplace?: () => void;
}

const AVATAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-600",
  "bg-violet-600",
  "bg-orange-500",
  "bg-pink-600",
  "bg-teal-600",
  "bg-rose-600",
  "bg-indigo-600",
  "bg-amber-500",
  "bg-cyan-600",
];

function getAvatarColor(name: string): string {
  const index =
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const TIER_BADGE_COLORS: Record<string, string> = {
  BEGINNER: "bg-gray-200 text-gray-800 border border-gray-300",
  NOVICE: "bg-blue-100 text-blue-900 border border-blue-300",
  INTERMEDIATE: "bg-yellow-100 text-yellow-900 border border-yellow-300",
  ADVANCED: "bg-orange-100 text-orange-900 border border-orange-300",
  ELITE: "bg-red-100 text-red-900 border border-red-300",
};

export default function PlayerCard({
  player,
  showStatus = false,
  onStatusChange,
  compact = false,
  onReplace,
}: PlayerCardProps) {
  const rating = player.ratings.organizer ?? player.ratings.self;
  const tierColor =
    TIER_BADGE_COLORS[rating.tier] ?? "bg-gray-200 text-gray-800";
  const winRate =
    player.gamesPlayed > 0
      ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
      : null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10 hover:bg-white/20 transition-colors">
        <div
          className={`${getAvatarColor(
            player.name
          )} w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md ring-2 ring-white/20`}
        >
          {getInitials(player.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm leading-tight truncate">
            {player.name}
          </p>
          <p className="text-green-300 text-xs mt-0.5 font-medium">
            {formatSkillRating(rating)}
          </p>
          {winRate !== null && (
            <p className="text-green-400 text-xs">
              {player.gamesWon}W {player.gamesPlayed - player.gamesWon}L
            </p>
          )}
        </div>
        {showStatus && onStatusChange && (
          <div className="flex flex-col gap-1">
            {(
              ["PRESENT", "RESTING", "LEFT"] as Player["attendanceStatus"][]
            ).map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                className={`text-xs px-2 py-0.5 rounded-lg border transition-colors font-medium ${
                  player.attendanceStatus === s
                    ? "bg-white text-green-900 border-white"
                    : "border-white/30 text-white/70 hover:border-white/60"
                }`}
              >
                {s === "PRESENT" ? "In" : s === "RESTING" ? "Rest" : "Left"}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-md hover:shadow-lg transition-shadow p-4 flex flex-col items-center gap-3 relative">
      {onReplace && (
        <button
          onClick={onReplace}
          className="absolute top-2 right-2 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded-lg transition-colors font-semibold border border-orange-200"
        >
          Replace
        </button>
      )}
      <div
        className={`${getAvatarColor(
          player.name
        )} w-20 h-20 rounded-full flex items-center justify-center text-white font-black text-2xl shadow-lg ring-4 ring-gray-100`}
      >
        {getInitials(player.name)}
      </div>
      <div className="text-center">
        <p className="font-black text-gray-900 text-base leading-tight">
          {player.name}
        </p>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-semibold mt-1.5 inline-block ${tierColor}`}
        >
          {formatSkillRating(rating)}
        </span>
      </div>
      {winRate !== null && (
        <p className="text-xs text-gray-600 font-semibold">
          {player.gamesWon}W {player.gamesPlayed - player.gamesWon}L --{" "}
          {winRate}%
        </p>
      )}
    </div>
  );
}