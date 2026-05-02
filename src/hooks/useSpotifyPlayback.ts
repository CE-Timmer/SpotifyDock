import { useEffect, useState } from "react";
import type { PlaybackSnapshot } from "../types/spotify";
import { getCurrentPlayback, handleSpotifyCallbackIfNeeded } from "../services/spotify";

export function useSpotifyPlayback() {
  const [playback, setPlayback] = useState<PlaybackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        await handleSpotifyCallbackIfNeeded();
        const result = await getCurrentPlayback();
        if (alive) {
          setPlayback(result);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Playback error");
      } finally {
        if (alive) setLoading(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, 900);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  return { playback, loading, error };
}
