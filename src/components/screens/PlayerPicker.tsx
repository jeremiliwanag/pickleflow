import { useState, useEffect } from "react";
import { usePlayerStore } from "../../store/playerStore";
import type { Player, SkillTier } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";

interface PlayerPickerProps {
  existingPlayerIds?: string[];
  onAddPlayers: (players: Player[]) => void;
  onNewPlayer: (
    name: string,
    tier: SkillTier,
    division: number
  ) => void;
  onClose: () => void;
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

const TIER_BADGE: Record<string, string> = {
  BEGINNER: "bg-gray-100 text-gray-700",
  NOVICE: "bg-blue-100 text-blue-800",
  INTERMEDIATE: "bg-yellow-100 text-yellow-800",
  ADVANCED: "bg-orange-100 text-orange-800",
  ELITE: "bg-red-100 text-red-800",
};

export default function PlayerPicker({
  existingPlayerIds = [],
  onAddPlayers,
  onNewPlayer,
  onClose,
}: PlayerPickerProps) {
  const { roster, loading, loadRoster, removeFromRoster } = usePlayerStore();
  const [tab, setTab] = useState<"roster" | "new">("roster");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<SkillTier | "ALL">("ALL");

  // New player form
  const [name, setName] = useState("");
  const [tier, setTier] = useState<SkillTier>("BEGINNER");
  const [division, setDivision] = useState(1.0);

  useEffect(() => {
    loadRoster();
  }, []);

  const availableRoster = roster.filter(
    (p) => !existingPlayerIds.includes(p.name)
  );

  const filteredRoster = tierFilter === "ALL"
    ? availableRoster
    : availableRoster.filter(
        (p) => getActiveRating(p.ratings).tier === tierFilter
      );

  const allFilteredSelected = filteredRoster.length > 0 &&
    filteredRoster.every((p) => selected.has(p.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRoster.forEach((p) => next.delete(p.id));
      } else {
        filteredRoster.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const toggleSelect = (playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const playersToAdd = availableRoster.filter((p) =>
      selected.has(p.id)
    );
    onAddPlayers(playersToAdd);
    onClose();
  };

  const handleAddNew = () => {
    if (!name.trim()) return;
    onNewPlayer(name.trim(), tier, division);
    setName("");
    setTier("BEGINNER");
    setDivision(1.0);
    onClose();
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    await removeFromRoster(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg mb-2">
              Delete Player?
            </h3>
            <p className="text-gray-600 text-sm mb-5">
              Permanently delete{" "}
              <span className="font-bold text-gray-900">
                {roster.find((p) => p.id === confirmDeleteId)?.name}
              </span>{" "}
              from the roster? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-black text-gray-900 text-xl">Add Players</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            x
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab("roster")}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === "roster"
                ? "text-emerald-600 border-b-2 border-emerald-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            From Roster ({availableRoster.length})
          </button>
          <button
            onClick={() => setTab("new")}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === "new"
                ? "text-emerald-600 border-b-2 border-emerald-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            New Player
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "roster" && (
            <>
              {/* Filter bar */}
              {!loading && availableRoster.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <button
                    onClick={toggleSelectAll}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 transition-colors ${
                      allFilteredSelected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-gray-300 text-gray-600 hover:border-emerald-400"
                    }`}
                  >
                    {allFilteredSelected ? "✓ All Selected" : "Select All"}
                  </button>
                  <div className="w-px h-5 bg-gray-200" />
                  {(["ALL", ...TIERS] as const).map((t) => {
                    const count = t === "ALL"
                      ? availableRoster.length
                      : availableRoster.filter((p) => getActiveRating(p.ratings).tier === t).length;
                    if (t !== "ALL" && count === 0) return null;
                    return (
                      <button
                        key={t}
                        onClick={() => setTierFilter(t)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                          tierFilter === t
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {t === "ALL" ? `All (${count})` : `${TIER_LABELS[t]} (${count})`}
                      </button>
                    );
                  })}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400">Loading roster...</p>
                </div>
              ) : availableRoster.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <p className="text-gray-400 font-medium">
                    No players in roster yet
                  </p>
                  <button
                    onClick={() => setTab("new")}
                    className="text-emerald-600 font-bold text-sm hover:underline"
                  >
                    Add your first player
                  </button>
                </div>
              ) : filteredRoster.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400">No {TIER_LABELS[tierFilter as SkillTier]} players in roster</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredRoster.map((player) => {
                    const isSelected = selected.has(player.id);
                    const rating = getActiveRating(player.ratings);
                    return (

                      <div key={player.id} className="relative group">
                        <button
                          onClick={() => toggleSelect(player.id)}
                          className={`relative w-full flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-50 shadow-md"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2 left-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-black">
                                ✓
                              </span>
                            </div>
                          )}
                          <div
                            className={`${getAvatarColor(
                              player.name
                            )} w-16 h-16 rounded-full flex items-center justify-center text-white font-black text-xl shadow-md`}
                          >
                            {getInitials(player.name)}
                          </div>
                          <p className="font-black text-gray-900 text-sm text-center leading-tight">
                            {player.name}
                          </p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              TIER_BADGE[rating.tier]
                            }`}
                          >
                            {formatSkillRating(rating)}
                          </span>
                          {player.gamesPlayed > 0 && (
                            <p className="text-xs text-gray-400">
                              {player.gamesPlayed} games
                            </p>
                          )}
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(player.id);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-black items-center justify-center opacity-0 group-hover:opacity-100 transition-all flex"
                        >
                          x
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "new" && (
            <div className="max-w-sm mx-auto flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="Player name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Skill Tier
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                        tier === t
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Division: {division.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.1}
                  value={division}
                  onChange={(e) =>
                    setDivision(parseFloat(e.target.value))
                  }
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1.0</span>
                  <span className="font-semibold text-emerald-600">
                    {formatSkillRating({ tier, division })}
                  </span>
                  <span>5.0</span>
                </div>
              </div>

              <button
                onClick={handleAddNew}
                disabled={!name.trim()}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Add to Roster + Session
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "roster" && selected.size > 0 && (
          <div className="p-5 border-t border-gray-100">
            <button
              onClick={handleAddSelected}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base transition-colors shadow-sm"
            >
              Add Selected ({selected.size}) to Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}