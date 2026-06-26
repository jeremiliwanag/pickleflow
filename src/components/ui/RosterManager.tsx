import { useState, useEffect } from "react";
import { usePlayerStore } from "../../store/playerStore";
import { useSessionStore } from "../../store/sessionStore";
import { savePlayer } from "../../db/playerDB";
import { uploadPlayerPhoto } from "../../db/storageDB";
import type { SkillTier, Player } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";
import PlayerProfile from "./PlayerProfile";
import PlayerStatsModal from "./PlayerStatsModal";

const TIERS: SkillTier[] = ["BEGINNER", "NOVICE", "INTERMEDIATE", "ADVANCED", "ELITE"];

const TIER_LABELS: Record<SkillTier, string> = {
  BEGINNER: "Beginner",
  NOVICE: "Novice",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ELITE: "Elite",
};

const TIER_COLORS: Record<SkillTier, { badge: string; bar: string; glow: string }> = {
  BEGINNER:     { badge: "bg-slate-100 text-slate-700 border-slate-300",      bar: "bg-slate-400",   glow: "shadow-slate-200" },
  NOVICE:       { badge: "bg-blue-100 text-blue-800 border-blue-300",          bar: "bg-blue-500",    glow: "shadow-blue-200" },
  INTERMEDIATE: { badge: "bg-yellow-100 text-yellow-800 border-yellow-300",    bar: "bg-yellow-500",  glow: "shadow-yellow-200" },
  ADVANCED:     { badge: "bg-orange-100 text-orange-800 border-orange-300",    bar: "bg-orange-500",  glow: "shadow-orange-200" },
  ELITE:        { badge: "bg-red-100 text-red-800 border-red-300",             bar: "bg-red-500",     glow: "shadow-red-200" },
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

// Skill level as 0–100% for the progress bar (1.0–5.0 across all tiers mapped to 0–100)
const TIER_BASE: Record<SkillTier, number> = {
  BEGINNER: 0, NOVICE: 20, INTERMEDIATE: 40, ADVANCED: 60, ELITE: 80,
};
function skillPercent(tier: SkillTier, division: number): number {
  return Math.round(TIER_BASE[tier] + ((division - 1) / 4) * 20);
}

interface RosterManagerProps {
  onClose: () => void;
}

export default function RosterManager({ onClose }: RosterManagerProps) {
  const { roster, loading, loadRoster, addToRoster, updateRosterPlayer, removeFromRoster, addCommunityRating, updatePlayerPhoto, updateRating } =
    usePlayerStore();

  const [search, setSearch] = useState("");
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statsPlayer, setStatsPlayer] = useState<Player | null>(null);


  // Add form state
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<SkillTier>("BEGINNER");
  const [newDivision, setNewDivision] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState<number | null>(null);

  const session = useSessionStore((s) => s.session);

  useEffect(() => { loadRoster(); }, []);

  // How many session players are missing from the roster?
  const rosterNames = new Set(roster.map((p) => p.name.toLowerCase()));
  const sessionOnlyPlayers = (session?.players ?? []).filter(
    (p) => !rosterNames.has(p.name.toLowerCase())
  );

  const importSessionPlayers = async () => {
    if (sessionOnlyPlayers.length === 0) return;
    setImporting(true);
    await Promise.all(sessionOnlyPlayers.map((p) => savePlayer(p)));
    setImportCount(sessionOnlyPlayers.length);
    setImporting(false);
    // roster will auto-update via the real-time listener
  };

  const filtered = roster.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // Live-derive profilePlayer from roster so it updates after edits
  const liveProfilePlayer = profilePlayer
    ? (roster.find((p) => p.id === profilePlayer.id) ?? null)
    : null;

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    await removeFromRoster(deleteConfirmId);
    setDeleteConfirmId(null);
    if (profilePlayer?.id === deleteConfirmId) setProfilePlayer(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await addToRoster(newName.trim(), newTier, newDivision);
    setNewName(""); setNewTier("BEGINNER"); setNewDivision(1.0);
    setSaving(false);
    setShowAddForm(false);
  };

  const playerToDelete = roster.find((p) => p.id === deleteConfirmId);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">

      {/* Player Stats Modal */}
      {statsPlayer && (
        <PlayerStatsModal player={statsPlayer} onClose={() => setStatsPlayer(null)} />
      )}

      {/* Player Profile panel (reused from sidebar) */}
      {liveProfilePlayer && (
        <PlayerProfile
          player={liveProfilePlayer}
          onClose={() => setProfilePlayer(null)}
          onRatePlayer={async (tier, division) => {
            await addCommunityRating(liveProfilePlayer.id, tier, division);
          }}
          onPhotoUpload={async (file) => {
            const url = await uploadPlayerPhoto(liveProfilePlayer.id, file);
            await updatePlayerPhoto(liveProfilePlayer.id, url);
          }}
          onUpdateSelfRating={async (tier, division) => {
            await updateRating(liveProfilePlayer.id, "self", tier, division);
          }}
          onUpdateName={async (name) => {
            await updateRosterPlayer(liveProfilePlayer.id, { name });
          }}
        />
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg mb-1">Delete Player?</h3>
            <p className="text-gray-500 text-sm mb-5">
              Permanently remove{" "}
              <span className="font-bold text-gray-900">{playerToDelete?.name}</span>{" "}
              from the roster? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors">
                Yes, Delete
              </button>
              <button onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Player modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-black text-gray-900 text-lg mb-4">Add New Player</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Player name" value={newName}
                onChange={(e) => setNewName(e.target.value)} autoFocus
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-emerald-500" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tier</p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((t) => (
                    <button key={t} onClick={() => setNewTier(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                        newTier === t ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}>
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Division</span>
                  <span className="font-bold text-emerald-600">{formatSkillRating({ tier: newTier, division: newDivision })}</span>
                </div>
                <input type="range" min={1} max={5} step={0.1} value={newDivision}
                  onChange={(e) => setNewDivision(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAdd} disabled={saving || !newName.trim()}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors disabled:opacity-50">
                  {saving ? "Saving…" : "Add to Roster"}
                </button>
                <button onClick={() => setShowAddForm(false)}
                  className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main panel — 90vw × 90vh grid */}
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-[92vw] h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-black text-gray-900 text-2xl tracking-tight">Player Roster</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {roster.length} player{roster.length !== 1 ? "s" : ""} · click a card to edit
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 border-2 border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
            />
            {sessionOnlyPlayers.length > 0 && (
              <button
                onClick={importSessionPlayers}
                disabled={importing}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {importing
                  ? "Importing…"
                  : importCount !== null
                  ? `✓ ${importCount} imported!`
                  : `↓ Import ${sessionOnlyPlayers.length} from session`}
              </button>
            )}
            <button
              onClick={() => { setShowAddForm(true); setProfilePlayer(null); }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors whitespace-nowrap"
            >
              + New Player
            </button>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors">
              ×
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">Loading roster…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-gray-400 text-sm font-medium">
                {search ? "No players match your search" : "No players in roster yet"}
              </p>
              {!search && (
                <button onClick={() => setShowAddForm(true)}
                  className="text-emerald-600 font-bold text-sm hover:underline">
                  Add your first player
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((player) => {
                const rating = getActiveRating(player.ratings);
                const communityCount = player.ratings.community?.length ?? 0;
                const winRate = player.gamesPlayed > 0
                  ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
                  : null;
                const pct = skillPercent(rating.tier, rating.division);
                const colors = TIER_COLORS[rating.tier];

                return (
                  <div
                    key={player.id}
                    onClick={() => setProfilePlayer(player)}
                    className={`bg-white rounded-2xl shadow-sm hover:shadow-md ${colors.glow} border border-gray-100 hover:border-emerald-200 cursor-pointer transition-all duration-200 overflow-hidden flex flex-col group`}
                  >
                    {/* Avatar area */}
                    <div className="relative flex flex-col items-center pt-7 pb-4 px-4">
                      {player.photoURL ? (
                        <img src={player.photoURL} alt={player.name}
                          className="w-20 h-20 rounded-full object-cover shadow-lg ring-4 ring-white" />
                      ) : (
                        <div className={`bg-gradient-to-br ${getAvatarColor(player.name)} w-20 h-20 rounded-full flex items-center justify-center text-white font-black text-2xl shadow-lg ring-4 ring-white`}>
                          {getInitials(player.name)}
                        </div>
                      )}

                      {/* Win streak badge */}
                      {(player.winStreak ?? 0) >= 3 && (
                        <span className="absolute top-4 right-4 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-black shadow">
                          🔥{player.winStreak}
                        </span>
                      )}
                    </div>

                    {/* Name + rating */}
                    <div className="px-4 pb-3 text-center">
                      <p className="font-black text-gray-900 text-sm leading-tight truncate">{player.name}</p>
                      <span className={`inline-block mt-1.5 text-xs px-2.5 py-0.5 rounded-full font-bold border ${colors.badge}`}>
                        {formatSkillRating(rating)}
                      </span>
                      {communityCount > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {communityCount} community rating{communityCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>

                    {/* Skill bar */}
                    <div className="px-4 pb-3">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="border-t border-gray-50 grid grid-cols-3 divide-x divide-gray-50 mt-auto">
                      <div className="py-3 text-center">
                        <p className="text-sm font-black text-gray-900">{player.gamesPlayed}</p>
                        <p className="text-xs text-gray-400 leading-tight">Played</p>
                      </div>
                      <div className="py-3 text-center">
                        <p className="text-sm font-black text-emerald-600">{player.gamesWon}</p>
                        <p className="text-xs text-gray-400 leading-tight">Wins</p>
                      </div>
                      <div className="py-3 text-center">
                        <p className="text-sm font-black text-gray-900">
                          {winRate !== null ? `${winRate}%` : "—"}
                        </p>
                        <p className="text-xs text-gray-400 leading-tight">Win %</p>
                      </div>
                    </div>

                    {/* Hover action strip */}
                    <div className="border-t border-gray-50 flex divide-x divide-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setStatsPlayer(player); }}
                        className="flex-1 py-2 text-xs font-bold text-purple-600 hover:bg-purple-50 transition-colors"
                      >
                        Stats
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setProfilePlayer(player); }}
                        className="flex-1 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(player.id); }}
                        className="flex-1 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
