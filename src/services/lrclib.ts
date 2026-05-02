import { parseSyncedLrc, parseUnsyncedLyrics } from "./lyricsParser";
import type { LyricsFile } from "../types/lyrics";

const LRCLIB_BASE = "https://lrclib.net/api/get";

interface LrclibResponse {
  syncedLyrics?: string;
  plainLyrics?: string;
  duration?: number;
}

export async function fetchLyricsFromLrclib(params: {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  trackId: string;
  artists: string[];
}): Promise<LyricsFile | null> {
  const search = new URLSearchParams({
    track_name: params.title,
    artist_name: params.artist,
    album_name: params.album ?? "",
    duration: params.durationSec ? String(Math.round(params.durationSec)) : ""
  });

  const response = await fetch(`${LRCLIB_BASE}?${search.toString()}`);
  if (!response.ok) return null;

  const data = (await response.json()) as LrclibResponse;
  const synced = data.syncedLyrics?.trim();
  const plain = data.plainLyrics?.trim();

  if (!synced && !plain) return null;

  const parsed = synced ? parseSyncedLrc(synced) : parseUnsyncedLyrics(plain ?? "");
  if (parsed.length === 0) return null;

  return {
    trackId: params.trackId,
    title: params.title,
    artists: params.artists,
    album: params.album,
    durationMs: Math.round((data.duration ?? params.durationSec ?? 0) * 1000),
    source: "lrclib",
    lyrics: parsed.map((line) => ({ ...line, side: line.side ?? "center" }))
  };
}
