import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import { usePlayerStore } from "../../store/playerStore";
import Sidebar from "../ui/Sidebar";
import CourtCard from "../ui/CourtCard";
import PlayerProfile from "../ui/PlayerProfile";
import Button from "../ui/Button";
import { uploadPlayerPhoto } from "../../db/storageDB";
import type { Match, SkillTier, RotationMode, Player } from "../../types";

export default function MainDashboard() {
  const session = useSessionStore((s) => s.session);
  const generateRound = useSessionStore((s) => s.generateRound);
  const recordResult = useSessionStore((s) => s.recordResult);
  const applyAssignments = useSessionStore((s) => s.applyAssignments);
  const lastOutput = useSessionStore((s) => s.lastOutput);
  const pauseSession = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const endSession = useSessionStore((s) => s.endSession);
  const setPlayerStatus = useSessionStore((s) => s.setPlayerStatus);
  const addPlayerToActiveSession = useSessionStore((s) => s.addPlayerToActiveSession);
  const removePlayer = useSessionStore((s) => s.removePlayer);
  const updateCourt = useSessionStore((s) => s.updateCourt);

  const addCommunityRating = usePlayerStore((s) => s.addCommunityRating);
  const updatePlayerPhoto = usePlayerStore((s) => s.updatePlayerPhoto);
  const updateSessionPlayer = useSessionStore((s) => s.updatePlayer);

  const [_replacing, setReplacing] = useState<string | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);

  if (!session) return null;

  // Always derive live from session so community ratings update without re-opening
  const profilePlayer: Player | null =
    profilePlayerId
      ? (session.players.find((p) => p.id === profilePlayerId) ?? null)
      : null;

  const handleRecordWinner = (match: Match, result: "TEAM_A" | "TEAM_B") => {
    recordResult(match, result);
  };

  const handleGenerateRound = () => {
    generateRound();
    const { lastOutput } = useSessionStore.getState();
    if (lastOutput) {
      applyAssignments(lastOutput.assignments);
    }
  };

  const handlePlayerStatusChange = (
    playerId: string,
    status: "PRESENT" | "RESTING" | "LEFT"
  ) => {
    setPlayerStatus(playerId, status);
  };

  const handleAddPlayer = (
    name: string,
    tier: SkillTier,
    division: number
  ) => {
    addPlayerToActiveSession({
      name,
      ratings: {
        self: { tier, division },
        community: [],
        system: null,
      },
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
  };

  const handleDeletePlayer = (playerId: string) => {
    removePlayer(playerId);
  };

  const handleReplacePlayer = (playerId: string) => {
    setReplacing(playerId);
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
            // Sync community ratings from roster back into the session player
            const { roster } = usePlayerStore.getState();
            const updated = roster.find((p) => p.id === profilePlayer.id);
            if (updated) updateSessionPlayer(profilePlayer.id, { ratings: updated.ratings });
          }}
          onPhotoUpload={async (file) => {
            const url = await uploadPlayerPhoto(profilePlayer.id, file);
            await updatePlayerPhoto(profilePlayer.id, url);
            updateSessionPlayer(profilePlayer.id, { photoURL: url });
          }}
        />
      )}

      <Sidebar
        session={session}
        onPause={pauseSession}
        onResume={resumeSession}
        onEnd={endSession}
        onPlayerStatusChange={handlePlayerStatusChange}
        onAddPlayer={handleAddPlayer}
        onDeletePlayer={handleDeletePlayer}
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
      />

      <div className="flex-1 p-6 overflow-y-auto h-screen">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {session.name}
            </h2>
            <p className="text-gray-600 text-sm">
              Round {session.currentRound} --{" "}
              {session.players.length} Players
            </p>
          </div>
          <Button
            label="Generate Next Round"
            onClick={handleGenerateRound}
            disabled={session.state !== "ACTIVE"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {activeCourts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              players={session.players}
              onRecordWinner={handleRecordWinner}
              onReplacePlayer={handleReplacePlayer}
              onModeChange={(mode) => handleModeChange(court.id, mode)}
              onPlayerClick={(p) => setProfilePlayerId(p.id)}
            />
          ))}

          {lastOutput && lastOutput.assignments.length > 0 && (
            <div className="xl:col-span-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">
                Next Round Preview
              </p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {lastOutput.assignments.map((assignment, i) => {
                  const court = session.courts.find(
                    (c) => c.id === assignment.courtId
                  );
                  if (!court) return null;
                  return (
                    <CourtCard
                      key={i}
                      court={court}
                      players={session.players}
                      onRecordWinner={handleRecordWinner}
                      isNextUp
                      teamA={assignment.teamA.playerIds}
                      teamB={assignment.teamB.playerIds}
                      onReplacePlayer={handleReplacePlayer}
                      onPlayerClick={(p) => setProfilePlayerId(p.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}