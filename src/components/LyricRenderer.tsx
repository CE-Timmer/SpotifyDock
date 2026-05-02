import { AnimatePresence, motion } from "framer-motion";
import type { LyricLine as LyricLineType } from "../types/lyrics";
import { LyricLine } from "./LyricLine";

interface LyricRendererProps {
  previous: LyricLineType | null;
  current: LyricLineType | null;
  next: LyricLineType | null;
  compact?: boolean;
}

export function LyricRenderer({ previous, current, next, compact = true }: LyricRendererProps) {
  if (!current) {
    return <div className="lyric-empty">No synced lyrics found</div>;
  }

  if (compact) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          className="lyrics-compact"
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.985 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <LyricLine line={current} active />
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
          <LyricLine line={current} active />
        </motion.div>
      </AnimatePresence>
      {next ? <LyricLine line={next} /> : <div className="lyric-spacer" />}
    </div>
  );
}
