import { useState, useRef } from "react";
import type { Player, SkillTier } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";

interface PlayerProfileProps {
  player: Player;
  onClose: () => void;
  onRatePlayer: (tier: SkillTier, division: number) => void;
  onPhotoUpload: (file: File) => Promise<void>;
}

const TIERS: SkillTier[] = [
  "BEGINNER",
  "NOVICE",
  "INTERMEDIATE",
  "ADVANCED",
  "ELITE",
];

const TIER_LABELS: Record<SkillTier, string> = {
  BEGINNER: "Beginner",
  NOVICE: "Novice",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ELITE: "Elite",
};

const TIER_BADGE_COLORS: Record<SkillTier, string> = {
  BEGINNER: "bg-gray-200 text-gray-800 border border-gray-300",
  NOVICE: "bg-blue-100 text-blue-900 border border-blue-300",
  INTERMEDIATE: "bg-yellow-100 text-yellow-900 border border-yellow-300",
  ADVANCED: "bg-orange-100 text-orange-900 border border-orange-300",
  ELITE: "bg-red-100 text-red-900 border border-red-300",
};

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

export default function PlayerProfile({
  player,
  onClose,
  onRatePlayer,
  onPhotoUpload,
}: PlayerProfileProps) {
  const [rateTier, setRateTier] = useState<SkillTier>("INTERMEDIATE");
  const [rateDivision, setRateDivision] = useState(3.0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRating = getActiveRating(player.ratings);
  const communityCount = player.ratings.community?.length ?? 0;
  const winRate =
    player.gamesPlayed > 0
      ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
      : null;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > 1024 * 1024) {
      setUploadError("File must be 1MB or less");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError("Only JPEG and PNG files are accepted");
      return;
    }
    setUploading(true);
    try {
      await onPhotoUpload(file);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitRating = () => {
    onRatePlayer(rateTier, rateDivision);
    setSubmitted(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900 text-lg">Player Profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 border-b border-gray-100">
          <div className="relative">
            {player.photoURL ? (
              <img
                src={player.photoURL}
                alt={player.name}
                className="w-28 h-28 rounded-full object-cover shadow-lg ring-4 ring-gray-100"
              />
            ) : (
              <div
                className={`${getAvatarColor(
                  player.name
                )} w-28 h-28 rounded-full flex items-center justify-center text-white font-black text-3xl shadow-lg ring-4 ring-gray-100`}
              >
                {getInitials(player.name)}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center text-sm shadow-md transition-colors disabled:opacity-60"
              title="Upload photo"
            >
              {uploading ? "…" : "📷"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          {uploadError && (
            <p className="text-red-600 text-xs font-semibold">{uploadError}</p>
          )}
          <h3 className="font-black text-gray-900 text-2xl text-center">
            {player.name}
          </h3>

          {/* Self rating badge */}
          <span
            className={`text-xs px-3 py-1 rounded-full font-semibold ${
              TIER_BADGE_COLORS[player.ratings.self.tier]
            }`}
          >
            Self: {formatSkillRating(player.ratings.self)}
          </span>

          {/* Community / active rating */}
          {communityCount > 0 && (
            <span
              className={`text-xs px-3 py-1 rounded-full font-semibold ${
                TIER_BADGE_COLORS[activeRating.tier]
              }`}
            >
              {TIER_LABELS[activeRating.tier]}{" "}
              {activeRating.division.toFixed(1)} ({communityCount}{" "}
              {communityCount === 1 ? "rating" : "ratings"})
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="px-6 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Session Stats
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-2xl font-black text-gray-900">
                {player.gamesPlayed}
              </p>
              <p className="text-xs text-gray-500">Played</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-2xl font-black text-emerald-600">
                {player.gamesWon}
              </p>
              <p className="text-xs text-gray-500">Won</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-2xl font-black text-gray-900">
                {winRate !== null ? `${winRate}%` : "–"}
              </p>
              <p className="text-xs text-gray-500">Win Rate</p>
            </div>
          </div>
        </div>

        {/* Community Rating */}
        {communityCount < 5 && (
          <div className="px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Rate This Player
            </p>
            {submitted ? (
              <p className="text-emerald-600 font-semibold text-sm text-center py-4">
                Rating submitted! Thanks.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setRateTier(t)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                        rateTier === t
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Division: {rateDivision.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={rateDivision}
                    onChange={(e) => setRateDivision(parseFloat(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1.0</span>
                    <span className="font-semibold text-emerald-600">
                      {formatSkillRating({ tier: rateTier, division: rateDivision })}
                    </span>
                    <span>5.0</span>
                  </div>
                </div>
                <button
                  onClick={handleSubmitRating}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors shadow-sm"
                >
                  Submit Rating
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  Anonymous · {5 - communityCount} rating{5 - communityCount !== 1 ? "s" : ""} remaining
                </p>
              </>
            )}
          </div>
        )}

        {communityCount >= 5 && (
          <div className="px-6 py-5">
            <p className="text-xs text-gray-400 text-center italic">
              Maximum community ratings reached.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
