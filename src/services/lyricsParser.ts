import type { LyricLine, LyricSegment } from "../types/lyrics";

const LRC_RE = /^\s*\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

export function parseSyncedLrc(input: string): LyricLine[] {
  const lines = input.split(/\r?\n/);
  const parsed: LyricLine[] = [];

  for (const raw of lines) {
    const match = raw.match(LRC_RE);
    if (!match) continue;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fractionRaw = match[3] ?? "0";
    const fraction = Number(fractionRaw.padEnd(3, "0").slice(0, 3));
    const text = match[4].trim();
    if (!text) continue;

    const time = minutes * 60 + seconds + fraction / 1000;
    parsed.push({
      id: `${time}-${text}`,
      time,
      text,
      side: "center"
    });
  }

  parsed.sort((a, b) => a.time - b.time);
  for (let i = 0; i < parsed.length - 1; i += 1) {
    parsed[i].duration = Math.max(0.1, parsed[i + 1].time - parsed[i].time);
  }

  return parsed;
}

export function parseUnsyncedLyrics(input: string): LyricLine[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `plain-${index}-${text}`,
      time: index,
      text,
      side: "center" as const
    }));
}

export function parseLyricSegments(text: string): LyricSegment[] {
  const segments: LyricSegment[] = [];
  const re = /(\([^)]*\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(re)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), type: "normal" });
    }

    segments.push({ text: token, type: "paren" });
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), type: "normal" });
  }

  return segments.length ? segments : [{ text, type: "normal" }];
}
