import { AnimatePresence, motion } from "framer-motion";
import type { LyricLine as LyricLineType } from "../types/lyrics";
import { LyricLine } from "./LyricLine";
import { getLyricsVisualMode, onLyricsVisualModeChange, type LyricsVisualMode } from "../services/settings";
import { useEffect, useState } from "react";

interface LyricRendererProps {
  previous: LyricLineType | null;
  current: LyricLineType | null;
  next: LyricLineType | null;
  progressMs?: number;
  compact?: boolean;
}

export function LyricRenderer({ previous, current, next, progressMs = 0, compact = true }: LyricRendererProps) {
  const [visualMode, setVisualMode] = useState<LyricsVisualMode>(getLyricsVisualMode());
  useEffect(() => onLyricsVisualModeChange(setVisualMode), []);
  const progressSec = progressMs / 1000;

  const currentEnd = (() => {
    if (!current) return 0;
    if (typeof current.duration === "number" && Number.isFinite(current.duration) && current.duration > 0) {
      return current.time + current.duration;
    }
    if (next) return Math.max(current.time + 0.08, next.time - 0.01);
    return current.time + 2.2;
  })();

  const gapToNext = current && next ? next.time - currentEnd : 0;
  const showWaitingDots = Boolean(
    current &&
      next &&
      gapToNext > 1 &&
      progressSec >= currentEnd &&
      progressSec < next.time
  );

  if (!current) {
    return <div className="lyric-empty transparent"> </div>;
  }

  if (compact) {
    const dense = visualMode === "spicy-dense";
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          className={`lyrics-compact ${dense ? "dense" : ""}`}
          initial={{ opacity: 0, y: dense ? 10 : 8, scale: dense ? 0.978 : 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: dense ? -10 : -8, scale: dense ? 0.978 : 0.985 }}
          transition={{ duration: dense ? 0.2 : 0.25, ease: "easeOut" }}
        >
          <div className={`lyrics-compact-stack ${dense ? "dense" : ""}`}>
            {previous ? (
              <motion.div
                key={`prev-${previous.id}`}
                className="lyric-neighbor prev"
                initial={{ opacity: 0, y: -8, filter: "blur(2px)" }}
                animate={{ opacity: 0.78, y: 0, filter: "blur(0.35px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <LyricLine line={previous} />
              </motion.div>
            ) : (
              <div className="lyric-spacer" />
            )}
            <LyricLine line={current} active progressMs={progressMs} />
            <AnimatePresence>
              {showWaitingDots ? (
                <motion.div
                  key={`wait-${current.id}-${next?.id ?? "none"}`}
                  className="lyric-wait-dots"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="lyric-wait-dot"
                      animate={{ opacity: [0.25, 0.95, 0.25], scale: [0.92, 1.06, 0.92] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {next ? (
              <motion.div
                key={`next-${next.id}`}
                className="lyric-neighbor next"
                initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
                animate={{ opacity: 0.78, y: 0, filter: "blur(0.35px)" }}
                exit={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <LyricLine line={next} />
              </motion.div>
            ) : (
              <div className="lyric-spacer" />
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="lyrics-mode">
      {previous ? <LyricLine line={previous} /> : <div className="lyric-spacer" />}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1.02 }}
          exit={{ opacity: 0, y: -8, scale: 0.985 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <LyricLine line={current} active progressMs={progressMs} />
        </motion.div>
      </AnimatePresence>
      {next ? <LyricLine line={next} /> : <div className="lyric-spacer" />}
    </div>
  );
}
