import { useState } from "react";
import type { Session, SkillTier, Player } from "../../types";
import { getSessionFairnessScore } from "../../engine/fairness";
import { getActiveRating } from "../../types";
import { uploadPlayerPhoto } from "../../db/storageDB";
import PlayerCard from "./PlayerCard";
import PlayerProfile from "./PlayerProfile";
import RosterManager from "./RosterManager";
import Button from "./Button";
import PlayerPicker from "../screens/PlayerPicker";

interface SidebarProps {
  session: Session;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onPlayerStatusChange: (
    playerId: string,
    status: "PRESENT" | "RESTING" | "LEFT"
  ) => void;
  onAddPlayer: (
    name: string,
    tier: SkillTier,
    division: number
  ) => void;
  onDeletePlayer: (playerId: string) => void;
  onAddCommunityRating?: (
    playerId: string,
    tier: SkillTier,
    division: number
  ) => Promise<void>;
  onUpdatePlayerPhoto?: (playerId: string, photoURL: string) => Promise<void>;
  onUpdateSelfRating?: (
    playerId: string,
    tier: SkillTier,
    division: number
  ) => Promise<void>;
}

export default function Sidebar({
  session,
  onPause,
  onResume,
  onEnd,
  onPlayerStatusChange,
  onAddPlayer,
  onDeletePlayer,
  onAddCommunityRating,
  onUpdatePlayerPhoto,
  onUpdateSelfRating,
}: SidebarProps) {
  const fairness = getSessionFairnessScore(session);
  const [showPicker, setShowPicker] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Track by ID so the profile always shows the latest player data from session
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);

  // Court cost calculator state
  const [courtRate, setCourtRate] = useState(500);
  const [courtHours, setCourtHours] = useState(1);
  const [showCostCalc, setShowCostCalc] = useState(false);

  // Always derive live from session.players so community ratings update in place
  const profilePlayer: Player | null =
    profilePlayerId
      ? (session.players.find((p) => p.id === profilePlayerId) ?? null)
      : null;

  const paidCount = session.players.filter(
    (p) => p.payment.status === "PAID"
  ).length;
  const unpaidCount = session.players.length - paidCount;

  const activePlayers = session.players.filter(
    (p) => p.attendanceStatus !== "LEFT"
  );
  const activeCourtsCount = session.courts.filter((c) => c.isActive).length;
  const totalCourtCost = courtRate * courtHours * activeCourtsCount;
  const perPlayerCost =
    activePlayers.length > 0
      ? Math.ceil(totalCourtCost / activePlayers.length)
      : 0;

  const waitingPlayers = session.players.filter(
    (p) =>
      p.attendanceStatus === "WAITING" ||
      p.attendanceStatus === "PRESENT"
  );

  const restingPlayers = session.players.filter(
    (p) => p.attendanceStatus === "RESTING"
  );

  const leftPlayers = session.players.filter(
    (p) => p.attendanceStatus === "LEFT"
  );

  const playingPlayers = session.players.filter(
    (p) => p.attendanceStatus === "PLAYING"
  );

  const fairnessColor =
    fairness >= 90
      ? "text-emerald-300"
      : fairness >= 70
      ? "text-yellow-300"
      : "text-red-300";

  const handleDeleteFinal = () => {
    if (confirmDeleteId) {
      onDeletePlayer(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="w-96 h-screen sticky top-0 bg-green-900 text-white flex flex-col flex-shrink-0 overflow-hidden">

      {/* Player Profile Panel */}
      {profilePlayer && (
        <PlayerProfile
          player={profilePlayer}
          onClose={() => setProfilePlayerId(null)}
          onRatePlayer={async (tier, division) => {
            if (onAddCommunityRating) {
              await onAddCommunityRating(profilePlayer.id, tier, division);
            }
          }}
          onPhotoUpload={async (file) => {
            const url = await uploadPlayerPhoto(profilePlayer.id, file);
            if (onUpdatePlayerPhoto) {
              await onUpdatePlayerPhoto(profilePlayer.id, url);
            }
          }}
          onUpdateSelfRating={
            onUpdateSelfRating
              ? async (tier, division) => {
                  await onUpdateSelfRating(profilePlayer.id, tier, division);
                }
              : undefined
          }
        />
      )}

      {/* Roster Manager Modal */}
      {showRoster && <RosterManager onClose={() => setShowRoster(false)} />}

      {/* Player Picker Modal */}
      {showPicker && (
        <PlayerPicker
          existingPlayerIds={session.players.map((p) => p.name)}
          onAddPlayers={(players: Player[]) => {
            for (const player of players) {
              const active = getActiveRating(player.ratings);
              onAddPlayer(player.name, active.tier, active.division);
            }
            setShowPicker(false);
          }}
          onNewPlayer={(name, tier, division) => {
            onAddPlayer(name, tier, division);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="font-black text-gray-900 text-lg mb-2">
              Remove Player?
            </h3>
            <p className="text-gray-600 text-sm mb-5">
              Remove{" "}
              <span className="font-bold text-gray-900">
                {session.players.find((p) => p.id === confirmDeleteId)?.name}
              </span>{" "}
              from this session?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteFinal}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-colors"
              >
                Yes, Remove
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

      {/* Header */}
      <div className="p-5 border-b border-green-700">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              PickleFlow
            </h1>
            <p className="text-green-300 text-sm mt-0.5">{session.name}</p>
            <span className="text-xs bg-green-600 text-white px-3 py-1 rounded-full mt-2 inline-block font-semibold tracking-wide">
              {session.state}
            </span>
          </div>
          <button
            onClick={() => setShowRoster(true)}
            className="flex flex-col items-center gap-0.5 text-green-400 hover:text-white transition-colors mt-1"
            title="Manage Roster"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span className="text-xs font-semibold">Roster</span>
          </button>
        </div>
      </div>

      {/* Fairness */}
      <div className="p-5 border-b border-green-700">
        <p className="text-green-400 text-xs font-semibold uppercase tracking-widest mb-1">
          Fairness Score
        </p>
        <p className={`text-6xl font-black leading-none ${fairnessColor}`}>
          {fairness}%
        </p>
        <p className="text-green-400 text-sm mt-2">
          Round {session.currentRound}
        </p>
      </div>

      {/* Player Counts */}
      <div className="p-5 border-b border-green-700">
        <p className="text-green-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Players
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-green-800 rounded-xl p-2">
            <p className="text-xl font-black text-white">
              {session.players.length}
            </p>
            <p className="text-green-400 text-xs">Total</p>
          </div>
          <div className="bg-green-800 rounded-xl p-2">
            <p className="text-xl font-black text-emerald-300">
              {playingPlayers.length}
            </p>
            <p className="text-green-400 text-xs">Playing</p>
          </div>
          <div className="bg-green-800 rounded-xl p-2">
            <p className="text-xl font-black text-yellow-300">
              {waitingPlayers.length}
            </p>
            <p className="text-green-400 text-xs">Waiting</p>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="p-5 border-b border-green-700">
        <div className="flex items-center justify-between mb-3">
          <p className="text-green-400 text-xs font-semibold uppercase tracking-widest">
            Payments
          </p>
          <button
            onClick={() => setShowCostCalc((v) => !v)}
            className="text-xs px-2 py-0.5 rounded-lg bg-green-700 hover:bg-green-600 text-green-200 font-semibold transition-colors"
          >
            {showCostCalc ? "Hide" : "Court Cost"}
          </button>
        </div>

        {/* Court Cost Calculator */}
        {showCostCalc && (
          <div className="mb-3 bg-green-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-green-300 text-xs w-20 flex-shrink-0">
                ₱/hour
              </label>
              <input
                type="number"
                min={0}
                value={courtRate}
                onChange={(e) => setCourtRate(Math.max(0, Number(e.target.value)))}
                className="flex-1 bg-green-700 border border-green-600 rounded-lg px-2 py-1 text-white text-sm font-semibold text-right focus:outline-none focus:border-emerald-400 w-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-green-300 text-xs w-20 flex-shrink-0">
                Hours
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={courtHours}
                onChange={(e) => setCourtHours(Math.max(0.5, Number(e.target.value)))}
                className="flex-1 bg-green-700 border border-green-600 rounded-lg px-2 py-1 text-white text-sm font-semibold text-right focus:outline-none focus:border-emerald-400 w-0"
              />
            </div>
            <div className="border-t border-green-700 pt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-green-400">
                  Total court cost ({activeCourtsCount} court{activeCourtsCount !== 1 ? "s" : ""})
                </span>
                <span className="text-white font-bold">
                  ₱{totalCourtCost.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-green-400">
                  Players ({activePlayers.length})
                </span>
                <span className="text-emerald-300 font-black text-sm">
                  ₱{perPlayerCost.toLocaleString()} each
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-green-300 text-sm">Paid</span>
            <span className="font-bold text-emerald-300 text-sm">
              {paidCount} / {session.players.length}
            </span>
          </div>
          {unpaidCount > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-green-300 text-sm">Outstanding</span>
              <span className="font-bold text-yellow-300 text-sm">
                {unpaidCount} player{unpaidCount !== 1 ? "s" : ""}
                {showCostCalc && perPlayerCost > 0 && (
                  <span className="text-yellow-400 font-normal ml-1">
                    · ₱{(unpaidCount * perPlayerCost).toLocaleString()} total
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Player Lists */}
      <div className="p-5 flex-1 overflow-hidden flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-green-400 text-xs font-semibold uppercase tracking-widest">
            Waiting ({waitingPlayers.length})
          </p>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
          >
            + Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
          {waitingPlayers.map((player) => (
            <div key={player.id} className="relative group">
              <PlayerCard
                player={player}
                compact
                showStatus
                onClick={() => setProfilePlayerId(player.id)}
                onStatusChange={(status) =>
                  onPlayerStatusChange(
                    player.id,
                    status as "PRESENT" | "RESTING" | "LEFT"
                  )
                }
              />
              <button
                onClick={() => setConfirmDeleteId(player.id)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-xs bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center transition-all"
              >
                x
              </button>
            </div>
          ))}
          {waitingPlayers.length === 0 && (
            <p className="text-green-600 text-sm italic">
              All players are on court
            </p>
          )}
        </div>

        {restingPlayers.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-green-400 text-xs font-semibold uppercase tracking-widest">
              Resting ({restingPlayers.length})
            </p>
            {restingPlayers.map((player) => (
              <div key={player.id} className="relative group">
                <PlayerCard
                  player={player}
                  compact
                  showStatus
                  onClick={() => setProfilePlayerId(player.id)}
                  onStatusChange={(status) =>
                    onPlayerStatusChange(
                      player.id,
                      status as "PRESENT" | "RESTING" | "LEFT"
                    )
                  }
                />
                <button
                  onClick={() => setConfirmDeleteId(player.id)}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-xs bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center transition-all"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {leftPlayers.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-green-400 text-xs font-semibold uppercase tracking-widest">
              Left ({leftPlayers.length})
            </p>
            {leftPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 opacity-60"
              >
                <div className="flex-1">
                  <p className="font-bold text-white text-sm">
                    {player.name}
                  </p>
                  <p className="text-green-400 text-xs">Left session</p>
                </div>
                <button
                  onClick={() =>
                    onPlayerStatusChange(player.id, "PRESENT")
                  }
                  className="text-xs px-2 py-1 rounded-lg border border-emerald-400 text-emerald-300 hover:bg-emerald-800 transition-colors font-semibold"
                >
                  Rejoin
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Buttons */}
      <div className="p-5 border-t border-green-700 flex flex-col gap-2">
        {session.state === "ACTIVE" ? (
          <Button
            label="Pause Session"
            onClick={onPause}
            variant="secondary"
            fullWidth
          />
        ) : (
          <Button
            label="Resume Session"
            onClick={onResume}
            fullWidth
          />
        )}
        <Button
          label="End Session"
          onClick={onEnd}
          variant="danger"
          fullWidth
        />
      </div>
    </div>
  );
}
