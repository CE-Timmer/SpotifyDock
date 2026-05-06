import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence } from "framer-motion";
import { cursorPosition, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSpotifyPlayback } from "../hooks/useSpotifyPlayback";
import { useActiveLyrics } from "../hooks/useActiveLyrics";
import {
  getLyricsSourceMode,
  onLyricsSourceModeChange,
  type LyricsSourceMode,
  getPillStyleMode,
  onPillStyleModeChange,
  type PillStyleMode,
  getPillShade,
  onPillShadeChange
  ,
  getAlignmentDebugEnabled,
  onAlignmentDebugEnabledChange
} from "../services/settings";
import { TrackInfo } from "./TrackInfo";
import { LyricRenderer } from "./LyricRenderer";
import { NoLyricsState } from "./NoLyricsState";
import { extractAlbumColors } from "../services/colorExtractor";
import { subscribeToSpicyBridgeUpdates } from "../services/spicetifyBridge";

const CLICK_THROUGH_DELAY = 120;
const REAPPEAR_DELAY = 140;
const TOGGLE_COOLDOWN_MS = 220;
const STOP_HIDE_DELAY_MS = 1000;
const HIDDEN_CHECK_INTERVAL_MS = 420;
const HIDDEN_CHECK_SLOW_MS = 1300;
const LOOP_LAG_MS = 260;
const HOVER_MARGIN_PX = 8;
const PLAYBACK_MISSING_GRACE_MS = 8000;
const OUTSIDE_CONFIRM_TICKS = 2;

