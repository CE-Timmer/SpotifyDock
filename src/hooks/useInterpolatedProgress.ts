import { useEffect, useState } from "react";
import type { PlaybackSnapshot } from "../types/spotify";

export function useInterpolatedProgress(playback: PlaybackSnapshot | null): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playback) {
      setProgress(0);
      return;
    }

    setProgress(playback.progressMs);

    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (!playback.isPlaying) return playback.progressMs;
        const next = current + 100;
        return Math.min(next, playback.durationMs);
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [playback]);

  return progress;
}
