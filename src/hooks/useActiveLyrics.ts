import { useMemo } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import { useInterpolatedProgress } from "./useInterpolatedProgress";
import { useLyrics } from "./useLyrics";

export function useActiveLyrics(playback: PlaybackSnapshot | null) {
  const progressMs = useInterpolatedProgress(playback);
  const { lyricsFile, loading, sourceLabel } = useLyrics(playback);

  const activeIndex = useMemo(() => {
    if (!lyricsFile) return -1;
    const seconds = progressMs / 1000;
    for (let i = lyricsFile.lyrics.length - 1; i >= 0; i -= 1) {
      if (seconds >= lyricsFile.lyrics[i].time) return i;
    }
    return -1;
  }, [lyricsFile, progressMs]);

  return {
    progressMs,
    lyricsFile,
    loading,
    sourceLabel,
    activeIndex,
    current: activeIndex >= 0 ? lyricsFile?.lyrics[activeIndex] ?? null : null,
    previous: activeIndex > 0 ? lyricsFile?.lyrics[activeIndex - 1] ?? null : null,
    next: activeIndex >= 0 ? lyricsFile?.lyrics[activeIndex + 1] ?? null : null
  };
}
