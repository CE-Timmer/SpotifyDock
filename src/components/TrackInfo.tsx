import type { PlaybackSnapshot } from "../types/spotify";

interface TrackInfoProps {
  playback: PlaybackSnapshot;
}

export function TrackInfo({ playback }: TrackInfoProps) {
  return (
    <div className="track-info">
      <div className="track-title">{playback.title}</div>
      <div className="track-artist">{playback.artists.join(", ")}</div>
    </div>
  );
}
