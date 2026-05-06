import { motion } from "framer-motion";
import type { PlaybackSnapshot } from "../types/spotify";
import { TrackInfo } from "./TrackInfo";

interface NoLyricsStateProps {
  playback: PlaybackSnapshot;
  progressMs: number;
  durationMs: number;
}

export function NoLyricsState({ playback, progressMs, durationMs }: NoLyricsStateProps) {
  const ratio = durationMs > 0 ? Math.max(0, Math.min(1, progressMs / durationMs)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <motion.div
      className="no-lyrics-state"
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <TrackInfo playback={playback} variant="no-lyrics" />
      <div className="no-lyrics-center">
        <div className="no-lyrics-progress">
          <svg className="no-lyrics-progress-svg" viewBox="0 0 72 72" aria-hidden="true">
            <circle className="no-lyrics-progress-track" cx="36" cy="36" r={radius} />
            <circle
              className="no-lyrics-progress-ring"
              cx="36"
              cy="36"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: dashOffset
              }}
            />
          </svg>
          <div className="no-lyrics-progress-time">
            <div className="no-lyrics-progress-current">{formatTime(progressMs)}</div>
            <div className="no-lyrics-progress-total">{formatTime(durationMs)}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
