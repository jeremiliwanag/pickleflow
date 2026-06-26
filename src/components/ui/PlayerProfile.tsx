import { useState, useRef, useEffect } from "react";
import type { Player, SkillTier } from "../../types";
import { formatSkillRating, getActiveRating, skillRatingToNumber, numberToSkillRating } from "../../types";
import PhotoCropModal from "./PhotoCropModal";

interface PlayerProfileProps {
  player: Player;
  onClose: () => void;
  onRatePlayer: (tier: SkillTier, division: number) => void;
  onPhotoUpload: (file: File) => Promise<void>;
  onUpdateSelfRating?: (tier: SkillTier, division: number) => Promise<void>;
  /** Roster-only: allow editing the player's name */
  onUpdateName?: (name: string) => Promise<void>;
  /** Admin: clear all community ratings */
  onResetCommunityRatings?: () => Promise<void>;
}

const ADMIN_PIN = "1234";

const TIERS: SkillTier[] = ["BEGINNER", "NOVICE", "INTERMEDIATE", "ADVANCED", "ELITE"];

const TIER_LABELS: Record<SkillTier, string> = {
  BEGINNER: "Beginner",
  NOVICE: "Novice",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ELITE: "Elite",
};

const TIER_BADGE_COLORS: Record<SkillTier, string> = {
  BEGINNER:     "bg-gray-200 text-gray-800 border border-gray-300",
  NOVICE:       "bg-blue-100 text-blue-900 border border-blue-300",
  INTERMEDIATE: "bg-yellow-100 text-yellow-900 border border-yellow-300",
  ADVANCED:     "bg-orange-100 text-orange-900 border border-orange-300",
  ELITE:        "bg-red-100 text-red-900 border border-red-300",
};

const TIER_BG: Record<SkillTier, string> = {
  BEGINNER:     "bg-slate-500",
  NOVICE:       "bg-blue-500",
  INTERMEDIATE: "bg-yellow-500",
  ADVANCED:     "bg-orange-500",
  ELITE:        "bg-red-500",
};

const AVATAR_COLORS = [
  "from-emerald-400 to-emerald-600",
  "from-blue-400 to-blue-600",
  "from-violet-400 to-violet-600",
  "from-orange-400 to-orange-600",
  "from-pink-400 to-pink-600",
  "from-teal-400 to-teal-600",
  "from-rose-400 to-rose-600",
  "from-indigo-400 to-indigo-600",
  "from-amber-400 to-amber-600",
  "from-cyan-400 to-cyan-600",
];

