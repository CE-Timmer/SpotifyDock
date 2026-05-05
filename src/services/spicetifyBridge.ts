import type { LyricLine, LyricsFile } from "../types/lyrics";
import type { PlaybackSnapshot } from "../types/spotify";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SpicyBridgeLine {
  time: number;
  duration?: number;
  text: string;
  secondaryText?: string;
  side?: "left" | "right" | "center";
  singer?: string;
  words?: Array<{
    text: string;
    startTime: number;
    endTime?: number;
  }>;
}

export interface SpicyBridgePayload {
  seq?: number;
  trackId?: string;
  title?: string;
  artists?: string[];
  album?: string;
  albumCoverUrl?: string;
  coverPrimary?: string;
  coverSecondary?: string;
  themePrimary?: string;
  themeSecondary?: string;
  durationMs?: number;
  progressMs?: number;
  sentAtMs?: number;
  isPlaying?: boolean;
  noLyrics?: boolean;
  lyrics?: SpicyBridgeLine[];
}

type BridgeListener = (payload: SpicyBridgePayload) => void;

interface SpicyBridgeStatusPayload {
  hasPayload: boolean;
  lastUpdateMs: number;
}

export interface SpicyBridgeStatus {
  connected: boolean;
  hasPayload: boolean;
  hasTrack: boolean;
  hasLyrics: boolean;
  noLyricsForCurrentTrack: boolean;
  lastUpdateMs: number;
}

async function readBridgePayload(): Promise<SpicyBridgePayload | null> {
  const rawPayload = await invoke<string | null>("get_spicy_bridge_payload");
  if (!rawPayload) return null;
  return JSON.parse(rawPayload) as SpicyBridgePayload;
}

export async function subscribeToSpicyBridgeUpdates(
  onPayload: BridgeListener
): Promise<() => void> {
  const unlisten = await listen<string>("spicy-bridge-update", (event) => {
    try {
      const payload = JSON.parse(event.payload) as SpicyBridgePayload;
      onPayload(payload);
    } catch {
      // ignore malformed payload
    }
  });
  return unlisten;
}

async function readBridgeStatus(): Promise<SpicyBridgeStatusPayload | null> {
  try {
    const raw = await invoke<string>("get_spicy_bridge_status");
    return JSON.parse(raw) as SpicyBridgeStatusPayload;
  } catch {
    return null;
  }
}

export async function getPlaybackFromSpicyBridge(): Promise<PlaybackSnapshot | null> {
  try {
    const payload = await readBridgePayload();
    return payload ? toPlaybackSnapshotFromPayload(payload) : null;
  } catch {
    return null;
  }
}

function normalizeLines(lines: SpicyBridgeLine[]): LyricLine[] {
  return lines
    .filter((line) => typeof line.text === "string" && line.text.trim().length > 0 && Number.isFinite(line.time))
    .map((line, index) => ({
      id: `spicy-${line.time}-${index}`,
      time: line.time,
      duration: line.duration,
      text: line.text,
      secondaryText: typeof line.secondaryText === "string" ? line.secondaryText : undefined,
      side: line.side ?? "center",
      singer: line.singer,
      words: Array.isArray(line.words)
        ? line.words
            .filter((w) => typeof w.text === "string" && Number.isFinite(w.startTime))
            .map((w) => ({
              text: w.text,
              startTime: Number(w.startTime),
              endTime: Number.isFinite(w.endTime) ? Number(w.endTime) : undefined
            }))
        : undefined
    }))
    .sort((a, b) => a.time - b.time);
}

export function toPlaybackSnapshotFromPayload(payload: SpicyBridgePayload): PlaybackSnapshot | null {
  if (!payload?.trackId) return null;
  const anchorMs = Number(payload.sentAtMs);
  const coverUrl = sanitizeCoverUrl(payload.albumCoverUrl);
  return {
    trackId: payload.trackId,
    title: payload.title ?? "",
    artists: payload.artists ?? [],
    album: payload.album ?? "",
    albumCoverUrl: coverUrl,
    durationMs: payload.durationMs ?? 0,
    progressMs: payload.progressMs ?? 0,
    isPlaying: payload.isPlaying ?? true,
    fetchedAt: Number.isFinite(anchorMs) && anchorMs > 0 ? anchorMs : Date.now(),
    seq: Number.isFinite(payload.seq) ? Number(payload.seq) : undefined,
    timingSource: "spicy"
  };
}

function sanitizeCoverUrl(url?: string): string | undefined {
  const raw = String(url ?? "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("spotify:image:")) {
    const imageId = raw.replace("spotify:image:", "").trim();
    if (!imageId) return undefined;
    return `https://i.scdn.co/image/${imageId}`;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function toLyricsFileFromPayload(
  payload: SpicyBridgePayload,
  playback?: PlaybackSnapshot | null
): LyricsFile | null {
  if (!payload?.lyrics || payload.lyrics.length === 0) return null;
  const lyrics = normalizeLines(payload.lyrics);
  if (lyrics.length === 0) return null;
  return {
    trackId: payload.trackId ?? playback?.trackId,
    title: payload.title ?? playback?.title ?? "",
    artists: payload.artists ?? playback?.artists ?? [],
    album: payload.album ?? playback?.album ?? "",
    durationMs: payload.durationMs ?? playback?.durationMs ?? 0,
    source: "spicy-bridge",
    lyrics
  };
}

export async function fetchLyricsFromSpicyBridge(playback?: PlaybackSnapshot | null): Promise<LyricsFile | null> {
  try {
    const payload = await readBridgePayload();
    if (!payload) return null;
    return toLyricsFileFromPayload(payload, playback);
  } catch {
    return null;
  }
}

export async function getSpicyBridgeStatus(playback: PlaybackSnapshot | null): Promise<SpicyBridgeStatus> {
  const [status, payload] = await Promise.all([readBridgeStatus(), readBridgePayload()]);
  const now = Date.now();
  const lastUpdateMs = status?.lastUpdateMs ?? 0;
  const connected = lastUpdateMs > 0 && now - lastUpdateMs < 12_000;
  const hasPayload = Boolean(status?.hasPayload || payload);
  const hasTrack = Boolean(payload?.trackId && payload?.title);
  const hasLyrics = Boolean(payload?.lyrics && payload.lyrics.length > 0);
  const noLyricsForCurrentTrack = Boolean(
    playback &&
      payload?.trackId &&
      payload.trackId === playback.trackId &&
      payload.noLyrics === true
  );

  return {
    connected,
    hasPayload,
    hasTrack,
    hasLyrics,
    noLyricsForCurrentTrack,
    lastUpdateMs
  };
}
