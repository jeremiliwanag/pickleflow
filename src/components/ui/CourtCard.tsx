import { useState } from "react";
import type { Court, Player, Match, SessionRules, RotationMode } from "../../types";
import { formatSkillRating, getActiveRating as getActiveSkillRating } from "../../types";
import { getActiveRating } from "../../engine/fairness";
import PlayerCard from "./PlayerCard";
import CourtTimer from "./CourtTimer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CourtCardProps {
  court: Court;
  players: Player[];
  rules?: SessionRules;
  onClaimNextMatch: () => void;
  hasNextMatch: boolean;
  onStartMatch: () => void;
  onRegenerate: () => "ok" | "no_alternative";
  onReplacePlayer: (outId: string, inId: string) => void;
  onRecordWinner: (match: Match, result: "TEAM_A" | "TEAM_B") => void;
  onPlayerClick?: (player: Player) => void;
  onModeChange?: (mode: RotationMode) => void;
  onGenerate?: () => void;
}

// ── Replace player overlay ────────────────────────────────────────────────────

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

  // Sort: priority first → fewest games → longest wait → closest skill
  const sorted = [...waitingPlayers].sort((a, b) => {
    const aPriority = a.priority === true && (a.priorityGamesLeft ?? 0) > 0 ? 1 : 0;
    const bPriority = b.priority === true && (b.priorityGamesLeft ?? 0) > 0 ? 1 : 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    const aWait = a.waitingSince ?? Date.now();
    const bWait = b.waitingSince ?? Date.now();
    if (aWait !== bWait) return aWait - bWait; // earlier = longer wait
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

// ── Mode badge ────────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: RotationMode }) {
  const label =
    mode === "FAIR_PLAY" ? "Fair Play" : mode === "WINNER_VS_WINNER" ? "W vs W" : "Social";
  const cls =
    mode === "FAIR_PLAY"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : mode === "WINNER_VS_WINNER"
      ? "bg-orange-100 text-orange-800 border-orange-300"
      : "bg-blue-100 text-blue-800 border-blue-300";
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${cls}`}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CourtCard({
  court,
  players,
  rules,
  onClaimNextMatch,
  hasNextMatch,
  onStartMatch,
  onRegenerate,
  onReplacePlayer,
  onRecordWinner,
  onPlayerClick,
  onModeChange,
}: CourtCardProps) {
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  const match = court.currentMatch;
  // Ready = match waiting for organizer to press Start (no timer yet)
  const isReady = !!(match && match.result === "PENDING" && match.startTime === null);
  // Playing = match is live with the timer running
  const isPlaying = !!(match && match.result === "PENDING" && match.startTime !== null);
  const hasActiveMatch = isReady || isPlaying;

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  // Players in the active match — locked out of Replace picker
  const playingIds = new Set([
    ...(match?.teamA.playerIds ?? []),
    ...(match?.teamB.playerIds ?? []),
  ]);

  const waitingPlayers = players.filter(
    (p) =>
      (p.attendanceStatus === "WAITING" || p.attendanceStatus === "PRESENT") &&
      !playingIds.has(p.id)
  );

  const replacingPlayer = replacingId ? getPlayer(replacingId) : null;

  // ── Header state ────────────────────────────────────────────────────────────
  const isEmpty = !hasActiveMatch;

  const headerBg = isPlaying
    ? "bg-emerald-50 border-emerald-200"
    : isReady
    ? "bg-blue-50 border-blue-200"
    : "bg-gray-50 border-gray-200";

  const cardBorder = isPlaying
    ? "border-emerald-300"
    : isReady
    ? "border-blue-300 border-dashed"
    : "border-gray-200";

  const statusLabel = isPlaying ? "In Progress" : isReady ? "Ready" : "Empty";
  const statusCls = isPlaying
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : isReady
    ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  // ── Team renderer ───────────────────────────────────────────────────────────
  const renderTeam = (
    label: string,
    ids: string[],
    showReplace: boolean
  ) => (
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
            onReplace={showReplace ? () => setReplacingId(id) : undefined}
          />
        ) : null;
      })}
    </div>
  );

  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden shadow-md relative ${cardBorder}`}>
      {/* Replace picker overlay */}
      {replacingPlayer && (
        <ReplacePicker
          outPlayer={replacingPlayer}
          waitingPlayers={waitingPlayers}
          onSelect={(inId) => {
            onReplacePlayer(replacingId!, inId);
            setReplacingId(null);
          }}
          onCancel={() => setReplacingId(null)}
        />
      )}

      {/* Header */}
      <div className={`px-5 py-3 flex items-center justify-between border-b-2 ${headerBg}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-black text-gray-900 text-xl">Court {court.number}</h3>
          {onModeChange && isEmpty ? (
            <div className="flex gap-1">
              {(["FAIR_PLAY", "WINNER_VS_WINNER", "SOCIAL"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onModeChange(mode)}
                  className={`text-xs px-2 py-0.5 rounded-full font-bold border transition-colors ${
                    court.rotationMode === mode
                      ? mode === "FAIR_PLAY"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : mode === "WINNER_VS_WINNER"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-blue-500 text-white border-blue-500"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {mode === "FAIR_PLAY" ? "Fair" : mode === "WINNER_VS_WINNER" ? "W vs W" : "Social"}
                </button>
              ))}
            </div>
          ) : (
            <ModeBadge mode={court.rotationMode} />
          )}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-bold border ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">

        {/* ── EMPTY ─────────────────────────────────────────────────────────── */}
        {isEmpty && (
          hasNextMatch ? (
            <button
              onClick={onClaimNextMatch}
              className="w-full py-10 rounded-2xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-sm transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">▶</span>
              Take Next Match
            </button>
          ) : (
            <div className="w-full py-10 rounded-2xl border-2 border-dashed border-gray-200 text-gray-300 font-bold text-sm flex flex-col items-center gap-2">
              <span className="text-3xl">⏳</span>
              Waiting for next match…
            </div>
          )
        )}

        {/* ── READY current match ─────────────────────────────────────────── */}
        {isReady && match && (
          <div>
            <div className="flex items-stretch gap-3 mb-3">
              {renderTeam("Team A", match.teamA.playerIds, true)}
              <div className="flex items-center justify-center px-2">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                  <span className="font-black text-white text-xs">VS</span>
                </div>
              </div>
              {renderTeam("Team B", match.teamB.playerIds, true)}
            </div>

            {/* Why? info panel */}
            {showWhy && (
              <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-800 space-y-1">
                <p className="font-black text-blue-700 mb-1">Why this match?</p>
                {[...match.teamA.playerIds, ...match.teamB.playerIds].map((id) => {
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
                <p className="text-blue-500 mt-1">Selected by: fewest games → longest wait → skill balance</p>
              </div>
            )}

            {/* Regen feedback */}
            {regenMsg && (
              <p className="text-xs text-center text-amber-600 mb-2 font-medium">{regenMsg}</p>
            )}

            <div className="flex gap-2 mb-2">
              <button
                onClick={onStartMatch}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors shadow-sm"
              >
                ▶ Start Match
              </button>
              <button
                onClick={() => {
                  const result = onRegenerate();
                  if (result === "no_alternative") {
                    setRegenMsg("No other valid combination — this is already the fairest match.");
                    setTimeout(() => setRegenMsg(null), 3000);
                  } else {
                    setRegenMsg(null);
                  }
                }}
                className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                title="Regenerate match"
              >
                ↻
              </button>
              <button
                onClick={() => setShowWhy((v) => !v)}
                className={`px-3 py-3 rounded-xl text-sm font-bold transition-colors ${
                  showWhy ? "bg-blue-100 text-blue-700" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                }`}
                title="Why this match?"
              >
                ?
              </button>
            </div>
            <p className="text-center text-xs text-gray-400">
              Tap a player card to replace before starting
            </p>
          </div>
        )}

        {/* ── PLAYING current match ─────────────────────────────────────────
            Timer is running. Players are locked. Win buttons visible.    */}
        {isPlaying && match && (
          <div>
            <div className="flex items-stretch gap-3 mb-3">
              {renderTeam("Team A", match.teamA.playerIds, false)}
              <div className="flex items-center justify-center px-2">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
                  <span className="font-black text-white text-xs">VS</span>
                </div>
              </div>
              {renderTeam("Team B", match.teamB.playerIds, false)}
            </div>
            {match.startTime && rules && (
              <div className="mb-3">
                <CourtTimer startTime={match.startTime} limitMinutes={rules.matchDurationMinutes} />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => onRecordWinner(match, "TEAM_A")}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors shadow-sm"
              >
                Team A Wins
              </button>
              <button
                onClick={() => onRecordWinner(match, "TEAM_B")}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-black text-sm transition-colors shadow-sm"
              >
                Team B Wins
              </button>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
