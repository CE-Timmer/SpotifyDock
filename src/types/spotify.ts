export interface SpotifyArtist {
  name: string;
}

export interface SpotifyAlbum {
  name: string;
  images: Array<{ url: string; width: number; height: number }>;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
}

export interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
}

export interface PlaybackSnapshot {
  trackId: string;
  title: string;
  artists: string[];
  album: string;
  albumCoverUrl?: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  fetchedAt: number;
  seq?: number;
  timingSource?: "spicy" | "windows" | "web";
}
