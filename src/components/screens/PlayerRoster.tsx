import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import { usePlayerStore } from "../../store/playerStore";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import PlayerPicker from "./PlayerPicker";
import { formatSkillRating, getActiveRating } from "../../types";
import type { Player, SkillTier } from "../../types";

interface PlayerRosterProps {
  onStart: () => void;
  onBack: () => void;
}

export default function PlayerRoster({
  onStart,
  onBack,
}: PlayerRosterProps) {
  const { session, addPlayer, removePlayer, setPlayerPaid, startSession } =
    useSessionStore();
  const { addToRoster } = usePlayerStore();

  const [showPicker, setShowPicker] = useState(false);

  if (!session) return null;

const handleAddPlayers = (players: Player[]) => {
    for (const player of players) {
      addPlayer({
        ...player,
        attendanceStatus: "PRESENT",
        payment: { status: "UNPAID" },
        gamesPlayed: 0,
        gamesWon: 0,
        waitingSince: null,
        consecutiveGames: 0,
        partners: [],
        opponents: [],
      });
    }
  };

  const handleNewPlayer = async (
    name: string,
    tier: SkillTier,
    division: number
  ) => {
    await addToRoster(name, tier, division);
    addPlayer({
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
      waitingSince: null,
      consecutiveGames: 0,
      partners: [],
      opponents: [],
    });
  };

  const handleStart = () => {
    startSession();
    onStart();
  };

  const presentCount = session.players.filter(
    (p) => p.attendanceStatus !== "ABSENT"
  ).length;

  const paidCount = session.players.filter(
    (p) => p.payment.status === "PAID"
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto">
      {showPicker && (
        <PlayerPicker
          existingPlayerIds={session.players.map((p) => p.name)}
          onAddPlayers={handleAddPlayers}
          onNewPlayer={handleNewPlayer}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-green-700">
            {session.name}
          </h1>
          <p className="text-gray-500 text-sm">Player Check-In</p>
        </div>
        <Button label="Back" onClick={onBack} variant="secondary" />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="text-center py-3">
          <p className="text-3xl font-black text-green-700">
            {session.players.length}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-1">Total</p>
        </Card>
        <Card className="text-center py-3">
          <p className="text-3xl font-black text-blue-600">{presentCount}</p>
          <p className="text-xs text-gray-500 font-medium mt-1">Present</p>
        </Card>
        <Card className="text-center py-3">
          <p className="text-3xl font-black text-yellow-600">
            {session.players.length - paidCount}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-1">Unpaid</p>
        </Card>
      </div>

      <div className="mb-4 space-y-2">
        {session.players.map((player) => {
          const rating = getActiveRating(player.ratings);
          return (
            <Card key={player.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-gray-900">{player.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatSkillRating(rating)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setPlayerPaid(
                        player.id,
                        player.payment.status !== "PAID"
                      )
                    }
                  >
                    <Badge
                      label={
                        player.payment.status === "PAID" ? "Paid" : "Unpaid"
                      }
                      color={
                        player.payment.status === "PAID" ? "green" : "yellow"
                      }
                    />
                  </button>
                  <button
                    onClick={() => removePlayer(player.id)}
                    className="text-red-400 hover:text-red-600 text-lg font-black px-2 transition-colors"
                  >
                    x
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Button
        label="+ Add Players"
        onClick={() => setShowPicker(true)}
        variant="secondary"
        fullWidth
      />

      {session.players.length >= 4 && (
        <div className="mt-3">
          <Button
            label={`Start Session (${session.players.length} players)`}
            onClick={handleStart}
            fullWidth
          />
        </div>
      )}
    </div>
  );
}