export function Overlay() {
  const { playback, loading } = useSpotifyPlayback();
  const { current, previous, next, progressMs, bridgeStatus } = useActiveLyrics(playback);
  const [hidden, setHidden] = useState(false);
  const [sourceMode, setSourceMode] = useState<LyricsSourceMode>(getLyricsSourceMode());
  const [pillStyleMode, setPillStyleMode] = useState<PillStyleMode>(getPillStyleMode());
  const [pillShade, setPillShade] = useState<number>(getPillShade());
  const [coverPrimary, setCoverPrimary] = useState("88,110,148");
  const [coverSecondary, setCoverSecondary] = useState("76,124,108");
  const [alignmentDebugEnabled, setAlignmentDebugEnabled] = useState<boolean>(getAlignmentDebugEnabled());
  const [hideForStoppedPlayback, setHideForStoppedPlayback] = useState(false);
  const [displayProgressMs, setDisplayProgressMs] = useState(0);
  const [hideForMissingPlayback, setHideForMissingPlayback] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const playbackStopTimerRef = useRef<number | null>(null);
  const playbackMissingTimerRef = useRef<number | null>(null);
  const hiddenCheckTimerRef = useRef<number | null>(null);
  const hideEngagedRef = useRef(false);
  const clickThroughEnabledRef = useRef(false);
  const lastToggleAtRef = useRef(0);
  const outsideTickCountRef = useRef(0);
  const coverCacheRef = useRef<Map<string, { primary: string; secondary: string }>>(new Map());
  const lastTitleRef = useRef<string | null>(null);
  const lastTrackRef = useRef<string | null>(null);
  const lastSeqRef = useRef<number | null>(null);
  const autoHiddenByPlaybackRef = useRef(false);

  useEffect(() => onLyricsSourceModeChange(setSourceMode), []);
  useEffect(() => onPillStyleModeChange(setPillStyleMode), []);
  useEffect(() => onPillShadeChange(setPillShade), []);
  useEffect(() => onAlignmentDebugEnabledChange(setAlignmentDebugEnabled), []);

  useEffect(() => {
    const overlay = getCurrentWindow();

    (async () => {
      await overlay.setAlwaysOnTop(true);
      await overlay.setPosition(new PhysicalPosition(Math.round((1920 - 800) / 2), 16));
      await overlay.setSize(new PhysicalSize(800, 132));
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    let unlistenReactivate: (() => void) | null = null;
    let unlistenHide: (() => void) | null = null;

    listen("overlay-reactivate", () => {
      releaseHoverHide();
    })
      .then((fn) => {
        unlistenReactivate = fn;
      })
      .catch(() => undefined);

    listen("overlay-hover-hide", () => {
      engageHoverHide();
    })
      .then((fn) => {
        unlistenHide = fn;
      })
      .catch(() => undefined);

    return () => {
      if (unlistenReactivate) unlistenReactivate();
      if (unlistenHide) unlistenHide();
    };
  }, []);

  const setClickThrough = async (enabled: boolean) => {
    const overlay = getCurrentWindow() as unknown as { setIgnoreCursorEvents?: (ignore: boolean) => Promise<void> };
    try {
      if (overlay.setIgnoreCursorEvents) {
        await overlay.setIgnoreCursorEvents(enabled);
        return;
      }
    } catch {
      // fallback to native command
    }
    await invoke("set_overlay_click_through", { enabled });
  };

  const applyHoverState = (hideNow: boolean) => {
    if (hideNow) {
      if (!hideEngagedRef.current) {
        hideEngagedRef.current = true;
        lastToggleAtRef.current = Date.now();
      }
      outsideTickCountRef.current = 0;
      setHidden(true);
      if (!clickThroughEnabledRef.current) {
        clickThroughEnabledRef.current = true;
        setClickThrough(true).catch(() => {
          clickThroughEnabledRef.current = false;
        });
      }
      return;
    }
    if (hideEngagedRef.current) {
      hideEngagedRef.current = false;
      lastToggleAtRef.current = Date.now();
    }
    setHidden(false);
    outsideTickCountRef.current = 0;
    if (clickThroughEnabledRef.current) {
      clickThroughEnabledRef.current = false;
      setClickThrough(false).catch(() => {
        clickThroughEnabledRef.current = true;
      });
    }
  };

  const clearHoverTimers = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const engageHoverHide = () => {
    const now = Date.now();
    if (hideEngagedRef.current) return;
    if (now - lastToggleAtRef.current < TOGGLE_COOLDOWN_MS) return;
    clearHoverTimers();
    hideTimerRef.current = window.setTimeout(() => {
      applyHoverState(true);
      hideTimerRef.current = null;
    }, CLICK_THROUGH_DELAY);
  };

  const releaseHoverHide = () => {
    const now = Date.now();
    if (!hideEngagedRef.current) {
      clearHoverTimers();
      return;
    }
    const elapsed = now - lastToggleAtRef.current;
    const cooldownLeft = Math.max(0, TOGGLE_COOLDOWN_MS - elapsed);
    clearHoverTimers();
    showTimerRef.current = window.setTimeout(() => {
      applyHoverState(false);
      showTimerRef.current = null;
    }, REAPPEAR_DELAY + cooldownLeft);
  };

  const onMouseEnter = () => engageHoverHide();

  const onMouseLeave = () => {
    // Reappearance is controlled by interval-based cursor bounds checks.
    if (!hideEngagedRef.current) releaseHoverHide();
  };

  useEffect(() => {
    const autoHidden = hideForMissingPlayback || hideForStoppedPlayback;
    autoHiddenByPlaybackRef.current = autoHidden;

    invoke("set_hover_zone_enabled", { enabled: !autoHidden }).catch(() => undefined);

    if (autoHidden) {
      clearHoverTimers();
      hideEngagedRef.current = false;
      outsideTickCountRef.current = 0;
      setHidden(false);
      clickThroughEnabledRef.current = true;
      setClickThrough(true).catch(() => {
        clickThroughEnabledRef.current = false;
      });
      return;
    }

    const shouldPassThrough = hideEngagedRef.current;
    clickThroughEnabledRef.current = shouldPassThrough;
    setClickThrough(shouldPassThrough).catch(() => {
      clickThroughEnabledRef.current = !shouldPassThrough;
    });
  }, [hideForMissingPlayback, hideForStoppedPlayback]);

  useEffect(() => {
    if (!playback) {
      if (playbackMissingTimerRef.current) {
        window.clearTimeout(playbackMissingTimerRef.current);
      }
      playbackMissingTimerRef.current = window.setTimeout(() => {
        setHideForMissingPlayback(true);
        playbackMissingTimerRef.current = null;
      }, PLAYBACK_MISSING_GRACE_MS);
      if (playbackStopTimerRef.current) {
        window.clearTimeout(playbackStopTimerRef.current);
        playbackStopTimerRef.current = null;
      }
      setHideForStoppedPlayback(true);
      return;
    }
    if (playbackMissingTimerRef.current) {
      window.clearTimeout(playbackMissingTimerRef.current);
      playbackMissingTimerRef.current = null;
    }
    setHideForMissingPlayback(false);

    if (playback.isPlaying) {
      if (playbackStopTimerRef.current) {
        window.clearTimeout(playbackStopTimerRef.current);
        playbackStopTimerRef.current = null;
      }
      setHideForStoppedPlayback(false);
      return;
    }

    if (playbackStopTimerRef.current) {
      window.clearTimeout(playbackStopTimerRef.current);
    }
    playbackStopTimerRef.current = window.setTimeout(() => {
      setHideForStoppedPlayback(true);
      playbackStopTimerRef.current = null;
    }, STOP_HIDE_DELAY_MS);
  }, [playback?.trackId, playback?.isPlaying]);

  useEffect(() => {
    let cancelled = false;
    let lastTickNow = performance.now();
    let expectedDelayMs = HIDDEN_CHECK_SLOW_MS;

    const schedule = (ms: number) => {
      if (cancelled) return;
      expectedDelayMs = ms;
      hiddenCheckTimerRef.current = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (cancelled) return;

      const nowPerf = performance.now();
      const lag = nowPerf - lastTickNow - expectedDelayMs;
      lastTickNow = nowPerf;

      // Under pressure, back off hover polling so cursor input stays responsive.
      if (lag > LOOP_LAG_MS) {
        schedule(HIDDEN_CHECK_SLOW_MS);
        return;
      }

      if (!hideEngagedRef.current || autoHiddenByPlaybackRef.current) {
        schedule(HIDDEN_CHECK_SLOW_MS);
        return;
      }

      try {
        const overlay = getCurrentWindow();
        const [mouse, pos, size] = await Promise.all([
          cursorPosition(),
          overlay.outerPosition(),
          overlay.outerSize()
        ]);

        const left = pos.x - HOVER_MARGIN_PX;
        const top = 0;
        const right = pos.x + size.width + HOVER_MARGIN_PX;
        const bottom = pos.y + size.height + HOVER_MARGIN_PX;
        const inside = mouse.x >= left && mouse.x <= right && mouse.y >= top && mouse.y <= bottom;

        if (inside) {
          // Keep passthrough active while cursor is still over overlay area.
          applyHoverState(true);
          schedule(HIDDEN_CHECK_INTERVAL_MS);
          return;
        }
        outsideTickCountRef.current += 1;
        if (outsideTickCountRef.current >= OUTSIDE_CONFIRM_TICKS) {
          releaseHoverHide();
        }
      } catch {
        // If cursor query fails, keep prior behavior untouched.
      }

      schedule(HIDDEN_CHECK_INTERVAL_MS);
    };

    schedule(HIDDEN_CHECK_SLOW_MS);

    return () => {
      cancelled = true;
      clearHoverTimers();
      if (hiddenCheckTimerRef.current) {
        window.clearTimeout(hiddenCheckTimerRef.current);
        hiddenCheckTimerRef.current = null;
      }
      if (playbackStopTimerRef.current) {
        window.clearTimeout(playbackStopTimerRef.current);
        playbackStopTimerRef.current = null;
      }
      if (playbackMissingTimerRef.current) {
        window.clearTimeout(playbackMissingTimerRef.current);
        playbackMissingTimerRef.current = null;
      }
      clickThroughEnabledRef.current = false;
      invoke("set_hover_zone_enabled", { enabled: true }).catch(() => undefined);
      setClickThrough(false).catch(() => undefined);
    };
  }, []);

  const disconnected = sourceMode === "backup" && !loading && !playback;
  const autoHiddenByPlayback = hideForMissingPlayback || hideForStoppedPlayback;
  const safeDurationMs = playback?.durationMs ?? 0;
  const safeProgressMs = Math.max(0, Math.min(displayProgressMs, safeDurationMs || displayProgressMs || 0));
  const progressRatio = safeDurationMs > 0 ? Math.max(0, Math.min(1, safeProgressMs / safeDurationMs)) : 0;
  const hasActiveLyrics = Boolean(current);
  const noLyricsCompact = Boolean(playback && !hasActiveLyrics);
  const hoverZoneWidth = noLyricsCompact ? 304 : 800;
  const spicyBridgeMessage = bridgeStatus?.connected
    ? playback
      ? "Bridge connected"
      : "Bridge connected, waiting for playback"
    : "Bridge disconnected";

  useEffect(() => {
    invoke("set_hover_zone_width", { width: hoverZoneWidth }).catch(() => undefined);
  }, [hoverZoneWidth]);

  useEffect(() => {
    if (!playback) {
      setDisplayProgressMs(0);
      lastTitleRef.current = null;
      lastTrackRef.current = null;
      lastSeqRef.current = null;
      return;
    }
    const titleChanged = lastTitleRef.current !== null && lastTitleRef.current !== playback.title;
    const trackChanged = lastTrackRef.current !== null && lastTrackRef.current !== playback.trackId;
    const seqChanged =
      Number.isFinite(playback.seq) &&
      lastSeqRef.current !== null &&
      Number(playback.seq) !== lastSeqRef.current;
    lastTitleRef.current = playback.title;
    lastTrackRef.current = playback.trackId;
    if (Number.isFinite(playback.seq)) lastSeqRef.current = Number(playback.seq);

    const initialTarget = Math.max(0, Math.min(progressMs, playback.durationMs || progressMs));

    if (titleChanged || trackChanged) {
      setDisplayProgressMs(initialTarget);
      return;
    }

    const target = Math.max(0, Math.min(progressMs, playback.durationMs || progressMs));
    setDisplayProgressMs((prev) => {
      const drift = target - prev;
      const abs = Math.abs(drift);
      if ((seqChanged && abs >= 400) || abs >= 450) return target;
      return prev + drift * 0.22;
    });
  }, [playback?.trackId, playback?.title, playback?.durationMs, playback?.seq, progressMs]);

  useEffect(() => {
    invoke("set_auth_popup_visible", { visible: disconnected }).catch(() => undefined);
  }, [disconnected]);

  useEffect(() => {
    const coverUrl = playback?.albumCoverUrl;
    const fallback = () => {
      if (!coverUrl) {
        setCoverPrimary("88,110,148");
        setCoverSecondary("76,124,108");
        return;
      }

      const cached = coverCacheRef.current.get(coverUrl);
      if (cached) {
        setCoverPrimary(cached.primary);
        setCoverSecondary(cached.secondary);
        return;
      }

      let alive = true;
      extractAlbumColors(coverUrl).then((colors) => {
        if (!alive) return;
        coverCacheRef.current.set(coverUrl, colors);
        setCoverPrimary(colors.primary);
        setCoverSecondary(colors.secondary);
      });
      return () => {
        alive = false;
      };
    };

    if (sourceMode === "spicy" && playback?.trackId) {
      let cancelled = false;
      void (async () => {
        try {
          const payload = await invoke<string | null>("get_spicy_bridge_payload");
          if (cancelled || !payload) return;
          const parsed = JSON.parse(payload) as {
            trackId?: string;
            coverPrimary?: string;
            coverSecondary?: string;
            themePrimary?: string;
            themeSecondary?: string;
          };
          const primary = normalizeRgbTriplet(parsed.coverPrimary) ?? normalizeRgbTriplet(parsed.themePrimary);
          const secondary = normalizeRgbTriplet(parsed.coverSecondary) ?? normalizeRgbTriplet(parsed.themeSecondary);
          if (parsed.trackId === playback.trackId && primary && secondary) {
            setCoverPrimary(primary);
            setCoverSecondary(secondary);
            return;
          }
        } catch {
          // fallback below
        }
        fallback();
      })();
      return () => {
        cancelled = true;
      };
    };

    return fallback();
  }, [playback?.albumCoverUrl, playback?.trackId, sourceMode]);

  useEffect(() => {
    if (sourceMode !== "spicy") return;
    let unlisten: (() => void) | null = null;
    subscribeToSpicyBridgeUpdates((payload) => {
      if (!playback?.trackId) return;
      if (payload.trackId !== playback.trackId) return;
      const primary = normalizeRgbTriplet(payload.coverPrimary) ?? normalizeRgbTriplet(payload.themePrimary);
      const secondary = normalizeRgbTriplet(payload.coverSecondary) ?? normalizeRgbTriplet(payload.themeSecondary);
      if (primary && secondary) {
        setCoverPrimary(primary);
        setCoverSecondary(secondary);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      if (unlisten) unlisten();
    };
  }, [sourceMode, playback?.trackId]);

  return (
    <div className="overlay-root">
      <div
        className={`overlay-shell pill-${pillStyleMode}${hidden || autoHiddenByPlayback ? " hidden" : ""}${noLyricsCompact ? " no-lyrics-compact" : ""}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={
          {
            "--pill-shade": String(pillShade),
            "--cover-primary": coverPrimary,
            "--cover-secondary": coverSecondary
          } as CSSProperties
        }
      >
        {playback && hasActiveLyrics ? (
          <div className="playback-topbar">
            <div className="playback-progress-track">
              <div className="playback-progress-fill" style={{ width: `${progressRatio * 100}%` }} />
            </div>
            <div className="playback-time">
              {formatTime(safeProgressMs)} / {formatTime(safeDurationMs)}
            </div>
          </div>
        ) : null}
        {playback ? (
          <AnimatePresence mode="wait" initial={false}>
            {hasActiveLyrics ? (
              <div key="lyrics-live" className="overlay-content-grid">
                <TrackInfo playback={playback} />
                <LyricRenderer previous={previous} current={current} next={next} progressMs={safeProgressMs} compact />
                {alignmentDebugEnabled && current ? (
                  <div className="alignment-debug">
                    SIDE: {(current.side ?? "center").toUpperCase()}
                  </div>
                ) : null}
              </div>
            ) : (
              <NoLyricsState
                key="lyrics-empty"
                playback={playback}
                progressMs={safeProgressMs}
                durationMs={safeDurationMs}
              />
            )}
          </AnimatePresence>
        ) : (
          <div className="idle-state">{sourceMode === "spicy" ? spicyBridgeMessage : "Waiting for playback..."}</div>
        )}
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function normalizeRgbTriplet(value?: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (!match) return null;
  const r = clamp255(Number(match[1]));
  const g = clamp255(Number(match[2]));
  const b = clamp255(Number(match[3]));
  return `${r},${g},${b}`;
}

function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}
