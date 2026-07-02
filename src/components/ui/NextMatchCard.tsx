import { useState } from "react";
import type { Player } from "../../types";
import { formatSkillRating, getActiveRating as getActiveSkillRating } from "../../types";
import { getActiveRating } from "../../engine/fairness";
import PlayerCard from "./PlayerCard";

interface NextMatchCardProps {
  nextMatch: { teamA: { playerIds: string[] }; teamB: { playerIds: string[] } };
  players: Player[];
  /** IDs of players currently on a court (Playing or Ready). */
  playingIds: ReadonlySet<string>;
  onReplace: (outId: string, inId: string) => void;
  /** Returns "ok" or "no_alternative" — card handles feedback internally. */
  onRegenerate: () => "ok" | "no_alternative";
  onPlayerClick?: (player: Player) => void;
}

function ReplacePicker({
  outPlayer,
  waitingPlayers,
  onSelect,
  onCancel,
}: {
  outPlayer: Player;
  waitingPlayers: Player[];
  onSelect: (inId: string) => void;
  onCancel: () => void;
}) {
  const outRating = getActiveRating(outPlayer);
  const sorted = [...waitingPlayers].sort((a, b) => {
    const ap = a.priority === true && (a.priorityGamesLeft ?? 0) > 0 ? 1 : 0;
    const bp = b.priority === true && (b.priorityGamesLeft ?? 0) > 0 ? 1 : 0;
    if (bp !== ap) return bp - ap;
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    const aWait = a.waitingSince ?? Date.now();
    const bWait = b.waitingSince ?? Date.now();
    if (aWait !== bWait) return aWait - bWait;
    return Math.abs(getActiveRating(a) - outRating) - Math.abs(getActiveRating(b) - outRating);
  });

  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 rounded-2xl flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="font-black text-gray-900 text-sm">Replace Player</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Replacing <span className="font-bold text-gray-700">{outPlayer.name}</span>
          </p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-black transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">No waiting players available.</p>
        ) : (
          sorted.map((p) => {
            const hasPriority = p.priority === true && (p.priorityGamesLeft ?? 0) > 0;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition-colors"
              >
                {p.photoURL ? (
                  <img src={p.photoURL} className="w-8 h-8 rounded-full object-cover" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate flex items-center gap-1">
                    {hasPriority && <span title="Priority">⭐</span>}
                    {p.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatSkillRating(getActiveSkillRating(p.ratings))} · {p.gamesPlayed}G
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function NextMatchCard({
  nextMatch,
  players,
  playingIds,
  onReplace,
  onRegenerate,
  onPlayerClick,
}: NextMatchCardProps) {
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [noAltMsg, setNoAltMsg] = useState(false);

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const allNextIds = new Set([
    ...nextMatch.teamA.playerIds,
    ...nextMatch.teamB.playerIds,
  ]);
  const waitingPlayers = players.filter(
    (p) =>
      (p.attendanceStatus === "WAITING" || p.attendanceStatus === "PRESENT") &&
      !allNextIds.has(p.id) &&
      !playingIds.has(p.id)
  );
  const replacingPlayer = replacingId ? getPlayer(replacingId) : null;

  const handleRegenerate = () => {
    const result = onRegenerate();
    if (result === "ok") {
      setShowWhy(false);
    } else {
      setNoAltMsg(true);
      setTimeout(() => setNoAltMsg(false), 3500);
    }
  };

  const renderTeam = (label: string, ids: string[]) => (
    <div className="flex-1 flex flex-col gap-2">
      <p className="text-xs font-black text-gray-500 uppercase tracking-wider text-center">
        {label}
      </p>
      {ids.map((id) => {
        const p = getPlayer(id);
        return p ? (
          <PlayerCard
            key={id}
            player={p}
            onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
            onReplace={() => setReplacingId(id)}
          />
        ) : null;
      })}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-violet-300 border-dashed overflow-hidden shadow-md relative">
      {/* Replace picker overlay */}
      {replacingPlayer && (
        <ReplacePicker
          outPlayer={replacingPlayer}
          waitingPlayers={waitingPlayers}
          onSelect={(inId) => { onReplace(replacingId!, inId); setReplacingId(null); }}
          onCancel={() => setReplacingId(null)}
        />
      )}

      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between border-b-2 bg-violet-50 border-violet-200">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-gray-900 text-xl">Next Up</h3>
          <span className="text-xs px-3 py-1 rounded-full font-bold border bg-violet-100 text-violet-800 border-violet-200">
            Queued
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWhy((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-xl font-bold border transition-colors ${
              showWhy
                ? "bg-violet-100 text-violet-700 border-violet-300"
                : "bg-white text-gray-500 border-violet-200 hover:bg-violet-50"
            }`}
            title="Why this match?"
          >
            ?
          </button>
          <button
            onClick={handleRegenerate}
            className="text-xs px-3 py-1.5 rounded-xl bg-white border border-violet-200 hover:bg-violet-100 text-violet-700 font-bold transition-colors"
            title="Regenerate next match"
          >
            ↻ Regenerate
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Why? info panel */}
        {showWhy && (
          <div className="mb-3 p-3 bg-violet-50 rounded-xl border border-violet-100 text-xs text-violet-800 space-y-1">
            <p className="font-black text-violet-700 mb-1">Why this queue?</p>
            {[...nextMatch.teamA.playerIds, ...nextMatch.teamB.playerIds].map((id) => {
              const p = players.find((pl) => pl.id === id);
              if (!p) return null;
              const waited = p.waitingSince ? Math.round((Date.now() - p.waitingSince) / 60000) : 0;
              return (
                <p key={id}>
                  <span className="font-bold">{p.name}</span> — {p.gamesPlayed}G played
                  {waited > 0 ? `, waited ${waited}m` : ""}
                  {(p.consecutiveGames ?? 0) === 0 ? "" : " (just recovered)"}
                </p>
              );
            })}
            <p className="text-violet-400 mt-1">Selected by: fewest games → longest wait → skill balance</p>
          </div>
        )}

        {/* No alternative message */}
        {noAltMsg && (
          <div className="mb-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium text-center">
            There are no other eligible players available — this is already the fairest possible match.
          </div>
        )}

        <div className="flex items-stretch gap-3 mb-3">
          {renderTeam("Team A", nextMatch.teamA.playerIds)}
          <div className="flex items-center justify-center px-2">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shadow-md">
              <span className="font-black text-white text-xs">VS</span>
            </div>
          </div>
          {renderTeam("Team B", nextMatch.teamB.playerIds)}
        </div>
        <p className="text-center text-xs text-gray-400 mt-1">
          Assigned when the next court finishes · Tap a player to replace
        </p>
      </div>
    </div>
  );
}
