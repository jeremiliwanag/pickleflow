import type { Session, Player } from "../../types";
import { formatSkillRating, getActiveRating } from "../../types";

interface SessionSummaryModalProps {
  session: Session;
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

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMs(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function SessionSummaryModal({
  session,
  onClose,
}: SessionSummaryModalProps) {
  const completedMatches = session.matchHistory.filter(
    (m) => m.result !== "PENDING" && m.startTime && m.endTime
  );

  const sessionDurationMs =
    session.startedAt && session.endedAt
      ? session.endedAt - session.startedAt
      : null;

  // Longest match
  const longestMatch = completedMatches.reduce<typeof completedMatches[0] | null>(
    (best, m) => {
      const dur = (m.endTime ?? 0) - (m.startTime ?? 0);
      const bestDur = best ? (best.endTime ?? 0) - (best.startTime ?? 0) : 0;
      return dur > bestDur ? m : best;
    },
    null
  );

  const avgMatchMs =
    completedMatches.length > 0
      ? completedMatches.reduce(
          (sum, m) => sum + ((m.endTime ?? 0) - (m.startTime ?? 0)),
          0
        ) / completedMatches.length
      : null;

  // Players sorted by wins
  const ranked = [...session.players]
    .filter((p) => p.gamesPlayed > 0)
    .sort((a, b) => b.gamesWon - a.gamesWon || b.gamesPlayed - a.gamesPlayed);

  const mvp = ranked[0] ?? null;
  const mostActive = [...session.players].sort(
    (a, b) => b.gamesPlayed - a.gamesPlayed
  )[0] ?? null;

  // Best win streak
  const topStreak = [...session.players].sort(
    (a, b) => (b.winStreak ?? 0) - (a.winStreak ?? 0)
  )[0];

  const PlayerAvatar = ({ player }: { player: Player }) => (
    <div className="flex items-center gap-2">
      {player.photoURL ? (
        <img src={player.photoURL} alt={player.name}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className={`${getAvatarColor(player.name)} w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
          {getInitials(player.name)}
        </div>
      )}
      <span className="font-bold text-gray-900 text-sm">{player.name}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-green-800 to-emerald-700 px-6 py-5 text-white">
          <p className="text-emerald-300 text-xs font-semibold uppercase tracking-widest mb-1">
            Session Complete
          </p>
          <h2 className="font-black text-2xl">{session.name}</h2>
          {sessionDurationMs && (
            <p className="text-emerald-200 text-sm mt-1">
              {formatDuration(sessionDurationMs)} · {completedMatches.length} matches · {session.players.length} players
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Highlights */}
          <div className="p-5 grid grid-cols-2 gap-3 border-b border-gray-100">
            {mvp && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2">
                  🏆 MVP
                </p>
                <PlayerAvatar player={mvp} />
                <p className="text-xs text-gray-500 mt-1 ml-10">
                  {mvp.gamesWon}W / {mvp.gamesPlayed} games
                </p>
              </div>
            )}

            {mostActive && mostActive.id !== mvp?.id && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                  💪 Most Active
                </p>
                <PlayerAvatar player={mostActive} />
                <p className="text-xs text-gray-500 mt-1 ml-10">
                  {mostActive.gamesPlayed} games played
                </p>
              </div>
            )}

            {topStreak && (topStreak.winStreak ?? 0) >= 2 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">
                  🔥 Hot Streak
                </p>
                <PlayerAvatar player={topStreak} />
                <p className="text-xs text-gray-500 mt-1 ml-10">
                  {topStreak.winStreak} wins in a row
                </p>
              </div>
            )}

            {longestMatch && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">
                  ⏱ Longest Match
                </p>
                <p className="text-lg font-black text-gray-900">
                  {formatMs((longestMatch.endTime ?? 0) - (longestMatch.startTime ?? 0))}
                </p>
                {longestMatch.scoreA !== undefined && (
                  <p className="text-xs text-gray-500">
                    Score: {longestMatch.scoreA} – {longestMatch.scoreB}
                  </p>
                )}
              </div>
            )}

            {avgMatchMs && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  📊 Avg Match Time
                </p>
                <p className="text-lg font-black text-gray-900">
                  {formatMs(avgMatchMs)}
                </p>
              </div>
            )}
          </div>

          {/* Player leaderboard */}
          {ranked.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Final Standings
              </p>
              <div className="space-y-2">
                {ranked.map((player, i) => {
                  const winRate = player.gamesPlayed > 0
                    ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
                    : 0;
                  const rating = getActiveRating(player.ratings);
                  return (
                    <div key={player.id} className="flex items-center gap-3 py-1.5">
                      <span className={`w-6 text-center font-black text-sm flex-shrink-0 ${
                        i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-gray-300"
                      }`}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                      </span>
                      {player.photoURL ? (
                        <img src={player.photoURL} alt={player.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className={`${getAvatarColor(player.name)} w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
                          {getInitials(player.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-gray-900 text-sm truncate">{player.name}</p>
                          {(player.winStreak ?? 0) >= 3 && (
                            <span className="text-xs bg-orange-500 text-white px-1 py-0.5 rounded-full font-black">
                              🔥{player.winStreak}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{formatSkillRating(rating)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-gray-900 text-sm">
                          {player.gamesWon}W {player.gamesPlayed - player.gamesWon}L
                        </p>
                        <p className="text-xs text-gray-400">{winRate}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-green-800 hover:bg-green-700 text-white font-black text-sm transition-colors"
          >
            Close Session
          </button>
        </div>
      </div>
    </div>
  );
}
