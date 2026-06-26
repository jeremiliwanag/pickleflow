import { useState, useEffect } from "react";

interface CourtTimerProps {
  startTime: number;
  limitMinutes: number;
}

export default function CourtTimer({ startTime, limitMinutes }: CourtTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = now - startTime;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const limitMs = limitMinutes * 60 * 1000;
  const pct = Math.min(elapsedMs / limitMs, 1);

  const isOver = elapsedMs > limitMs;
  const isWarning = pct >= 0.8;

  const color = isOver
    ? "text-red-600"
    : isWarning
    ? "text-orange-500"
    : "text-emerald-600";

  const barColor = isOver
    ? "bg-red-500"
    : isWarning
    ? "bg-orange-400"
    : "bg-emerald-500";

  const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
          {isOver ? "Over Time" : "Time"}
        </span>
        <span className={`text-sm font-black tabular-nums ${color} ${isOver ? "animate-pulse" : ""}`}>
          {isOver && "+"}{label}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
