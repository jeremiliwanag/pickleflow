import { useState, useEffect } from "react";
import { getPlayerHistory } from "../../db/historyDB";
import type { Player, PlayerSessionRecord } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";

interface PlayerStatsModalProps {
  player: Player;
  onClose: () => void;
}

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-600", "bg-violet-600", "bg-orange-500",
  "bg-pink-600", "bg-teal-600", "bg-rose-600", "bg-indigo-600",
  "bg-amber-500", "bg-cyan-600",
];

function getAvatarColor(name: string): string {
  const index = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PlayerStatsModal({ player, onClose }: PlayerStatsModalProps) {
  const [history, setHistory] = useState<PlayerSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlayerHistory(player.id)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [player.id]);

  const totalGames = history.reduce((s, r) => s + r.gamesPlayed, 0);
  const totalWins = history.reduce((s, r) => s + r.gamesWon, 0);
  const careerWinRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const bestSession = history.reduce<PlayerSessionRecord | null>(
    (best, r) => (!best || r.winRate > best.winRate ? r : best),
    null
  );
  const peakStreak = Math.max(0, ...history.map((r) => r.peakWinStreak));

  const maxGames = Math.max(1, ...history.map((r) => r.gamesPlayed));
  const activeRating = getActiveRating(player.ratings);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
          {player.photoURL ? (
            <img src={player.photoURL} alt={player.name}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className={`${getAvatarColor(player.name)} w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
              {getInitials(player.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 text-lg leading-tight">{player.name}</h2>
            <p className="text-gray-400 text-xs">{formatSkillRating(activeRating)} · Career stats</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-400 text-sm">Loading stats…</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1">
              <p className="text-gray-400 text-sm font-medium">No session history yet</p>
              <p className="text-gray-300 text-xs">Stats are recorded when a session ends</p>
            </div>
          ) : (
            <>
              {/* Career summary */}
              <div className="grid grid-cols-4 gap-0 border-b border-gray-100">
                {[
                  { label: "Sessions", value: history.length },
                  { label: "Games", value: totalGames },
                  { label: "Wins", value: totalWins },
                  { label: "Win Rate", value: `${careerWinRate}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center py-4 border-r border-gray-100 last:border-r-0">
                    <p className="text-xl font-black text-gray-900">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Highlights */}
              <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-100">
                {bestSession && (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-yellow-600 mb-1">🏆 Best Session</p>
                    <p className="font-black text-gray-900 text-sm leading-tight">{bestSession.sessionName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {bestSession.gamesWon}W / {bestSession.gamesPlayed} · {bestSession.winRate}%
                    </p>
                  </div>
                )}
                {peakStreak >= 2 && (
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-orange-600 mb-1">🔥 Peak Streak</p>
                    <p className="font-black text-gray-900 text-2xl">{peakStreak}</p>
                    <p className="text-xs text-gray-500">wins in a row</p>
                  </div>
                )}
              </div>

              {/* Per-session bar chart */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Games Per Session
                </p>
                <div className="space-y-2.5">
                  {history.map((record) => (
                    <div key={record.id}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium truncate max-w-[160px]">{record.sessionName}</span>
                        <span className="text-gray-400 flex-shrink-0 ml-2">
                          {formatDate(record.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden flex">
                          {/* wins */}
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${(record.gamesWon / maxGames) * 100}%` }}
                          />
                          {/* losses */}
                          <div
                            className="h-full bg-gray-300 transition-all"
                            style={{ width: `${((record.gamesPlayed - record.gamesWon) / maxGames) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-16 text-right flex-shrink-0">
                          {record.gamesWon}W {record.gamesPlayed - record.gamesWon}L
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                        <span>{record.winRate}% win rate</span>
                        {record.peakWinStreak >= 2 && (
                          <span>🔥 {record.peakWinStreak} streak</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Wins
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" /> Losses
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
