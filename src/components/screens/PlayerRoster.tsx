import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import type { SkillTier } from "../../types";
import { formatSkillRating } from "../../types";

interface PlayerRosterProps {
  onStart: () => void;
  onBack: () => void;
}

const TIERS: SkillTier[] = [
  "BEGINNER",
  "NOVICE",
  "INTERMEDIATE",
  "ADVANCED",
  "ELITE",
];

const TIER_LABELS: Record<SkillTier, string> = {
  BEGINNER: "Beginner",
  NOVICE: "Novice",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ELITE: "Elite",
};

export default function PlayerRoster({
  onStart,
  onBack,
}: PlayerRosterProps) {
  const { session, addPlayer, removePlayer, setPlayerPaid } =
    useSessionStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<SkillTier>("BEGINNER");
  const [division, setDivision] = useState(1.0);

  if (!session) return null;

  const handleAddPlayer = () => {
    if (!name.trim()) return;
    addPlayer({
      name: name.trim(),
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
      waitingSince: null,
      consecutiveGames: 0,
      partners: [],
      opponents: [],
    });
    setName("");
    setTier("BEGINNER");
    setDivision(1.0);
    setShowForm(false);
  };

  const presentCount = session.players.filter(
    (p) => p.attendanceStatus !== "ABSENT"
  ).length;

  const paidCount = session.players.filter(
    (p) => p.payment.status === "PAID"
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-green-700">
            {session.name}
          </h1>
          <p className="text-gray-500 text-sm">Player Check-In</p>
        </div>
        <Button label="Back" onClick={onBack} variant="secondary" />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="text-center">
          <p className="text-2xl font-bold text-green-700">
            {session.players.length}
          </p>
          <p className="text-xs text-gray-500">Total</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-blue-600">{presentCount}</p>
          <p className="text-xs text-gray-500">Present</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-yellow-600">
            {session.players.length - paidCount}
          </p>
          <p className="text-xs text-gray-500">Unpaid</p>
        </Card>
      </div>

      {showForm && (
        <Card className="mb-4">
          <p className="font-semibold text-gray-700 mb-3">Add Player</p>

          <input
            type="text"
            placeholder="Player name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <p className="text-sm font-medium text-gray-600 mb-2">Skill Tier</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`px-3 py-1 rounded-lg text-sm font-medium border-2 ${
                  tier === t
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {TIER_LABELS[t]}
              </button>
            ))}
          </div>

          <p className="text-sm font-medium text-gray-600 mb-2">
            Division: {division.toFixed(1)}
          </p>
          <input
            type="range"
            min={1}
            max={5}
            step={0.1}
            value={division}
            onChange={(e) => setDivision(parseFloat(e.target.value))}
            className="w-full accent-green-600 mb-3"
          />
          <p className="text-xs text-gray-400 mb-3">
            Rating: {formatSkillRating({ tier, division })}
          </p>

          <div className="flex gap-2">
            <Button
              label="Add"
              onClick={handleAddPlayer}
              fullWidth
            />
            <Button
              label="Cancel"
              onClick={() => setShowForm(false)}
              variant="secondary"
              fullWidth
            />
          </div>
        </Card>
      )}

      <div className="mb-4 space-y-2">
        {session.players.map((player) => (
          <Card key={player.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{player.name}</p>
                <p className="text-xs text-gray-500">
                  {formatSkillRating(player.ratings.organizer ?? player.ratings.self)}
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
                  className="text-red-400 text-lg font-bold px-2"
                >
                  x
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!showForm && (
        <Button
          label="+ Add Player"
          onClick={() => setShowForm(true)}
          variant="secondary"
          fullWidth
        />
      )}

      {session.players.length >= 4 && (
        <div className="mt-3">
          <Button
            label="Start Session"
            onClick={onStart}
            fullWidth
          />
        </div>
      )}
    </div>
  );
}