export type LyricsSourceMode = "spicy" | "backup";
export type PillStyleMode = "solid" | "acrylic" | "acrylic-shade";
export type LeftPanelMode = "cover-meta" | "cover-only";
export type LyricsVisualMode = "default" | "spicy-dense";
export type PlaybackHelperMode = "windows" | "web";

const LYRICS_SOURCE_KEY = "spotifydock_lyrics_source_mode";
const LYRICS_SOURCE_EVENT = "spotifydock:lyrics-source-mode";
const PILL_STYLE_KEY = "spotifydock_pill_style_mode";
const PILL_STYLE_EVENT = "spotifydock:pill-style-mode";
const PILL_SHADE_KEY = "spotifydock_pill_shade";
const PILL_SHADE_EVENT = "spotifydock:pill-shade";
const LEFT_PANEL_MODE_KEY = "spotifydock_left_panel_mode";
const LEFT_PANEL_MODE_EVENT = "spotifydock:left-panel-mode";
const PLAYBACK_SMOOTHNESS_KEY = "spotifydock_playback_smoothness";
const PLAYBACK_SMOOTHNESS_EVENT = "spotifydock:playback-smoothness";
const LINE_HYSTERESIS_KEY = "spotifydock_line_hysteresis_sec";
const LINE_HYSTERESIS_EVENT = "spotifydock:line-hysteresis-sec";
const LYRICS_VISUAL_MODE_KEY = "spotifydock_lyrics_visual_mode";
const LYRICS_VISUAL_MODE_EVENT = "spotifydock:lyrics-visual-mode";
const LYRICS_TIMING_OFFSET_MS_KEY = "spotifydock_lyrics_timing_offset_ms";
const LYRICS_TIMING_OFFSET_MS_EVENT = "spotifydock:lyrics-timing-offset-ms";
const ALIGNMENT_DEBUG_KEY = "spotifydock_alignment_debug";
const ALIGNMENT_DEBUG_EVENT = "spotifydock:alignment-debug";
const STRICT_STREAM_LOCK_KEY = "spotifydock_strict_stream_lock";
const STRICT_STREAM_LOCK_EVENT = "spotifydock:strict-stream-lock";
const PLAYBACK_HELPER_MODE_KEY = "spotifydock_playback_helper_mode";
const PLAYBACK_HELPER_MODE_EVENT = "spotifydock:playback-helper-mode";
const LOW_LATENCY_MODE_KEY = "spotifydock_low_latency_mode";
const LOW_LATENCY_MODE_EVENT = "spotifydock:low-latency-mode";

export function getLyricsSourceMode(): LyricsSourceMode {
  const value = localStorage.getItem(LYRICS_SOURCE_KEY);
  return value === "backup" ? "backup" : "spicy";
}

export function setLyricsSourceMode(mode: LyricsSourceMode): void {
  localStorage.setItem(LYRICS_SOURCE_KEY, mode);
  window.dispatchEvent(new CustomEvent(LYRICS_SOURCE_EVENT, { detail: mode }));
}

export function onLyricsSourceModeChange(callback: (mode: LyricsSourceMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<LyricsSourceMode>;
    callback(custom.detail);
  };

  window.addEventListener(LYRICS_SOURCE_EVENT, handler as EventListener);
  return () => window.removeEventListener(LYRICS_SOURCE_EVENT, handler as EventListener);
}

export function getPillStyleMode(): PillStyleMode {
  const value = localStorage.getItem(PILL_STYLE_KEY);
  return value === "solid" || value === "acrylic" || value === "acrylic-shade" ? value : "acrylic-shade";
}

export function setPillStyleMode(mode: PillStyleMode): void {
  localStorage.setItem(PILL_STYLE_KEY, mode);
  window.dispatchEvent(new CustomEvent(PILL_STYLE_EVENT, { detail: mode }));
}

export function onPillStyleModeChange(callback: (mode: PillStyleMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<PillStyleMode>;
    callback(custom.detail);
  };
  window.addEventListener(PILL_STYLE_EVENT, handler as EventListener);
  return () => window.removeEventListener(PILL_STYLE_EVENT, handler as EventListener);
}

