import { useEffect, useState } from "react";
import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PlaybackSnapshot } from "../types/spotify";
import { getCurrentPlayback, handleSpotifyCallbackIfNeeded } from "../services/spotify";
import {
  getPlaybackFromSpicyBridge,
  subscribeToSpicyBridgeUpdates,
  toPlaybackSnapshotFromPayload
} from "../services/spicetifyBridge";
import {
  getLyricsSourceMode,
  getPlaybackHelperMode,
  onPlaybackHelperModeChange,
  onLyricsSourceModeChange,
  type PlaybackHelperMode,
  type LyricsSourceMode
} from "../services/settings";

export function useSpotifyPlayback() {
  const [playback, setPlayback] = useState<PlaybackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<LyricsSourceMode>(getLyricsSourceMode());
  const [playbackHelperMode, setPlaybackHelperMode] = useState<PlaybackHelperMode>(getPlaybackHelperMode());
  const streamTrackRef = useRef<string | null>(null);
  const playbackTrackRef = useRef<string | null>(null);
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => onLyricsSourceModeChange(setSourceMode), []);
  useEffect(() => onPlaybackHelperModeChange(setPlaybackHelperMode), []);

  useEffect(() => {
    let alive = true;

    if (sourceMode === "spicy") {
      let streamUnlisten: (() => void) | null = null;
      let windowsMediaUnlisten: (() => void) | null = null;
      let watchdogTimer: number | null = null;
      let lastStreamAt = 0;
      let staleFallbackInFlight = false;
      let lastBridgePayloadFetchedAt = 0;

      const WATCHDOG_MS = 350;
      const STALE_ENTER_MS = 2800;

      const mergeWindowsMediaTimeline = (raw: string, force = false) => {
        const spicyIsFresh = lastStreamAt > 0 && Date.now() - lastStreamAt <= STALE_ENTER_MS;
        if (!force && spicyIsFresh) return;

        let parsed: {
          track_id?: string;
          title?: string;
          artist?: string;
          duration_ms?: number;
          progress_ms?: number;
          is_playing?: boolean;
          fetched_at?: number;
        } | null = null;

        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        if (!parsed) return;

        const trackId = typeof parsed.track_id === "string" ? parsed.track_id : "";
        const title = typeof parsed.title === "string" ? parsed.title : "";
        const artist = typeof parsed.artist === "string" ? parsed.artist : "";
        const durationMs = Number(parsed.duration_ms ?? 0);
        const progressMs = Number(parsed.progress_ms ?? 0);
        const isPlaying = Boolean(parsed.is_playing);
        const fetchedAt = Number(parsed.fetched_at ?? Date.now());
        if (!trackId && !title) return;
        if (!Number.isFinite(progressMs)) return;

        setPlayback((prev) => {
          if (!prev) {
            return {
              trackId: trackId || `win:${title}:${artist}:${Math.round(durationMs || 0)}`,
              title,
              artists: artist ? [artist] : [],
              album: "",
              durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
              progressMs: Math.max(0, Math.round(progressMs)),
              isPlaying,
              fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
              timingSource: "windows"
            };
          }

          const sameTrack =
            (trackId && trackId === prev.trackId) ||
            (!!title && title === prev.title && artist === (prev.artists[0] ?? ""));
          if (!sameTrack) return prev;

          return {
            ...prev,
            progressMs: Math.max(0, Math.round(progressMs)),
            isPlaying,
            fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
            timingSource: "windows"
          };
        });
      };

      const initial = async () => {
        try {
          const result = await getPlaybackFromSpicyBridge();
          if (!alive) return;
          if (result) {
            setPlayback(result);
            lastStreamAt = Date.now();
            if (Number.isFinite(result.fetchedAt)) {
              lastBridgePayloadFetchedAt = Number(result.fetchedAt);
            }
          } else {
            setPlayback(null);
          }
          setError(null);
        } catch (err) {
          if (alive) setError(err instanceof Error ? err.message : "Playback error");
        } finally {
          if (alive) setLoading(false);
        }
      };

      void initial();

      const mergeSnapshot = (incoming: PlaybackSnapshot): void => {
        streamTrackRef.current = incoming.trackId;
        playbackTrackRef.current = incoming.trackId;
        setPlayback((prev) => {
          if (!prev) return { ...incoming, timingSource: "spicy" };

          const sameTrack = prev.trackId === incoming.trackId && prev.title === incoming.title;
          if (!sameTrack) {
            return {
              ...incoming,
              fetchedAt: Date.now(),
              timingSource: "spicy"
            };
          }

          return {
            ...incoming,
            timingSource: "spicy"
          };
        });
      };

      const mergeAuthoritativeSnapshot = (incoming: PlaybackSnapshot): void => {
        setPlayback((prev) => {
          if (!prev) return { ...incoming, timingSource: "web" };
          const sameTrack = prev.trackId === incoming.trackId;
          if (!sameTrack) return { ...incoming, timingSource: "web" };
          const driftMs = Math.abs((incoming.progressMs ?? 0) - (prev.progressMs ?? 0));
          if (driftMs >= 900 || prev.isPlaying !== incoming.isPlaying) {
            return {
              ...prev,
              progressMs: incoming.progressMs,
              isPlaying: incoming.isPlaying,
              fetchedAt: incoming.fetchedAt,
              timingSource: "web"
            };
          }
          return prev;
        });
      };

      subscribeToSpicyBridgeUpdates((payload) => {
        if (!alive) return;
        const snapshot = toPlaybackSnapshotFromPayload(payload);
        if (!snapshot) return;
        const snapshotFetchedAt = Number.isFinite(snapshot.fetchedAt) ? Number(snapshot.fetchedAt) : 0;
        const payloadSeq = Number.isFinite(snapshot.seq) ? Number(snapshot.seq) : -1;
        const isSeqAdvanced = payloadSeq >= 0 && payloadSeq > lastSeqRef.current;
        const isTrackSwitch =
          (streamTrackRef.current !== null && snapshot.trackId !== streamTrackRef.current) ||
          (playbackTrackRef.current !== null && snapshot.trackId !== playbackTrackRef.current);
        const isFreshPayload = snapshotFetchedAt > lastBridgePayloadFetchedAt || isTrackSwitch || isSeqAdvanced;
        if (!isFreshPayload) return;

        if (snapshotFetchedAt > lastBridgePayloadFetchedAt) {
          lastBridgePayloadFetchedAt = snapshotFetchedAt;
        }
        if (payloadSeq >= 0) lastSeqRef.current = payloadSeq;
        lastStreamAt = Date.now();
        mergeSnapshot(snapshot);
        setError(null);
        setLoading(false);
      })
        .then((unlisten) => {
          streamUnlisten = unlisten;
        })
        .catch(() => undefined);

      if (playbackHelperMode === "windows") {
        void invoke<string | null>("get_windows_media_timeline")
          .then((raw) => {
            if (!alive || !raw) return;
            mergeWindowsMediaTimeline(raw, false);
          })
          .catch(() => undefined);

        listen<string>("windows-media-update", (event) => {
          if (!alive) return;
          mergeWindowsMediaTimeline(event.payload, false);
        })
          .then((unlisten) => {
            windowsMediaUnlisten = unlisten;
          })
          .catch(() => undefined);
      }

      const watchdog = async () => {
        if (!alive) return;
        try {
          const snapshot = await getPlaybackFromSpicyBridge();
          if (!alive) return;
          if (snapshot) {
            const snapshotFetchedAt = Number.isFinite(snapshot.fetchedAt) ? Number(snapshot.fetchedAt) : 0;
            const payloadSeq = Number.isFinite(snapshot.seq) ? Number(snapshot.seq) : -1;
            const isSeqAdvanced = payloadSeq >= 0 && payloadSeq > lastSeqRef.current;
            const isTrackSwitch =
              (streamTrackRef.current !== null && snapshot.trackId !== streamTrackRef.current) ||
              (playbackTrackRef.current !== null && snapshot.trackId !== playbackTrackRef.current);
            const isFreshPayload = snapshotFetchedAt > lastBridgePayloadFetchedAt || isTrackSwitch || isSeqAdvanced;
            if (isFreshPayload) {
              if (snapshotFetchedAt > lastBridgePayloadFetchedAt) {
                lastBridgePayloadFetchedAt = snapshotFetchedAt;
              }
              if (payloadSeq >= 0) lastSeqRef.current = payloadSeq;
              lastStreamAt = Date.now();
              mergeSnapshot(snapshot);
              setError(null);
              setLoading(false);
            }
          }

          const stale = !lastStreamAt || Date.now() - lastStreamAt > STALE_ENTER_MS;
          if (stale && !staleFallbackInFlight) {
            staleFallbackInFlight = true;
            try {
              if (playbackHelperMode === "windows") {
                const raw = await invoke<string | null>("get_windows_media_timeline");
                if (!alive) return;
                if (raw) {
                  mergeWindowsMediaTimeline(raw, true);
                  setError(null);
                  setLoading(false);
                }
              } else {
                const fallback = await getCurrentPlayback();
                if (!alive) return;
                if (fallback) {
                  mergeAuthoritativeSnapshot(fallback);
                  setError(null);
                  setLoading(false);
                }
              }
            } catch {
              // no-op
            } finally {
              staleFallbackInFlight = false;
            }
          }
        } catch {
          // no-op
        }
      };

      watchdogTimer = window.setInterval(() => {
        void watchdog();
      }, WATCHDOG_MS);

      return () => {
        alive = false;
        if (watchdogTimer) window.clearInterval(watchdogTimer);
        if (streamUnlisten) streamUnlisten();
        if (windowsMediaUnlisten) windowsMediaUnlisten();
      };
    }

    const tick = async () => {
      try {
        let result: PlaybackSnapshot | null = null;

        if (sourceMode === "backup") {
          await handleSpotifyCallbackIfNeeded();
          result = await getCurrentPlayback();
        }

        if (alive) {
          setPlayback(result);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Playback error");
      } finally {
        if (alive) setLoading(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, 900);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [sourceMode, playbackHelperMode]);

  return { playback, loading, error };
}
