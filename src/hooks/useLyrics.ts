import { useEffect, useMemo, useState } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import type { LyricsFile } from "../types/lyrics";
import { loadLyricsForTrack, saveLyricsFile } from "../services/lyricsCache";
import { fetchLyricsFromLrclib } from "../services/lrclib";
import { fetchLyricsFromSpicyBridge } from "../services/spicetifyBridge";
import { getLyricsSourceMode, onLyricsSourceModeChange, type LyricsSourceMode } from "../services/settings";

export function useLyrics(playback: PlaybackSnapshot | null) {
  const [lyricsFile, setLyricsFile] = useState<LyricsFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string>("none");
  const [sourceMode, setSourceMode] = useState<LyricsSourceMode>(getLyricsSourceMode());

  useEffect(() => onLyricsSourceModeChange(setSourceMode), []);

  useEffect(() => {
    if (!playback) {
      setLyricsFile(null);
      setSourceLabel("none");
      return;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      const cached = await loadLyricsForTrack(playback.trackId, playback.title, playback.artists);
      if (cached && alive) {
        if (cached.source === "override") {
          setLyricsFile(cached);
          setSourceLabel("override");
          setLoading(false);
          return;
        }
      }

      if (sourceMode === "spicy") {
        const spicyBridge = await fetchLyricsFromSpicyBridge(playback);
        if (spicyBridge && alive) {
          setLyricsFile(spicyBridge);
          setSourceLabel("spicy-bridge");
          setLoading(false);
          return;
        }
      }

      if (cached && alive) {
        setLyricsFile(cached);
        setSourceLabel("cache");
        setLoading(false);
        return;
      }

      const fetched = await fetchLyricsFromLrclib({
        trackId: playback.trackId,
        title: playback.title,
        artist: playback.artists[0] ?? "",
        artists: playback.artists,
        album: playback.album,
        durationSec: playback.durationMs / 1000
      });

      if (!alive) return;

      if (fetched) {
        await saveLyricsFile(fetched);
        setLyricsFile(fetched);
        setSourceLabel("lrclib");
      } else {
        setLyricsFile(null);
        setSourceLabel("none");
      }

      setLoading(false);
    })().catch(() => {
      if (alive) {
        setLyricsFile(null);
        setSourceLabel("none");
        setLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, [playback?.trackId, sourceMode]);

  const hasSynced = useMemo(() => {
    if (!lyricsFile) return false;
    return lyricsFile.lyrics.some((line, index, arr) => index > 0 && line.time !== arr[index - 1].time);
  }, [lyricsFile]);

  return { lyricsFile, loading, sourceLabel, hasSynced };
}
