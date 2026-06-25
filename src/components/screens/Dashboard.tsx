import { useSessionStore } from "../../store/sessionStore";
import Button from "../ui/Button";
import Card from "../ui/Card";

interface DashboardProps {
  onBack: () => void;
}

export default function Dashboard({ onBack }: DashboardProps) {
  const { session, generateRound, lastOutput } = useSessionStore();

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-green-700">
            {session.name}
          </h1>
          <p className="text-gray-500 text-sm">
            Round {session.currentRound} -- {session.players.length} Players
          </p>
        </div>
        <Button label="Back" onClick={onBack} variant="secondary" />
      </div>

      <Card className="mb-4">
        <p className="text-sm font-medium text-gray-500 mb-1">Courts</p>
        {session.courts.map((court) => (
          <div
            key={court.id}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <span className="font-semibold">Court {court.number}</span>
            <span className="text-sm text-gray-500">
              {court.rotationMode === "FAIR_PLAY"
                ? "Fair Play"
                : "Winner Stays"}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                court.currentMatch
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {court.currentMatch ? "Playing" : "Empty"}
            </span>
          </div>
        ))}
      </Card>

      <Card className="mb-4">
        <p className="text-sm font-medium text-gray-500 mb-2">
          Players ({session.players.length})
        </p>
        {session.players.length === 0 ? (
          <p className="text-gray-400 text-sm">No players added yet</p>
        ) : (
          session.players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <span className="font-medium">{player.name}</span>
              <span className="text-xs text-gray-500">
                {player.attendanceStatus}
              </span>
            </div>
          ))
        )}
      </Card>

      <Button
        label="Generate Next Round"
        onClick={generateRound}
        fullWidth
      />

      {lastOutput && (
        <Card className="mt-4">
          <p className="text-sm font-medium text-gray-500 mb-2">
            Last Round -- Fairness Score: {lastOutput.fairnessScore}%
          </p>
{lastOutput.assignments.map((a, i) => {
  const court = session.courts.find((c) => c.id === a.courtId);
  const getName = (id: string) =>
    session.players.find((p) => p.id === id)?.name ?? id;
  return (
    <div key={i} className="py-2 border-b last:border-0">
      <p className="text-xs text-gray-400 mb-1">
        Court {court?.number} -- {court?.rotationMode === "FAIR_PLAY" ? "Fair Play" : "Winner Stays"}
      </p>
      <p className="text-sm font-medium">
        {a.teamA.playerIds.map(getName).join(" + ")}
      </p>
      <p className="text-xs text-gray-400 text-center">vs</p>
      <p className="text-sm font-medium">
        {a.teamB.playerIds.map(getName).join(" + ")}
      </p>
    </div>
  );
})}
        </Card>
      )}
    </div>
  );
}