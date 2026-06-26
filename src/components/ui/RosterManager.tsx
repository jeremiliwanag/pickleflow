import { useState, useEffect } from "react";
import { usePlayerStore } from "../../store/playerStore";
import type { SkillTier, Player } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";
import PlayerStatsModal from "./PlayerStatsModal";

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

const TIER_BADGE: Record<SkillTier, string> = {
  BEGINNER: "bg-gray-100 text-gray-700 border-gray-300",
  NOVICE: "bg-blue-100 text-blue-800 border-blue-300",
  INTERMEDIATE: "bg-yellow-100 text-yellow-800 border-yellow-300",
  ADVANCED: "bg-orange-100 text-orange-800 border-orange-300",
  ELITE: "bg-red-100 text-red-800 border-red-300",
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

interface RosterManagerProps {
  onClose: () => void;
}

export default function RosterManager({ onClose }: RosterManagerProps) {
  const { roster, loading, loadRoster, addToRoster, updateRosterPlayer, removeFromRoster } =
    usePlayerStore();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statsPlayer, setStatsPlayer] = useState<Player | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editTier, setEditTier] = useState<SkillTier>("BEGINNER");
  const [editDivision, setEditDivision] = useState(1.0);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<SkillTier>("BEGINNER");
  const [newDivision, setNewDivision] = useState(1.0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRoster();
  }, []);

  const filtered = roster.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (playerId: string) => {
    const player = roster.find((p) => p.id === playerId);
    if (!player) return;
    const rating = getActiveRating(player.ratings);
    setEditName(player.name);
    setEditTier(rating.tier);
    setEditDivision(rating.division);
    setEditingId(playerId);
    setShowAddForm(false);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    const player = roster.find((p) => p.id === editingId);
    if (player) {
      await updateRosterPlayer(editingId, {
        name: editName.trim(),
        ratings: {
          ...player.ratings,
          self: { tier: editTier, division: editDivision },
        },
      });
    }
    setSaving(false);
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    await removeFromRoster(deleteConfirmId);
    setDeleteConfirmId(null);
    if (editingId === deleteConfirmId) setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await addToRoster(newName.trim(), newTier, newDivision);
    setNewName("");
    setNewTier("BEGINNER");
    setNewDivision(1.0);
    setSaving(false);
    setShowAddForm(false);
  };

  const playerToDelete = roster.find((p) => p.id === deleteConfirmId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">

      {/* Player Stats Modal */}
      {statsPlayer && (
        <PlayerStatsModal player={statsPlayer} onClose={() => setStatsPlayer(null)} />
      )}

      {/* Delete Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg mb-1">
              Delete Player?
            </h3>
            <p className="text-gray-500 text-sm mb-5">
              Permanently remove{" "}
              <span className="font-bold text-gray-900">
                {playerToDelete?.name}
              </span>{" "}
              from the roster? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900 text-xl">Player Roster</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {roster.length} player{roster.length !== 1 ? "s" : ""} saved
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowAddForm((v) => !v);
                setEditingId(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors"
            >
              + New Player
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl font-bold transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Add Player Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest mb-3">
              New Player
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Player name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewTier(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors ${
                      newTier === t
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {TIER_LABELS[t]}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Division</span>
                  <span className="font-semibold text-emerald-600">
                    {formatSkillRating({ tier: newTier, division: newDivision })}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.1}
                  value={newDivision}
                  onChange={(e) => setNewDivision(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add to Roster"}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
          />
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-400 text-sm">Loading roster…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-gray-400 text-sm font-medium">
                {search ? "No players match your search" : "No players in roster yet"}
              </p>
              {!search && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="text-emerald-600 font-bold text-sm hover:underline"
                >
                  Add your first player
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((player) => {
                const rating = getActiveRating(player.ratings);
                const communityCount = player.ratings.community?.length ?? 0;
                const isEditing = editingId === player.id;

                return (
                  <li key={player.id}>
                    {/* Row */}
                    <div
                      className={`flex items-center gap-4 px-6 py-3 transition-colors ${
                        isEditing ? "bg-blue-50" : "hover:bg-gray-50 cursor-pointer"
                      }`}
                      onClick={() => !isEditing && startEdit(player.id)}
                    >
                      {/* Avatar */}
                      {player.photoURL ? (
                        <img
                          src={player.photoURL}
                          alt={player.name}
                          className="w-11 h-11 rounded-full object-cover flex-shrink-0 shadow-sm"
                        />
                      ) : (
                        <div
                          className={`${getAvatarColor(
                            player.name
                          )} w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm`}
                        >
                          {getInitials(player.name)}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-gray-900 text-sm leading-tight">
                          {player.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                              TIER_BADGE[rating.tier]
                            }`}
                          >
                            {formatSkillRating(rating)}
                          </span>
                          {communityCount > 0 && (
                            <span className="text-xs text-gray-400">
                              {communityCount} community rating{communityCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isEditing && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setStatsPlayer(player);
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-purple-700 font-semibold transition-colors"
                            >
                              Stats
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(player.id);
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 font-semibold transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(player.id);
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 font-semibold transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <span className="text-xs text-blue-500 font-semibold">
                            Editing…
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inline Edit Form */}
                    {isEditing && (
                      <div className="px-6 pb-4 bg-blue-50 border-b border-blue-100">
                        <div className="flex flex-col gap-3 pt-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {TIERS.map((t) => (
                              <button
                                key={t}
                                onClick={() => setEditTier(t)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors ${
                                  editTier === t
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                                }`}
                              >
                                {TIER_LABELS[t]}
                              </button>
                            ))}
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Division</span>
                              <span className="font-semibold text-blue-600">
                                {formatSkillRating({
                                  tier: editTier,
                                  division: editDivision,
                                })}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={5}
                              step={0.1}
                              value={editDivision}
                              onChange={(e) =>
                                setEditDivision(parseFloat(e.target.value))
                              }
                              className="w-full accent-blue-600"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              disabled={!editName.trim() || saving}
                              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-colors disabled:opacity-50"
                            >
                              {saving ? "Saving…" : "Save Changes"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-4 py-2.5 rounded-xl bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-bold text-sm transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(player.id)}
                              className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm transition-colors border-2 border-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
