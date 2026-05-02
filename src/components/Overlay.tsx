import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSpotifyPlayback } from "../hooks/useSpotifyPlayback";
import { useActiveLyrics } from "../hooks/useActiveLyrics";
import { TrackInfo } from "./TrackInfo";
import { LyricRenderer } from "./LyricRenderer";

const CLICK_THROUGH_DELAY = 150;

export function Overlay() {
  const { playback, loading } = useSpotifyPlayback();
  const { current, previous, next, sourceLabel } = useActiveLyrics(playback);
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const overlay = getCurrentWindow();

    (async () => {
      await overlay.setAlwaysOnTop(true);
      await overlay.setPosition(new PhysicalPosition(Math.round((1920 - 800) / 2), 16));
      await overlay.setSize(new PhysicalSize(800, 120));
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen("overlay-reactivate", () => {
      setClickThrough(false).catch(() => undefined);
      setHidden(false);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const setClickThrough = async (enabled: boolean) => {
    const overlay = getCurrentWindow() as unknown as { setIgnoreCursorEvents?: (ignore: boolean) => Promise<void> };
    if (!overlay.setIgnoreCursorEvents) return;
    await overlay.setIgnoreCursorEvents(enabled);
  };

  const onMouseEnter = () => {
    setHidden(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setClickThrough(true).catch(() => undefined);
    }, CLICK_THROUGH_DELAY);
  };

  const onMouseLeave = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setClickThrough(false).catch(() => undefined);
    setHidden(false);
  };

  const disconnected = !loading && !playback;

  useEffect(() => {
    invoke("set_auth_popup_visible", { visible: disconnected }).catch(() => undefined);
  }, [disconnected]);

  return (
    <div className="overlay-root" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className={`overlay-shell${hidden ? " hidden" : ""}`}>
        {playback ? (
          <>
            <TrackInfo playback={playback} />
            <LyricRenderer previous={previous} current={current} next={next} compact />
            <div className="source-label">{sourceLabel}</div>
          </>
        ) : (
          <div className="idle-state">Waiting for playback...</div>
        )}
      </div>
    </div>
  );
}