function getAvatarColor(name: string): string {
  const index = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function PlayerProfile({
  player,
  onClose,
  onRatePlayer,
  onPhotoUpload,
  onUpdateSelfRating,
  onUpdateName,
  onResetCommunityRatings,
}: PlayerProfileProps) {
  const [rateTier, setRateTier] = useState<SkillTier>("INTERMEDIATE");
  const [rateDivision, setRateDivision] = useState(3.0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submittedAtCount, setSubmittedAtCount] = useState<number | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin self-rating edit
  const [editingSelf, setEditingSelf] = useState(false);
  const [selfTier, setSelfTier] = useState<SkillTier>(player.ratings.self.tier);
  const [selfDivision, setSelfDivision] = useState(player.ratings.self.division);
  const [selfSaving, setSelfSaving] = useState(false);
  const [selfSaved, setSelfSaved] = useState(false);

  // Name edit (roster context)
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(player.name);
  const [nameSaving, setNameSaving] = useState(false);

  // Admin PIN for resetting community ratings
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const activeRating = getActiveRating(player.ratings);
  const communityCount = player.ratings.community?.length ?? 0;
  const submitted = submittedAtCount !== null;

  useEffect(() => {
    if (submittedAtCount !== null && communityCount > submittedAtCount) {
      setSubmittedAtCount(null);
    }
  }, [communityCount, submittedAtCount]);

  // Keep self-rating fields in sync when player prop updates (e.g. after save)
  useEffect(() => {
    setSelfTier(player.ratings.self.tier);
    setSelfDivision(player.ratings.self.division);
    setNameValue(player.name);
  }, [player]);

  const winRate = player.gamesPlayed > 0
    ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
    : null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    // Show cropper first — no size check yet, user may zoom/crop it down
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError("Only JPEG and PNG files are accepted");
      return;
    }
    setCropFile(file);
    // Reset input so the same file can be re-selected after cancel
    e.target.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null);
    setUploading(true);
    try {
      const croppedFile = new File([blob], "photo.jpg", { type: "image/jpeg" });
      await onPhotoUpload(croppedFile);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Photo crop modal */}
      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}

      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel — wider: 560px */}
      <div className="fixed right-0 top-0 h-full w-[560px] bg-white shadow-2xl z-50 flex flex-col overflow-y-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <h2 className="font-black text-gray-900 text-xl">Player Profile</h2>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-2xl font-bold transition-colors">
            ×
          </button>
        </div>

        {/* ── Avatar + Name ── */}
        <div className="flex flex-col items-center gap-4 px-8 pt-10 pb-8 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
          <div className="relative">
            {player.photoURL ? (
              <img src={player.photoURL} alt={player.name}
                className="w-36 h-36 rounded-full object-cover shadow-xl ring-4 ring-white" />
            ) : (
              <div className={`bg-gradient-to-br ${getAvatarColor(player.name)} w-36 h-36 rounded-full flex items-center justify-center text-white font-black text-4xl shadow-xl ring-4 ring-white`}>
                {getInitials(player.name)}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-1 right-1 w-10 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center text-base shadow-lg transition-colors disabled:opacity-60"
              title="Upload photo"
            >
              {uploading ? "…" : "📷"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoChange} />
          </div>

          {uploadError && <p className="text-red-500 text-xs font-semibold">{uploadError}</p>}

          {/* Name — editable in roster context */}
          {editingName ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                autoFocus
                className="flex-1 border-2 border-emerald-400 rounded-xl px-4 py-2 text-center font-black text-lg text-gray-900 focus:outline-none"
              />
              <button
                disabled={nameSaving || !nameValue.trim()}
                onClick={async () => {
                  setNameSaving(true);
                  await onUpdateName!(nameValue.trim());
                  setNameSaving(false);
                  setEditingName(false);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
              >
                {nameSaving ? "…" : "Save"}
              </button>
              <button onClick={() => { setEditingName(false); setNameValue(player.name); }}
                className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="font-black text-gray-900 text-3xl text-center">{player.name}</h3>
              {onUpdateName && (
                <button onClick={() => setEditingName(true)}
                  className="text-gray-300 hover:text-gray-500 text-sm transition-colors" title="Edit name">
                  ✎
                </button>
              )}
            </div>
          )}

          {/* Rating badges */}
          <div className="w-full max-w-xs space-y-2">
            {/* Average — primary, used for matchmaking */}
            <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${TIER_BADGE_COLORS[activeRating.tier]} border-2`}>
              <span className="text-xs font-black uppercase tracking-wider opacity-70">Avg Rating</span>
              <span className="font-black text-base">{formatSkillRating(activeRating)}</span>
            </div>
            <p className="text-xs text-gray-400 text-center -mt-1">
              Used for matchmaking · self{communityCount > 0 ? ` + ${communityCount} community` : " rating only"}
            </p>

            {/* Self + Community breakdown */}
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Self</p>
                <p className="font-black text-sm text-gray-800">{formatSkillRating(player.ratings.self)}</p>
              </div>
              {communityCount > 0 && (() => {
                // Community-only average for display
                const comm = player.ratings.community!;
                const nums = comm.map(c => skillRatingToNumber(c.rating));
                const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
                const commAvg = numberToSkillRating(avg);
                return (
                  <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center border border-gray-100">
                    <p className="text-xs text-gray-400 mb-0.5">Community ({communityCount})</p>
                    <p className="font-black text-sm text-gray-800">{formatSkillRating(commAvg)}</p>
                  </div>
                );
              })()}
            </div>

            {(player.winStreak ?? 0) >= 3 && (
              <div className="bg-orange-500 text-white rounded-xl px-4 py-2 text-center font-black text-sm">
                🔥 {player.winStreak} win streak
              </div>
            )}
          </div>
        </div>

        {/* ── Session Stats ── */}
        <div className="px-8 py-6 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Session Stats</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Played", value: player.gamesPlayed, color: "text-gray-900" },
              { label: "Won", value: player.gamesWon, color: "text-emerald-600" },
              { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "–", color: "text-gray-900" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-2xl py-4">
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Admin: Edit Self Rating ── */}
        {onUpdateSelfRating && (
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Self Rating</p>
              {!editingSelf && (
                <button
                  onClick={() => { setSelfTier(player.ratings.self.tier); setSelfDivision(player.ratings.self.division); setSelfSaved(false); setEditingSelf(true); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 font-semibold transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {!editingSelf ? (
              <div className="flex items-center gap-3">
                <span className={`text-sm px-4 py-1.5 rounded-full font-bold ${TIER_BADGE_COLORS[player.ratings.self.tier]}`}>
                  {TIER_LABELS[player.ratings.self.tier]} {player.ratings.self.division.toFixed(1)}
                </span>
                {selfSaved && <span className="text-emerald-600 text-sm font-semibold">✓ Saved</span>}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((t) => (
                    <button key={t} onClick={() => setSelfTier(t)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                        selfTier === t ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}>
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>Division</span>
                    <span className="font-bold text-gray-800">{formatSkillRating({ tier: selfTier, division: selfDivision })}</span>
                  </div>
                  <input type="range" min={1} max={5} step={0.1} value={selfDivision}
                    onChange={(e) => setSelfDivision(parseFloat(e.target.value))}
                    className="w-full accent-emerald-600" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { setSelfSaving(true); await onUpdateSelfRating(selfTier, selfDivision); setSelfSaving(false); setSelfSaved(true); setEditingSelf(false); }}
                    disabled={selfSaving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors disabled:opacity-60">
                    {selfSaving ? "Saving…" : "Save Rating"}
                  </button>
                  <button onClick={() => setEditingSelf(false)}
                    className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Community Rating ── */}
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Rate This Player
            </p>
            {/* Admin reset button — only shown when there are ratings to clear */}
            {onResetCommunityRatings && communityCount > 0 && !showPinEntry && (
              <button
                onClick={() => { setShowPinEntry(true); setPinValue(""); setPinError(false); setResetDone(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 font-semibold border border-red-100 transition-colors"
              >
                Reset ratings
              </button>
            )}
          </div>

          {/* PIN entry modal-within-panel */}
          {showPinEntry && (
            <div className="mb-5 bg-red-50 border border-red-100 rounded-2xl p-5">
              <p className="text-sm font-black text-gray-900 mb-1">Admin PIN required</p>
              <p className="text-xs text-gray-400 mb-4">
                Enter the 4-digit admin PIN to clear all {communityCount} community rating{communityCount !== 1 ? "s" : ""} for {player.name}.
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="password"
                  maxLength={4}
                  value={pinValue}
                  onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(false); }}
                  placeholder="••••"
                  autoFocus
                  className={`w-24 text-center text-xl font-black tracking-widest border-2 rounded-xl px-3 py-2 focus:outline-none ${pinError ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-red-400"}`}
                />
                <button
                  disabled={pinValue.length < 4 || resetSaving}
                  onClick={async () => {
                    if (pinValue !== ADMIN_PIN) { setPinError(true); setPinValue(""); return; }
                    setResetSaving(true);
                    await onResetCommunityRatings!();
                    setResetSaving(false);
                    setShowPinEntry(false);
                    setResetDone(true);
                  }}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors disabled:opacity-50"
                >
                  {resetSaving ? "Clearing…" : "Confirm Reset"}
                </button>
                <button
                  onClick={() => setShowPinEntry(false)}
                  className="px-4 py-2 rounded-xl bg-white border-2 border-gray-200 text-gray-600 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              {pinError && (
                <p className="text-red-500 text-xs font-semibold">Incorrect PIN. Try again.</p>
              )}
            </div>
          )}

          {resetDone && (
            <div className="mb-5 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
              <p className="text-emerald-700 font-black text-sm">✓ Community ratings cleared</p>
            </div>
          )}

          {communityCount >= 10 ? (
            <div className="bg-gray-50 rounded-2xl p-6 text-center">
              <p className="text-2xl mb-2">⭐⭐⭐⭐⭐</p>
              <p className="text-gray-500 text-sm font-medium">Maximum community ratings reached (10/10)</p>
            </div>
          ) : submitted ? (
            <div className="bg-emerald-50 rounded-2xl p-6 text-center border border-emerald-100">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-emerald-700 font-black text-base">Rating submitted!</p>
              <p className="text-emerald-500 text-sm mt-1">Thanks for rating {player.name}.</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-6 space-y-5">
              {/* Tier buttons — bigger */}
              <div>
                <p className="text-xs text-gray-400 font-semibold mb-3">Skill Level</p>
                <div className="grid grid-cols-5 gap-2">
                  {TIERS.map((t) => (
                    <button key={t} onClick={() => setRateTier(t)}
                      className={`py-3 rounded-xl text-xs font-black text-center transition-all ${
                        rateTier === t
                          ? `${TIER_BG[t]} text-white shadow-md scale-105`
                          : "bg-white border-2 border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}>
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Division slider — bigger */}
              <div>
                <div className="flex justify-between items-baseline mb-3">
                  <p className="text-xs text-gray-400 font-semibold">Division</p>
                  <span className={`text-lg font-black px-3 py-1 rounded-xl ${TIER_BADGE_COLORS[rateTier]}`}>
                    {formatSkillRating({ tier: rateTier, division: rateDivision })}
                  </span>
                </div>
                <input type="range" min={1} max={5} step={0.1} value={rateDivision}
                  onChange={(e) => setRateDivision(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 h-2" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1.0 — Lowest</span>
                  <span>5.0 — Highest</span>
                </div>
              </div>

              <button
                onClick={() => { void onRatePlayer(rateTier, rateDivision); setSubmittedAtCount(communityCount); }}
                className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base transition-colors shadow-sm"
              >
                Submit Rating
              </button>
              <p className="text-xs text-gray-400 text-center">
                Anonymous · {10 - communityCount} rating{10 - communityCount !== 1 ? "s" : ""} remaining
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
