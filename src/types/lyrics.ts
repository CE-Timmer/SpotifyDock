export interface LyricWord {
  text: string;
  startTime: number;
  endTime?: number;
}

export interface LyricLine {
  id: string;
  time: number;
  duration?: number;
  text: string;
  secondaryText?: string;
  side?: "left" | "right" | "center";
  singer?: string;
  words?: LyricWord[];
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
