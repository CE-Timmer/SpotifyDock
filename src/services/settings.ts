export type LyricsSourceMode = "spicy" | "backup";

const LYRICS_SOURCE_KEY = "spotifydock_lyrics_source_mode";
const LYRICS_SOURCE_EVENT = "spotifydock:lyrics-source-mode";

export function getLyricsSourceMode(): LyricsSourceMode {
  const value = localStorage.getItem(LYRICS_SOURCE_KEY);
  return value === "backup" ? "backup" : "spicy";
}

export function setLyricsSourceMode(mode: LyricsSourceMode): void {
  localStorage.setItem(LYRICS_SOURCE_KEY, mode);
  window.dispatchEvent(new CustomEvent(LYRICS_SOURCE_EVENT, { detail: mode }));
}

export function onLyricsSourceModeChange(callback: (mode: LyricsSourceMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<LyricsSourceMode>;
    callback(custom.detail);
  };

  window.addEventListener(LYRICS_SOURCE_EVENT, handler as EventListener);
  return () => window.removeEventListener(LYRICS_SOURCE_EVENT, handler as EventListener);
}
