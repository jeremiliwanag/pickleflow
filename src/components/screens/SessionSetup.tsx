import { useState } from "react";
import { useSessionStore } from "../../store/sessionStore";
import Button from "../ui/Button";
import Card from "../ui/Card";

interface SessionSetupProps {
  onStart: () => void;
  onShowHistory: () => void;
}

export default function SessionSetup({ onStart, onShowHistory }: SessionSetupProps) {
  const { createSession, session, updateCourt, startSession } =
    useSessionStore();
  const [name, setName] = useState("Friday Game");
  const [courtCount, setCourtCount] = useState(3);

  const handleCreate = () => {
    createSession(name, courtCount);
  };

const handleStart = () => {
    startSession();
    onStart();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-green-700">PickleFlow</h1>
          <p className="text-gray-500 text-sm">Session Setup</p>
        </div>
        <button
          onClick={onShowHistory}
          className="text-sm px-4 py-2 rounded-xl bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-600 font-bold transition-colors shadow-sm"
        >
          📋 History
        </button>
      </div>

      <Card className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Session Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </Card>

      <Card className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Courts
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setCourtCount(n)}
              className={`flex-1 py-3 rounded-xl font-bold text-lg border-2 transition-all ${
                courtCount === n
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>

{!session && (
        <Button label="Create Session" onClick={handleCreate} fullWidth />
      )}

      {session && session.state === "SETUP" && courtCount > 0 && (
        <>
          <Card className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Court Rotation Modes
            </p>
            {session.courts.map((court) => (
              <div
                key={court.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="font-medium">Court {court.number}</span>
                <div className="flex gap-2">
                  {(["FAIR_PLAY", "WINNER_VS_WINNER", "SOCIAL"] as const).map(
                    (mode) => (
                      <button
                        key={mode}
                        onClick={() =>
                          updateCourt(court.id, {
                            rotationMode: mode,
                            backToBackPolicy:
                              mode === "FAIR_PLAY" ? "STRICT" : "ALLOWED",
                          })
                        }
                        className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          court.rotationMode === mode
                            ? mode === "FAIR_PLAY"
                              ? "bg-emerald-600 text-white"
                              : mode === "WINNER_VS_WINNER"
                              ? "bg-orange-500 text-white"
                              : "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {mode === "FAIR_PLAY"
                          ? "Fair Play"
                          : mode === "WINNER_VS_WINNER"
                          ? "W vs W"
                          : "Social"}
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Button label="Next -- Add Players" onClick={handleStart} fullWidth />
        </>
      )}
    </div>
  );
}