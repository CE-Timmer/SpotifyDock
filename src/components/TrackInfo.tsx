import type { PlaybackSnapshot } from "../types/spotify";
import { useEffect, useState } from "react";
import { getLeftPanelMode, onLeftPanelModeChange, type LeftPanelMode } from "../services/settings";

interface TrackInfoProps {
  playback: PlaybackSnapshot;
}

export function TrackInfo({ playback }: TrackInfoProps) {
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>(getLeftPanelMode());
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => onLeftPanelModeChange(setLeftPanelMode), []);
  useEffect(() => {
    setCoverFailed(false);
  }, [playback.trackId, playback.albumCoverUrl]);

  const coverUrl = normalizeCoverUrl(playback.albumCoverUrl);
  const showCover = Boolean(coverUrl) && !coverFailed;

  return (
    <div className={`track-info ${leftPanelMode === "cover-only" ? "cover-only" : ""}`}>
      <div className="track-cover-wrap">
        {showCover ? (
          <img
            className="track-cover"
            src={coverUrl}
            alt=""
            onError={() => setCoverFailed(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="track-cover placeholder" />
        )}
      </div>
      {leftPanelMode === "cover-meta" ? (
        <div className="track-meta">
          <div className="track-title">{playback.title}</div>
          <div className="track-artist">{playback.artists.join(", ")}</div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeCoverUrl(url?: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("spotify:image:")) {
    const imageId = raw.replace("spotify:image:", "").trim();
    return imageId ? `https://i.scdn.co/image/${imageId}` : "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}
