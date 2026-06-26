import { useState, useEffect } from "react";
import { getRecentSessions, deleteSession } from "../../db/sessionDB";
import type { Session, Player } from "../../types";

function formatDuration(startedAt: number | null, endedAt: number | null): string {
  if (!startedAt || !endedAt) return "—";
  const ms = endedAt - startedAt;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function mvp(session: Session): Player | null {
  const played = session.players.filter((p) => p.gamesPlayed > 0);
  if (!played.length) return null;
  return played.reduce((best, p) =>
    p.gamesWon > best.gamesWon ? p : best
  );
}

interface SessionDetailProps {
  session: Session;
  onBack: () => void;
  onDelete: () => void;
}

function SessionDetail({ session, onBack, onDelete }: SessionDetailProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sorted = [...session.players]
    .filter((p) => p.gamesPlayed > 0)
    .sort((a, b) => b.gamesWon - a.gamesWon);
  const totalMatches = session.matchHistory?.length ?? 0;
  const star = mvp(session);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 border-b border-gray-100">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 font-black text-xl w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        >
          ←
        </button>
        <div className="flex-1">
          <h2 className="font-black text-gray-900 text-xl">{session.name}</h2>
          <p className="text-gray-400 text-sm">
            {formatDate(session.createdAt)} · {formatDuration(session.startedAt, session.endedAt)}
          </p>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 font-bold border border-red-100 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-100">
        <div className="text-center">
          <p className="text-3xl font-black text-gray-900">{session.players.length}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Players</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-gray-900">{totalMatches}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Matches</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-gray-900">{session.currentRound}</p>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Rounds</p>
        </div>
      </div>

      {/* MVP */}
      {star && (
        <div className="mx-6 mt-5 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">MVP</p>
            <p className="font-black text-gray-900">{star.name} — {star.gamesWon}W / {star.gamesPlayed}G</p>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Leaderboard</p>
        {sorted.length === 0 ? (
          <p className="text-gray-400 text-sm">No games recorded in this session.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((p, i) => {
              const winRate = p.gamesPlayed > 0
                ? Math.round((p.gamesWon / p.gamesPlayed) * 100)
                : 0;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3"
                >
                  <span className="w-6 text-center font-black text-gray-400 text-sm">
                    {medal ?? `#${i + 1}`}
                  </span>
                  <p className="flex-1 font-bold text-gray-900 text-sm">{p.name}</p>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span><span className="font-black text-gray-900">{p.gamesWon}</span> W</span>
                    <span><span className="font-black text-gray-900">{p.gamesPlayed}</span> G</span>
                    <span className={`font-black ${winRate >= 60 ? "text-emerald-600" : winRate >= 40 ? "text-amber-600" : "text-gray-400"}`}>
                      {winRate}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg mb-2">Delete Session?</h3>
            <p className="text-gray-500 text-sm mb-5">
              This will permanently remove <span className="font-bold text-gray-900">{session.name}</span> from your history. Player stats won't be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SessionHistoryProps {
  onClose: () => void;
}

export default function SessionHistory({ onClose }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => {
    getRecentSessions(50).then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (sessionId: string) => {
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setSelected(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">

        {selected ? (
          <SessionDetail
            session={selected}
            onBack={() => setSelected(null)}
            onDelete={() => handleDelete(selected.id)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-black text-gray-900 text-xl">Session History</h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  {loading ? "Loading…" : `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-700 font-black text-xl w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <p className="text-gray-400">Loading sessions…</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <p className="text-gray-400 font-medium">No sessions yet</p>
                  <p className="text-gray-300 text-sm">Start and end a session to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => {
                    const played = s.players.filter((p) => p.gamesPlayed > 0);
                    const star = mvp(s);
                    const isActive = s.state !== "ENDED";
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-2xl px-5 py-4 transition-colors border border-gray-100 hover:border-gray-200"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-gray-900 truncate">{s.name}</p>
                              {isActive && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(s.createdAt)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-gray-700">
                              {formatDuration(s.startedAt, s.endedAt)}
                            </p>
                            <p className="text-xs text-gray-400">{s.players.length} players</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          <span>{s.matchHistory?.length ?? 0} matches</span>
                          <span>{s.currentRound} rounds</span>
                          {played.length > 0 && (
                            <span>{played.length} played</span>
                          )}
                          {star && (
                            <span className="ml-auto font-semibold text-amber-600">
                              🏆 {star.name}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
