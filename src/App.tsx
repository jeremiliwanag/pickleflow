import { useState, useEffect } from "react";
import SessionSetup from "./components/screens/SessionSetup";
import MainDashboard from "./components/screens/MainDashboard";
import SessionHistory from "./components/screens/SessionHistory";
import { useSessionStore } from "./store/sessionStore";

type Screen = "setup" | "dashboard";

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const { loadLatestSession, session } = useSessionStore();

  useEffect(() => {
    const init = async () => {
      await loadLatestSession();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (session && (session.state === "ACTIVE" || session.state === "PAUSED")) {
      setScreen("dashboard");
    }
    if (!session || session.state === "ENDED") {
      setScreen("setup");
    }
  }, [loading, session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-black text-green-700 mb-2">
            PickleFlow
          </h1>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {screen === "setup" && (
        <SessionSetup
          onStart={() => setScreen("dashboard")}
          onShowHistory={() => setShowHistory(true)}
        />
      )}
      {screen === "dashboard" && <MainDashboard />}
      {showHistory && <SessionHistory onClose={() => setShowHistory(false)} />}
    </div>
  );
}