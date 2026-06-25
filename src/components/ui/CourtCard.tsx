import type { Court, Player, Match } from "../../types";
import PlayerCard from "./PlayerCard";

interface CourtCardProps {
  court: Court;
  players: Player[];
  onRecordWinner: (match: Match, result: "TEAM_A" | "TEAM_B") => void;
  onReplacePlayer?: (playerId: string) => void;
  isNextUp?: boolean;
  teamA?: string[];
  teamB?: string[];
}

export default function CourtCard({
  court,
  players,
  onRecordWinner,
  onReplacePlayer,
  isNextUp = false,
  teamA = [],
  teamB = [],
}: CourtCardProps) {
  const match = court.currentMatch;
  const teamAIds = match ? match.teamA.playerIds : teamA;
  const teamBIds = match ? match.teamB.playerIds : teamB;

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const modeLabel =
    court.rotationMode === "FAIR_PLAY" ? "Fair Play" : "Winner Stays";

  const modeBadge =
    court.rotationMode === "FAIR_PLAY"
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
      : "bg-orange-100 text-orange-800 border border-orange-300";

  return (
    <div
      className={`bg-white rounded-2xl border-2 overflow-hidden shadow-md ${
        isNextUp
          ? "border-dashed border-gray-300"
          : match
          ? "border-emerald-300"
          : "border-gray-200"
      }`}
    >
      <div
        className={`px-5 py-3 flex items-center justify-between border-b-2 ${
          isNextUp
            ? "bg-gray-50 border-gray-200"
            : match
            ? "bg-emerald-50 border-emerald-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-black text-gray-900 text-xl">
            {isNextUp ? "Next Up" : `Court ${court.number}`}
          </h3>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${modeBadge}`}
          >
            {modeLabel}
          </span>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-bold ${
            isNextUp
              ? "bg-blue-100 text-blue-800 border border-blue-200"
              : match
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-gray-100 text-gray-600 border border-gray-200"
          }`}
        >
          {isNextUp ? "Preview" : match ? "In Progress" : "Empty"}
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-stretch gap-3">
          <div className="flex-1 flex flex-col gap-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider text-center">
              Team A
            </p>
            {teamAIds.map((id) => {
              const player = getPlayer(id);
              return player ? (
                <PlayerCard
                  key={id}
                  player={player}
                  onReplace={
                    onReplacePlayer
                      ? () => onReplacePlayer(id)
                      : undefined
                  }
                />
              ) : null;
            })}
          </div>

          <div className="flex items-center justify-center px-2">
            <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
              <span className="font-black text-white text-sm">VS</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider text-center">
              Team B
            </p>
            {teamBIds.map((id) => {
              const player = getPlayer(id);
              return player ? (
                <PlayerCard
                  key={id}
                  player={player}
                  onReplace={
                    onReplacePlayer
                      ? () => onReplacePlayer(id)
                      : undefined
                  }
                />
              ) : null;
            })}
          </div>
        </div>

        {match && !isNextUp && (
          <div className="mt-5 flex gap-3">
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
        )}
      </div>
    </div>
  );
}