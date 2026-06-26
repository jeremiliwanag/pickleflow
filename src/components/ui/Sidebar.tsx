import { useState } from "react";
import type { Session, SkillTier, Player } from "../../types";
import { getSessionFairnessScore } from "../../engine/fairness";
import { getActiveRating } from "../../types";
import { uploadPlayerPhoto } from "../../db/storageDB";
import PlayerCard from "./PlayerCard";
import PlayerProfile from "./PlayerProfile";
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
}: SidebarProps) {
  const fairness = getSessionFairnessScore(session);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);

  const paidCount = session.players.filter(
    (p) => p.payment.status === "PAID"
  ).length;
  const unpaidCount = session.players.length - paidCount;

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
          onClose={() => setProfilePlayer(null)}
          onRatePlayer={(tier, division) => {
            if (onAddCommunityRating) {
              void onAddCommunityRating(profilePlayer.id, tier, division);
            }
          }}
          onPhotoUpload={async (file) => {
            const url = await uploadPlayerPhoto(profilePlayer.id, file);
            if (onUpdatePlayerPhoto) {
              await onUpdatePlayerPhoto(profilePlayer.id, url);
            }
          }}
        />
      )}

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
        <h1 className="text-2xl font-black tracking-tight text-white">
          PickleFlow
        </h1>
        <p className="text-green-300 text-sm mt-0.5">{session.name}</p>
        <span className="text-xs bg-green-600 text-white px-3 py-1 rounded-full mt-2 inline-block font-semibold tracking-wide">
          {session.state}
        </span>
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
        <p className="text-green-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Payments
        </p>
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
                {unpaidCount}
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
                onClick={() => setProfilePlayer(player)}
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
                  onClick={() => setProfilePlayer(player)}
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