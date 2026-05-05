import { useMemo, useRef } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import { useInterpolatedProgress } from "./useInterpolatedProgress";
import { useLyrics } from "./useLyrics";
import { getLineHysteresisSec, getLyricsTimingOffsetMs, onLineHysteresisSecChange, onLyricsTimingOffsetMsChange } from "../services/settings";
import { useEffect, useState } from "react";

export function useActiveLyrics(playback: PlaybackSnapshot | null) {
  const progressMs = useInterpolatedProgress(playback);
  const { lyricsFile, loading, sourceLabel, bridgeStatus } = useLyrics(playback);
  const lastStableIndexRef = useRef(-1);
  const lastTrackRef = useRef<string | null>(null);
  const lastLyricsTrackRef = useRef<string | null>(null);
  const lastLyricsTitleRef = useRef<string | null>(null);
  const lastSecondsRef = useRef<number | null>(null);
  const lastJumpAtRef = useRef(0);
  const [hysteresisSec, setHysteresisSec] = useState(getLineHysteresisSec());
  const [timingOffsetMs, setTimingOffsetMs] = useState(getLyricsTimingOffsetMs());

  useEffect(() => onLineHysteresisSecChange(setHysteresisSec), []);
  useEffect(() => onLyricsTimingOffsetMsChange(setTimingOffsetMs), []);

  const activeIndex = useMemo(() => {
    if (!lyricsFile) return -1;
    const lyricsTrack = lyricsFile.trackId ?? null;
    const lyricsTitle = lyricsFile.title ?? null;

    if (lastLyricsTrackRef.current !== lyricsTrack || lastLyricsTitleRef.current !== lyricsTitle) {
      lastLyricsTrackRef.current = lyricsTrack;
      lastLyricsTitleRef.current = lyricsTitle;
      lastStableIndexRef.current = -1;
      lastSecondsRef.current = null;
      lastJumpAtRef.current = 0;
    }

    if (lastTrackRef.current !== playback?.trackId) {
      lastTrackRef.current = playback?.trackId ?? null;
      lastStableIndexRef.current = -1;
      lastSecondsRef.current = null;
      lastJumpAtRef.current = 0;
    }

    const seconds = (progressMs + timingOffsetMs) / 1000;
    const prevSeconds = lastSecondsRef.current;
    const jumpedHard = prevSeconds !== null && Math.abs(seconds - prevSeconds) >= 1.25;
    if (jumpedHard) lastJumpAtRef.current = Date.now();
    lastSecondsRef.current = seconds;
    const forceSnapWindow = Date.now() - lastJumpAtRef.current < 650;
    const lines = lyricsFile.lyrics;
    const getLineEnd = (index: number) => {
      const line = lines[index];
      const next = lines[index + 1];
      if (typeof line.duration === "number" && Number.isFinite(line.duration) && line.duration > 0) {
        return line.time + line.duration;
      }
      if (next) return Math.max(line.time + 0.08, next.time - 0.01);
      return line.time + 2.4;
    };

    const prevStable = lastStableIndexRef.current;
    if (!forceSnapWindow && prevStable >= 0 && prevStable < lines.length) {
      const start = lines[prevStable].time;
      const end = getLineEnd(prevStable);
      if (seconds + hysteresisSec >= start && seconds <= end + hysteresisSec) {
        return prevStable;
      }
    }

    // Match Spicy-style active window: line is active while time is in [start, end].
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const start = lines[i].time;
      const end = getLineEnd(i);
      const windowPad = forceSnapWindow ? 0.03 : hysteresisSec;
      if (seconds >= start - windowPad && seconds <= end + windowPad) {
        lastStableIndexRef.current = i;
        return i;
      }
    }

    // Fallback: nearest previously-started line.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (seconds >= lines[i].time) {
        lastStableIndexRef.current = i;
        return i;
      }
    }

    // If we're before the first timestamp, show the first upcoming line instead of blank.
    lastStableIndexRef.current = 0;
    return 0;
  }, [lyricsFile, progressMs, playback?.trackId, hysteresisSec, timingOffsetMs]);

  return {
    progressMs: progressMs + timingOffsetMs,
    lyricsFile,
    loading,
    sourceLabel,
    bridgeStatus,
    activeIndex,
    current: activeIndex >= 0 ? lyricsFile?.lyrics[activeIndex] ?? null : null,
    previous: activeIndex > 0 ? lyricsFile?.lyrics[activeIndex - 1] ?? null : null,
    next: activeIndex >= 0 ? lyricsFile?.lyrics[activeIndex + 1] ?? null : null
  };
}
