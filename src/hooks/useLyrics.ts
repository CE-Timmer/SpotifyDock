import { useEffect, useMemo, useState } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import type { LyricsFile } from "../types/lyrics";
import { loadLyricsForTrack, saveLyricsFile } from "../services/lyricsCache";
import { fetchLyricsFromLrclib } from "../services/lrclib";
import {
  fetchLyricsFromSpicyBridge,
  getSpicyBridgeStatus,
  subscribeToSpicyBridgeUpdates,
  toLyricsFileFromPayload,
  type SpicyBridgeStatus
} from "../services/spicetifyBridge";
import { getLyricsSourceMode, onLyricsSourceModeChange, type LyricsSourceMode } from "../services/settings";

export function useLyrics(playback: PlaybackSnapshot | null) {
  const [lyricsFile, setLyricsFile] = useState<LyricsFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string>("none");
  const [sourceMode, setSourceMode] = useState<LyricsSourceMode>(getLyricsSourceMode());
  const [bridgeStatus, setBridgeStatus] = useState<SpicyBridgeStatus | null>(null);

  useEffect(() => onLyricsSourceModeChange(setSourceMode), []);

  useEffect(() => {
    if (!playback && sourceMode !== "spicy") {
      setLyricsFile(null);
      setSourceLabel("none");
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    // For backup mode we clear immediately on track switch.
    // For spicy mode we keep listening/streaming continuously to avoid transition gaps.
    if (sourceMode !== "spicy") {
      setLyricsFile(null);
      setSourceLabel("none");
    }

    if (sourceMode === "spicy") {
      let streamUnlisten: (() => void) | null = null;
      let retryTimer: number | null = null;
      const FAST_RETRY_MS = 500;
      const SLOW_RETRY_MS = 1200;

      const scheduleSync = (delayMs: number) => {
        if (!alive) return;
        if (retryTimer) window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          void syncFromBridge().then((hasLyrics) => {
            scheduleSync(hasLyrics ? SLOW_RETRY_MS : FAST_RETRY_MS);
          });
        }, delayMs);
      };

      const syncFromBridge = async (): Promise<boolean> => {
        const status = await getSpicyBridgeStatus(playback ?? null);
        if (!alive) return false;
        setBridgeStatus(status);

        const spicyBridge = await fetchLyricsFromSpicyBridge(playback ?? null);
        if (!alive) return false;

        if (spicyBridge) {
          setLyricsFile(spicyBridge);
          setSourceLabel("spicy-bridge");
          setLoading(false);
          return true;
        } else {
          // Explicitly clear lyrics when current track has no lyrics / bridge has none.
          setLyricsFile(null);
          setSourceLabel(status.connected ? "spicy-waiting" : "spicy-disconnected");
          setLoading(false);
          return false;
        }
      };

      void syncFromBridge().then((hasLyrics) => {
        scheduleSync(hasLyrics ? SLOW_RETRY_MS : FAST_RETRY_MS);
      });
      subscribeToSpicyBridgeUpdates((payload) => {
        if (!alive) return;

        setBridgeStatus((prev) =>
          prev
            ? { ...prev, connected: true, hasPayload: true, lastUpdateMs: Date.now() }
            : {
                connected: true,
                hasPayload: true,
                hasTrack: true,
                hasLyrics: Boolean(payload.lyrics?.length),
                noLyricsForCurrentTrack: false,
                lastUpdateMs: Date.now()
              }
        );

        const streamed = toLyricsFileFromPayload(payload, playback);
        if (streamed) {
          // Trust bridge payload immediately during track transitions.
          // Playback state can lag one packet behind, which previously caused
          // lyrics to appear only after pause/resume.
          setLyricsFile(streamed);
          setSourceLabel("spicy-bridge");
          setLoading(false);
          scheduleSync(SLOW_RETRY_MS);
        } else {
          setLyricsFile(null);
          scheduleSync(FAST_RETRY_MS);
        }
      })
        .then((unlisten) => {
          streamUnlisten = unlisten;
        })
        .catch(() => undefined);

      return () => {
        alive = false;
        if (retryTimer) window.clearTimeout(retryTimer);
        if (streamUnlisten) streamUnlisten();
      };
    }

    if (!playback) {
      setLyricsFile(null);
      setSourceLabel("none");
      setLoading(false);
      return;
    }

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
  }, [playback?.trackId, playback?.title, playback?.durationMs, sourceMode]);

  const hasSynced = useMemo(() => {
    if (!lyricsFile) return false;
    return lyricsFile.lyrics.some((line, index, arr) => index > 0 && line.time !== arr[index - 1].time);
  }, [lyricsFile]);

  return { lyricsFile, loading, sourceLabel, hasSynced, bridgeStatus };
}