export function getPillShade(): number {
  const value = Number(localStorage.getItem(PILL_SHADE_KEY));
  if (Number.isFinite(value)) {
    return Math.min(0.9, Math.max(0.1, value));
  }
  return 0.56;
}

export function setPillShade(value: number): void {
  const clamped = Math.min(0.9, Math.max(0.1, value));
  localStorage.setItem(PILL_SHADE_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(PILL_SHADE_EVENT, { detail: clamped }));
}

export function onPillShadeChange(callback: (value: number) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<number>;
    callback(custom.detail);
  };
  window.addEventListener(PILL_SHADE_EVENT, handler as EventListener);
  return () => window.removeEventListener(PILL_SHADE_EVENT, handler as EventListener);
}

export function getLeftPanelMode(): LeftPanelMode {
  const value = localStorage.getItem(LEFT_PANEL_MODE_KEY);
  return value === "cover-only" ? "cover-only" : "cover-meta";
}

export function setLeftPanelMode(mode: LeftPanelMode): void {
  localStorage.setItem(LEFT_PANEL_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent(LEFT_PANEL_MODE_EVENT, { detail: mode }));
}

export function onLeftPanelModeChange(callback: (mode: LeftPanelMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<LeftPanelMode>;
    callback(custom.detail);
  };
  window.addEventListener(LEFT_PANEL_MODE_EVENT, handler as EventListener);
  return () => window.removeEventListener(LEFT_PANEL_MODE_EVENT, handler as EventListener);
}

export function getPlaybackSmoothness(): number {
  const value = Number(localStorage.getItem(PLAYBACK_SMOOTHNESS_KEY));
  if (Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  return 0.68;
}

export function setPlaybackSmoothness(value: number): void {
  const clamped = Math.min(1, Math.max(0, value));
  localStorage.setItem(PLAYBACK_SMOOTHNESS_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(PLAYBACK_SMOOTHNESS_EVENT, { detail: clamped }));
}

export function onPlaybackSmoothnessChange(callback: (value: number) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<number>;
    callback(custom.detail);
  };
  window.addEventListener(PLAYBACK_SMOOTHNESS_EVENT, handler as EventListener);
  return () => window.removeEventListener(PLAYBACK_SMOOTHNESS_EVENT, handler as EventListener);
}

export function getLineHysteresisSec(): number {
  const value = Number(localStorage.getItem(LINE_HYSTERESIS_KEY));
  if (Number.isFinite(value)) return Math.min(0.6, Math.max(0.05, value));
  return 0.24;
}

export function setLineHysteresisSec(value: number): void {
  const clamped = Math.min(0.6, Math.max(0.05, value));
  localStorage.setItem(LINE_HYSTERESIS_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(LINE_HYSTERESIS_EVENT, { detail: clamped }));
}

export function onLineHysteresisSecChange(callback: (value: number) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<number>;
    callback(custom.detail);
  };
  window.addEventListener(LINE_HYSTERESIS_EVENT, handler as EventListener);
  return () => window.removeEventListener(LINE_HYSTERESIS_EVENT, handler as EventListener);
}

export function getLyricsVisualMode(): LyricsVisualMode {
  const value = localStorage.getItem(LYRICS_VISUAL_MODE_KEY);
  return value === "spicy-dense" ? "spicy-dense" : "default";
}

export function setLyricsVisualMode(mode: LyricsVisualMode): void {
  localStorage.setItem(LYRICS_VISUAL_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent(LYRICS_VISUAL_MODE_EVENT, { detail: mode }));
}

export function onLyricsVisualModeChange(callback: (mode: LyricsVisualMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<LyricsVisualMode>;
    callback(custom.detail);
  };
  window.addEventListener(LYRICS_VISUAL_MODE_EVENT, handler as EventListener);
  return () => window.removeEventListener(LYRICS_VISUAL_MODE_EVENT, handler as EventListener);
}

export function getLyricsTimingOffsetMs(): number {
  const value = Number(localStorage.getItem(LYRICS_TIMING_OFFSET_MS_KEY));
  if (Number.isFinite(value)) return Math.min(1200, Math.max(-1200, Math.round(value)));
  return 0;
}

