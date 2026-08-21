"use client";

import { useEffect, useState } from "react";

function getRemaining(targetMs: number) {
  const diff = Math.max(0, targetMs - Date.now());
  return {
    diff,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

export default function Countdown({
  target,
  labels,
}: {
  target: string;
  labels: { days: string; hours: string; minutes: string; seconds: string; live: string };
}) {
  const targetMs = new Date(target).getTime();
  const [remaining, setRemaining] = useState(() => getRemaining(targetMs));

  useEffect(() => {
    const interval = setInterval(() => setRemaining(getRemaining(targetMs)), 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  if (remaining.diff <= 0) {
    return (
      <div className="mt-3 text-sm font-medium text-accent" suppressHydrationWarning>
        {labels.live}
      </div>
    );
  }

  const units: [number, string][] = [
    [remaining.days, labels.days],
    [remaining.hours, labels.hours],
    [remaining.minutes, labels.minutes],
    [remaining.seconds, labels.seconds],
  ];

  return (
    <div className="mt-3 flex gap-2">
      {units.map(([value, label]) => (
        <div
          key={label}
          className="flex min-w-[52px] flex-col items-center rounded-lg bg-background px-2.5 py-1.5"
        >
          <span className="text-lg font-semibold tabular-nums" suppressHydrationWarning>
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-[10px] uppercase text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
