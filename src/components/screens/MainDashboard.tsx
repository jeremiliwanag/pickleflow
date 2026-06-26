import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import Sidebar from "../ui/Sidebar";
import CourtCard from "../ui/CourtCard";
import Button from "../ui/Button";
import type { Match, SkillTier } from "../../types";

export default function MainDashboard() {
const {
    session,
    generateRound,
    recordResult,
    applyAssignments,
    lastOutput,
    pauseSession,
    resumeSession,
    endSession,
    setPlayerStatus,
    addPlayerToActiveSession,
    removePlayer,
    updateCourt,
  } = useSessionStore();

const [_replacing, setReplacing] = useState<string | null>(null);

  if (!session) return null;

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
        organizer: null,
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

  const activeCourts = session.courts.filter((c) => c.isActive);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        session={session}
        onPause={pauseSession}
        onResume={resumeSession}
        onEnd={endSession}
        onPlayerStatusChange={handlePlayerStatusChange}
        onAddPlayer={handleAddPlayer}
        onDeletePlayer={handleDeletePlayer}
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