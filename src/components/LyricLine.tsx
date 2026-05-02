import { parseLyricSegments } from "../services/lyricsParser";
import type { LyricLine as LyricLineType } from "../types/lyrics";

interface LyricLineProps {
  line: LyricLineType;
  active?: boolean;
}

export function LyricLine({ line, active = false }: LyricLineProps) {
  const segments = parseLyricSegments(line.text);
  const side = line.side ?? "center";

  return (
    <div className={`lyric-line ${side} ${active ? "active" : "inactive"}`}>
      {line.singer ? <span className="lyric-singer">{line.singer}</span> : null}
      <span className="lyric-text">
        {segments.map((segment, index) => (
          <span key={`${line.id}-${index}`} className={segment.type === "paren" ? "lyric-segment-paren" : "lyric-segment-normal"}>
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  );
}
