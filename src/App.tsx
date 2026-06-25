import { useState } from "react";
import SessionSetup from "./components/screens/SessionSetup";
import PlayerRoster from "./components/screens/PlayerRoster";
import Dashboard from "./components/screens/Dashboard";

type Screen = "setup" | "roster" | "dashboard";

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");

  return (
    <div className="min-h-screen bg-gray-50">
      {screen === "setup" && (
        <SessionSetup onStart={() => setScreen("roster")} />
      )}
      {screen === "roster" && (
        <PlayerRoster
          onStart={() => setScreen("dashboard")}
          onBack={() => setScreen("setup")}
        />
      )}
      {screen === "dashboard" && (
        <Dashboard onBack={() => setScreen("setup")} />
      )}
    </div>
  );
}