export function setLyricsTimingOffsetMs(value: number): void {
  const clamped = Math.min(1200, Math.max(-1200, Math.round(value)));
  localStorage.setItem(LYRICS_TIMING_OFFSET_MS_KEY, String(clamped));
  window.dispatchEvent(new CustomEvent(LYRICS_TIMING_OFFSET_MS_EVENT, { detail: clamped }));
}

export function onLyricsTimingOffsetMsChange(callback: (value: number) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<number>;
    callback(custom.detail);
  };
  window.addEventListener(LYRICS_TIMING_OFFSET_MS_EVENT, handler as EventListener);
  return () => window.removeEventListener(LYRICS_TIMING_OFFSET_MS_EVENT, handler as EventListener);
}

export function getAlignmentDebugEnabled(): boolean {
  return localStorage.getItem(ALIGNMENT_DEBUG_KEY) === "1";
}

export function setAlignmentDebugEnabled(enabled: boolean): void {
  const normalized = enabled ? "1" : "0";
  localStorage.setItem(ALIGNMENT_DEBUG_KEY, normalized);
  window.dispatchEvent(new CustomEvent(ALIGNMENT_DEBUG_EVENT, { detail: enabled }));
}

export function onAlignmentDebugEnabledChange(callback: (enabled: boolean) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<boolean>;
    callback(Boolean(custom.detail));
  };
  window.addEventListener(ALIGNMENT_DEBUG_EVENT, handler as EventListener);
  return () => window.removeEventListener(ALIGNMENT_DEBUG_EVENT, handler as EventListener);
}

export function getStrictStreamLockEnabled(): boolean {
  // default ON for most stable sync behavior
  const value = localStorage.getItem(STRICT_STREAM_LOCK_KEY);
  if (value === null) return true;
  return value === "1";
}

export function setStrictStreamLockEnabled(enabled: boolean): void {
  const normalized = enabled ? "1" : "0";
  localStorage.setItem(STRICT_STREAM_LOCK_KEY, normalized);
  window.dispatchEvent(new CustomEvent(STRICT_STREAM_LOCK_EVENT, { detail: enabled }));
}

export function onStrictStreamLockEnabledChange(callback: (enabled: boolean) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<boolean>;
    callback(Boolean(custom.detail));
  };
  window.addEventListener(STRICT_STREAM_LOCK_EVENT, handler as EventListener);
  return () => window.removeEventListener(STRICT_STREAM_LOCK_EVENT, handler as EventListener);
}

export function getPlaybackHelperMode(): PlaybackHelperMode {
  const value = localStorage.getItem(PLAYBACK_HELPER_MODE_KEY);
  return value === "windows" || value === "web" ? value : "windows";
}

export function setPlaybackHelperMode(mode: PlaybackHelperMode): void {
  localStorage.setItem(PLAYBACK_HELPER_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent(PLAYBACK_HELPER_MODE_EVENT, { detail: mode }));
}

export function onPlaybackHelperModeChange(callback: (mode: PlaybackHelperMode) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<PlaybackHelperMode>;
    callback(custom.detail);
  };
  window.addEventListener(PLAYBACK_HELPER_MODE_EVENT, handler as EventListener);
  return () => window.removeEventListener(PLAYBACK_HELPER_MODE_EVENT, handler as EventListener);
}

export function getLowLatencyModeEnabled(): boolean {
  return localStorage.getItem(LOW_LATENCY_MODE_KEY) === "1";
}

export function setLowLatencyModeEnabled(enabled: boolean): void {
  const normalized = enabled ? "1" : "0";
  localStorage.setItem(LOW_LATENCY_MODE_KEY, normalized);
  window.dispatchEvent(new CustomEvent(LOW_LATENCY_MODE_EVENT, { detail: enabled }));
}

export function onLowLatencyModeChange(callback: (enabled: boolean) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<boolean>;
    callback(Boolean(custom.detail));
  };
  window.addEventListener(LOW_LATENCY_MODE_EVENT, handler as EventListener);
  return () => window.removeEventListener(LOW_LATENCY_MODE_EVENT, handler as EventListener);
}
