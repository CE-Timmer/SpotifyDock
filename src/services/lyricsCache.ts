import { invoke } from "@tauri-apps/api/core";
import type { LyricsFile } from "../types/lyrics";

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function fileNameFor(title: string, artists: string[]): string {
  return `${safeSlug(artists.join(", "))} - ${safeSlug(title)}.json`;
}

export async function loadLyricsForTrack(trackId: string, title: string, artists: string[]): Promise<LyricsFile | null> {
  try {
    const payload = await invoke<string | null>("load_lyrics_for_track", {
      trackId,
      fallbackFileName: fileNameFor(title, artists)
    });
    if (!payload) return null;
    return JSON.parse(payload) as LyricsFile;
  } catch {
    return null;
  }
}

export async function saveLyricsFile(data: LyricsFile): Promise<void> {
  const fileName = fileNameFor(data.title, data.artists);
  await invoke("save_lyrics_file", {
    fileName,
    jsonPayload: JSON.stringify(data, null, 2)
  });
}

export async function getLyricsCacheDir(): Promise<string> {
  return invoke<string>("lyrics_cache_dir");
}
