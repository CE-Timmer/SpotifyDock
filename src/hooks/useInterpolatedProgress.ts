import { useEffect, useRef, useState } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import {
  getLowLatencyModeEnabled,
  getPlaybackSmoothness,
  onLowLatencyModeChange,
  onPlaybackSmoothnessChange
} from "../services/settings";

const TICK_MS = 50;
const STREAM_EXTRAPOLATE_MS = 30000;
const WINDOWS_EXTRAPOLATE_MS = 12000;
const HARD_SNAP_MS = 9000;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getTargetProgress(playback: PlaybackSnapshot): number {
  if (!playback.isPlaying) return clamp(playback.progressMs, 0, playback.durationMs);
  const elapsed = Date.now() - playback.fetchedAt;
  const cap = playback.timingSource === "windows" ? WINDOWS_EXTRAPOLATE_MS : STREAM_EXTRAPOLATE_MS;
  return clamp(playback.progressMs + clamp(elapsed, 0, cap), 0, playback.durationMs);
}

export function useInterpolatedProgress(playback: PlaybackSnapshot | null): number {
  const [progress, setProgress] = useState(0);
  const [smoothness, setSmoothness] = useState(getPlaybackSmoothness());
  const [lowLatency, setLowLatency] = useState(getLowLatencyModeEnabled());
  const lastTrackRef = useRef<string | null>(null);
  const lastTitleRef = useRef<string | null>(null);
  const lastPayloadRef = useRef<{ progressMs: number; fetchedAt: number } | null>(null);

  useEffect(() => onPlaybackSmoothnessChange(setSmoothness), []);
  useEffect(() => onLowLatencyModeChange(setLowLatency), []);

  useEffect(() => {
    if (!playback) {
      setProgress(0);
      lastTrackRef.current = null;
      lastTitleRef.current = null;
      lastPayloadRef.current = null;
      return;
    }

    const trackChanged = lastTrackRef.current !== playback.trackId || lastTitleRef.current !== playback.title;
    lastTrackRef.current = playback.trackId;
    lastTitleRef.current = playback.title;

    if (trackChanged) {
      setProgress(clamp(playback.progressMs, 0, playback.durationMs));
      lastPayloadRef.current = { progressMs: playback.progressMs, fetchedAt: playback.fetchedAt };
      return;
    }

    const prevPayload = lastPayloadRef.current;
    lastPayloadRef.current = { progressMs: playback.progressMs, fetchedAt: playback.fetchedAt };
    if (!prevPayload) return;

    const incomingNow = getTargetProgress(playback);
    const elapsedPayload = Math.max(0, playback.fetchedAt - prevPayload.fetchedAt);
    const expected = prevPayload.progressMs + elapsedPayload;
    const payloadError = Math.abs(playback.progressMs - expected);
    const payloadJump = Math.abs(playback.progressMs - prevPayload.progressMs);

    setProgress((current) => {
      // Explicit seek / big jump: hard re-anchor to source time.
      if (payloadError > 1500 || payloadJump > 2600) return incomingNow;
      const drift = incomingNow - current;
      if (Math.abs(drift) >= HARD_SNAP_MS) return incomingNow;
      if (!playback.isPlaying) return current + drift * 0.45;

      // Only correct when new packet arrives; keep it smooth and bounded.
      const smoothFactor = clamp(1 - smoothness, 0, 1);
      const gainBase = lowLatency ? 0.2 : 0.14;
      const gain = gainBase + smoothFactor * 0.08;
      const maxCorrection = lowLatency ? 90 : 65;
      const correction = clamp(drift * gain, -maxCorrection, maxCorrection);
      return clamp(current + correction, 0, playback.durationMs);
    });
  }, [playback?.trackId, playback?.title, playback?.progressMs, playback?.fetchedAt, playback?.durationMs, playback?.isPlaying, smoothness, lowLatency]);

  useEffect(() => {
    if (!playback) return;

    let lastNow = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, now - lastNow);
      lastNow = now;

      setProgress((prev) => {
        if (!playback.isPlaying) return prev;
        return clamp(prev + dt, 0, playback.durationMs);
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [
    playback?.trackId,
    playback?.title,
    playback?.progressMs,
    playback?.fetchedAt,
    playback?.durationMs,
    playback?.isPlaying,
    playback?.timingSource
  ]);

  return progress;
}
