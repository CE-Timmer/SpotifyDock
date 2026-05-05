import { parseLyricSegments } from "../services/lyricsParser";
import type { LyricLine as LyricLineType, LyricSegment } from "../types/lyrics";
import { Fragment, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface LyricLineProps {
  line: LyricLineType;
  active?: boolean;
  progressMs?: number;
}

export function LyricLine({ line, active = false, progressMs = 0 }: LyricLineProps) {
  const segments = parseLyricSegments(line.text);
  const parenFromSegments = segments
    .filter((segment) => segment.type === "paren")
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const side = line.side ?? "center";
  const progressSec = progressMs / 1000;
  const hasTimedWords = active && Array.isArray(line.words) && line.words.length > 0;
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
  const parenFromWords = Array.isArray(line.words)
    ? line.words
        .map((w) => String(w?.text ?? ""))
        .join("")
        .match(/\([^)]*\)/g)
        ?.join(" ")
        .replace(/\s+/g, " ")
        .trim() ?? ""
    : "";
  const parenSubline = (parenFromSegments || parenFromWords).trim();
  const secondarySubline = String(line.secondaryText ?? "").replace(/\s+/g, " ").trim();
  const rawSmallSubline = secondarySubline || parenSubline;
  const smallSubline = rawSmallSubline
    ? rawSmallSubline.startsWith("(") && rawSmallSubline.endsWith(")")
      ? rawSmallSubline
      : `(${rawSmallSubline})`
    : "";

  const renderTimedLikeMain = (
    sourceWords: Array<{ text: string; startTime: number; endTime?: number }>,
    progressSecValue: number,
    keyPrefix: string,
    scaleGlow = 0.78
  ) => {
    let localParenDepth = 0;
    return sourceWords.map((word, index) => {
      const start = Number(word.startTime);
      const end = typeof word.endTime === "number" ? Number(word.endTime) : start + 0.24;
      const duration = Math.max(0.08, end - start);
      const preroll = Math.min(0.12, duration * 0.42);
      const postroll = Math.min(0.1, duration * 0.38);
      const rawProgress = (progressSecValue - (start - preroll)) / (duration + preroll + postroll);
      const wordProgress = easeOutCubic(rawProgress);
      const rawText = word.text ?? "";
      const startsParen = rawText.includes("(");
      const endsParen = rawText.includes(")");
      const inParen = localParenDepth > 0 || startsParen;
      if (startsParen) localParenDepth += (rawText.match(/\(/g) ?? []).length;
      if (endsParen) localParenDepth = Math.max(0, localParenDepth - (rawText.match(/\)/g) ?? []).length);
      return (
        <Fragment key={`${keyPrefix}-word-${index}`}>
          <span
            className={`lyric-word timed ${inParen ? "paren" : ""}`}
            style={
              {
                "--word-progress": String(wordProgress),
                "--word-glow": String(clamp01(wordProgress * scaleGlow))
              } as CSSProperties
            }
          >
            {rawText}
          </span>
        </Fragment>
      );
    });
  };

  const renderSegmentLikeMain = (segmentsToRender: LyricSegment[], keyPrefix: string) =>
    segmentsToRender.map((segment, index) => (
      <span key={`${keyPrefix}-${index}`} className={segment.type === "paren" ? "lyric-segment-paren" : "lyric-segment-normal"}>
        {segment.text}
      </span>
    ));

  const sublineSegments = smallSubline ? parseLyricSegments(smallSubline) : [];

  return (
    <motion.div
      layout
      className={`lyric-line ${side} ${active ? "active" : "inactive"}`}
      animate={{ opacity: active ? 1 : 0.84, x: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 38, mass: 0.72 }}
    >
      {line.singer ? <span className="lyric-singer">{line.singer}</span> : null}
      <span className="lyric-main">
        <span className="lyric-text lyric-text-main">
          {hasTimedWords
            ? renderTimedLikeMain(line.words!, progressSec, line.id, 0.78)
            : renderSegmentLikeMain(segments, line.id)}
        </span>
        <AnimatePresence mode="wait">
          {active && smallSubline ? (
            <motion.span
              key={`${line.id}-subline-${smallSubline}`}
              className="lyric-paren-subline"
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 0.52, y: 0 }}
              exit={{ opacity: 0, y: -1 }}
              transition={{
                opacity: { duration: 0.28, ease: "easeOut" },
                y: { duration: 0.24, ease: "easeOut" }
              }}
            >
              <span className="lyric-text lyric-text-small">
                {renderSegmentLikeMain(sublineSegments, `${line.id}-sub`)}
              </span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </motion.div>
  );
}
