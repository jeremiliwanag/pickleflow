import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import { usePlayerStore } from "../../store/playerStore";
import Sidebar from "../ui/Sidebar";
import CourtCard from "../ui/CourtCard";
import NextMatchCard from "../ui/NextMatchCard";
import PlayerProfile from "../ui/PlayerProfile";
import SessionSummaryModal from "../ui/SessionSummaryModal";
import { uploadPlayerPhoto } from "../../db/storageDB";
import type { Match, SkillTier, RotationMode, Player, Session } from "../../types";

export default function MainDashboard() {
  const session = useSessionStore((s) => s.session);
  const generateNextMatch = useSessionStore((s) => s.generateNextMatch);
  const claimNextMatch = useSessionStore((s) => s.claimNextMatch);
  const replacePlayerInNextMatch = useSessionStore((s) => s.replacePlayerInNextMatch);
  const startMatch = useSessionStore((s) => s.startMatch);
  const replacePlayerInPending = useSessionStore((s) => s.replacePlayerInPending);
  const replacePlayerInCurrent = useSessionStore((s) => s.replacePlayerInCurrent);
  const setPriority = useSessionStore((s) => s.setPriority);
  const recordResult = useSessionStore((s) => s.recordResult);
  const pauseSession = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const endSession = useSessionStore((s) => s.endSession);
  const setPlayerStatus = useSessionStore((s) => s.setPlayerStatus);
  const addPlayerToActiveSession = useSessionStore((s) => s.addPlayerToActiveSession);
  const removePlayer = useSessionStore((s) => s.removePlayer);
  const updateCourt = useSessionStore((s) => s.updateCourt);
  const updateSessionPlayer = useSessionStore((s) => s.updatePlayer);

  const addCommunityRating = usePlayerStore((s) => s.addCommunityRating);
  const updatePlayerPhoto = usePlayerStore((s) => s.updatePlayerPhoto);
  const updateRating = usePlayerStore((s) => s.updateRating);
  const resetCommunityRatings = usePlayerStore((s) => s.resetCommunityRatings);
  const addToRoster = usePlayerStore((s) => s.addToRoster);

  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);
  const [summarySession, setSummarySession] = useState<Session | null>(null);

  if (!session) {
    if (summarySession) {
      return (
        <SessionSummaryModal
          session={summarySession}
          onClose={() => setSummarySession(null)}
        />
      );
    }
    return null;
  }

  const profilePlayer: Player | null =
    profilePlayerId
      ? (session.players.find((p) => p.id === profilePlayerId) ?? null)
      : null;

  const handleRecordWinner = (match: Match, result: "TEAM_A" | "TEAM_B") => {
    void recordResult(match, result);
  };

  const handlePlayerStatusChange = (
    playerId: string,
    status: "PRESENT" | "RESTING" | "LEFT"
  ) => {
    setPlayerStatus(playerId, status);
  };

  const handleAddPlayer = (name: string, tier: SkillTier, division: number) => {
    addPlayerToActiveSession({
      name,
      ratings: { self: { tier, division }, community: [], system: null },
      attendanceStatus: "PRESENT",
      payment: { status: "UNPAID" },
      leavingSoon: null,
      notes: "",
      gamesPlayed: 0,
      gamesWon: 0,
      waitingSince: Date.now(),
      consecutiveGames: 0,
      partners: [],
      opponents: [],
    });
    void addToRoster(name, tier, division);
  };

  const handleEnd = async () => {
    setSummarySession({ ...session, state: "ENDED", endedAt: Date.now() });
    await endSession();
  };

  const handleModeChange = (courtId: string, mode: RotationMode) => {
    updateCourt(courtId, {
      rotationMode: mode,
      backToBackPolicy: mode === "FAIR_PLAY" ? "STRICT" : "ALLOWED",
    });
  };

  const activeCourts = session.courts.filter((c) => c.isActive);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {profilePlayer && (
        <PlayerProfile
          player={profilePlayer}
          onClose={() => setProfilePlayerId(null)}
          onRatePlayer={async (tier, division) => {
            await addCommunityRating(profilePlayer.id, tier, division);
            const { roster } = usePlayerStore.getState();
            const updated = roster.find((p) => p.id === profilePlayer.id);
            if (updated) updateSessionPlayer(profilePlayer.id, { ratings: updated.ratings });
          }}
          onPhotoUpload={async (file) => {
            const url = await uploadPlayerPhoto(profilePlayer.id, file);
            await updatePlayerPhoto(profilePlayer.id, url);
            updateSessionPlayer(profilePlayer.id, { photoURL: url });
          }}
          onUpdateSelfRating={async (tier, division) => {
            // Update the session player directly — roster may have a different ID
            const newRatings = {
              ...profilePlayer.ratings,
              self: { tier, division },
            };
            updateSessionPlayer(profilePlayer.id, { ratings: newRatings });
            // Best-effort roster sync (may be a no-op if IDs differ)
            await updateRating(profilePlayer.id, "self", tier, division).catch(() => {});
          }}
          onResetCommunityRatings={async () => {
            await resetCommunityRatings(profilePlayer.id);
            const { roster } = usePlayerStore.getState();
            const updated = roster.find((p) => p.id === profilePlayer.id);
            if (updated) updateSessionPlayer(profilePlayer.id, { ratings: updated.ratings });
          }}
        />
      )}

      <Sidebar
        session={session}
        onPause={pauseSession}
        onResume={resumeSession}
        onEnd={handleEnd}
        onPlayerStatusChange={handlePlayerStatusChange}
        onSetPriority={setPriority}
        onAddPlayer={handleAddPlayer}
        onDeletePlayer={removePlayer}
        onAddCommunityRating={async (playerId, tier, division) => {
          await addCommunityRating(playerId, tier, division);
          const { roster } = usePlayerStore.getState();
          const updated = roster.find((p) => p.id === playerId);
          if (updated) updateSessionPlayer(playerId, { ratings: updated.ratings });
        }}
        onUpdatePlayerPhoto={async (playerId, photoURL) => {
          await updatePlayerPhoto(playerId, photoURL);
          updateSessionPlayer(playerId, { photoURL });
        }}
        onUpdateSelfRating={async (playerId, tier, division) => {
          const player = session.players.find((p) => p.id === playerId);
          if (player) {
            updateSessionPlayer(playerId, {
              ratings: { ...player.ratings, self: { tier, division } },
            });
          }
          await updateRating(playerId, "self", tier, division).catch(() => {});
        }}
        onResetCommunityRatings={async (playerId) => {
          await resetCommunityRatings(playerId);
          const { roster } = usePlayerStore.getState();
          const updated = roster.find((p) => p.id === playerId);
          if (updated) updateSessionPlayer(playerId, { ratings: updated.ratings });
        }}
      />

      <div className="flex-1 p-6 overflow-y-auto h-screen">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{session.name}</h2>
          <p className="text-gray-600 text-sm">
            Round {session.currentRound} · {session.players.length} Players
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {activeCourts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              players={session.players}
              rules={session.rules}
              hasNextMatch={!!session.nextMatch}
              onClaimNextMatch={() => claimNextMatch(court.id)}
              onStartMatch={() => startMatch(court.id)}
              onReplacePlayer={(outId, inId) => {
                const c = session.courts.find((c) => c.id === court.id);
                const inReadyCurrent =
                  c?.currentMatch?.startTime === null &&
                  [
                    ...(c.currentMatch?.teamA.playerIds ?? []),
                    ...(c.currentMatch?.teamB.playerIds ?? []),
                  ].includes(outId);
                if (inReadyCurrent) {
                  replacePlayerInCurrent(court.id, outId, inId);
                } else {
                  replacePlayerInPending(court.id, outId, inId);
                }
              }}
              onRecordWinner={handleRecordWinner}
              onModeChange={(mode) => handleModeChange(court.id, mode)}
              onPlayerClick={(p) => setProfilePlayerId(p.id)}
            />
          ))}

          {/* Global Next Match card — appears in the next grid slot */}
          {session.nextMatch && (
            <NextMatchCard
              nextMatch={session.nextMatch}
              players={session.players}
              onReplace={(outId, inId) => replacePlayerInNextMatch(outId, inId)}
              onRegenerate={() => generateNextMatch()}
              onPlayerClick={(p) => setProfilePlayerId(p.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
