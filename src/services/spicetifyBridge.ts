import type { LyricLine, LyricsFile } from "../types/lyrics";
import type { PlaybackSnapshot } from "../types/spotify";
import { invoke } from "@tauri-apps/api/core";

interface SpicyBridgeLine {
  time: number;
  duration?: number;
  text: string;
  side?: "left" | "right" | "center";
  singer?: string;
}

interface SpicyBridgePayload {
  trackId?: string;
  title?: string;
  artists?: string[];
  album?: string;
  durationMs?: number;
  lyrics?: SpicyBridgeLine[];
}

function normalizeLines(lines: SpicyBridgeLine[]): LyricLine[] {
  return lines
    .filter((line) => typeof line.text === "string" && line.text.trim().length > 0 && Number.isFinite(line.time))
    .map((line, index) => ({
      id: `spicy-${line.time}-${index}`,
      time: line.time,
      duration: line.duration,
      text: line.text,
      side: line.side ?? "center",
      singer: line.singer
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchLyricsFromSpicyBridge(playback: PlaybackSnapshot): Promise<LyricsFile | null> {
  try {
    const rawPayload = await invoke<string | null>("get_spicy_bridge_payload");
    if (!rawPayload) return null;
    const payload = JSON.parse(rawPayload) as SpicyBridgePayload;
    if (!payload.lyrics || payload.lyrics.length === 0) return null;

    if (payload.trackId && payload.trackId !== playback.trackId) return null;

    const lyrics = normalizeLines(payload.lyrics);
    if (lyrics.length === 0) return null;

    return {
      trackId: payload.trackId ?? playback.trackId,
      title: payload.title ?? playback.title,
      artists: payload.artists ?? playback.artists,
      album: payload.album ?? playback.album,
      durationMs: payload.durationMs ?? playback.durationMs,
      source: "spicy-bridge",
      lyrics
    };
  } catch {
    return null;
  }
}
