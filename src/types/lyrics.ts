export interface LyricLine {
  id: string;
  time: number;
  duration?: number;
  text: string;
  side?: "left" | "right" | "center";
  singer?: string;
}

export interface LyricSegment {
  text: string;
  type: "normal" | "paren";
}

export interface LyricsFile {
  trackId?: string;
  title: string;
  artists: string[];
  durationMs: number;
  source: "lrclib" | "override" | "spicy-bridge";
  album?: string;
  lyrics: LyricLine[];
}
