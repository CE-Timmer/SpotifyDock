import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  getLyricsSourceMode,
  setLyricsSourceMode,
  type LyricsSourceMode,
  getPillStyleMode,
  setPillStyleMode,
  type PillStyleMode,
  getPillShade,
  setPillShade,
  getLeftPanelMode,
  setLeftPanelMode,
  type LeftPanelMode,
  getPlaybackSmoothness,
  setPlaybackSmoothness,
  getLineHysteresisSec,
  setLineHysteresisSec,
  getLyricsVisualMode,
  setLyricsVisualMode,
  type LyricsVisualMode,
  getLyricsTimingOffsetMs,
  setLyricsTimingOffsetMs,
  getAlignmentDebugEnabled,
  setAlignmentDebugEnabled,
  getStrictStreamLockEnabled,
  setStrictStreamLockEnabled,
  getPlaybackHelperMode,
  setPlaybackHelperMode,
  type PlaybackHelperMode,
  getLowLatencyModeEnabled,
  setLowLatencyModeEnabled
} from "../services/settings";

export function ControlPanel() {
  const [autostart, setAutostart] = useState(false);
  const [lyricsSourceMode, setLyricsSourceModeState] = useState<LyricsSourceMode>(getLyricsSourceMode());
  const [pillStyleMode, setPillStyleModeState] = useState<PillStyleMode>(getPillStyleMode());
  const [pillShade, setPillShadeState] = useState<number>(getPillShade());
  const [leftPanelMode, setLeftPanelModeState] = useState<LeftPanelMode>(getLeftPanelMode());
  const [playbackSmoothness, setPlaybackSmoothnessState] = useState<number>(getPlaybackSmoothness());
  const [lineHysteresisSec, setLineHysteresisSecState] = useState<number>(getLineHysteresisSec());
  const [lyricsVisualMode, setLyricsVisualModeState] = useState<LyricsVisualMode>(getLyricsVisualMode());
  const [lyricsTimingOffsetMs, setLyricsTimingOffsetMsState] = useState<number>(getLyricsTimingOffsetMs());
  const [alignmentDebugEnabled, setAlignmentDebugEnabledState] = useState<boolean>(getAlignmentDebugEnabled());
  const [strictStreamLockEnabled, setStrictStreamLockEnabledState] = useState<boolean>(getStrictStreamLockEnabled());
  const [playbackHelperMode, setPlaybackHelperModeState] = useState<PlaybackHelperMode>(getPlaybackHelperMode());
  const [lowLatencyModeEnabled, setLowLatencyModeEnabledState] = useState<boolean>(getLowLatencyModeEnabled());
  const [streamDebug, setStreamDebug] = useState<{ trackId: string; seq: string; progressMs: string }>({
    trackId: "-",
    seq: "-",
    progressMs: "-"
  });

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (lyricsSourceMode !== "spicy") {
      setStreamDebug({ trackId: "-", seq: "-", progressMs: "-" });
      return;
    }

    let alive = true;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const raw = await invoke<string | null>("get_spicy_bridge_payload");
        if (!alive) return;
        if (!raw) {
          setStreamDebug({ trackId: "-", seq: "-", progressMs: "-" });
          return;
        }

        const parsed = JSON.parse(raw) as {
          trackId?: string;
          seq?: number;
          progressMs?: number;
        };

        setStreamDebug({
          trackId: parsed.trackId ? String(parsed.trackId) : "-",
          seq: Number.isFinite(parsed.seq) ? String(parsed.seq) : "-",
          progressMs: Number.isFinite(parsed.progressMs) ? `${Math.round(Number(parsed.progressMs))}` : "-"
        });
      } catch {
        if (alive) setStreamDebug({ trackId: "-", seq: "-", progressMs: "-" });
      }
    };

    void tick();
    timer = window.setInterval(() => void tick(), 500);

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [lyricsSourceMode]);

  const onSourceModeChange = (mode: LyricsSourceMode) => {
    setLyricsSourceMode(mode);
    setLyricsSourceModeState(mode);
  };

  const onPillStyleChange = (mode: PillStyleMode) => {
    setPillStyleMode(mode);
    setPillStyleModeState(mode);
  };

  const onPillShadeChange = (value: number) => {
    setPillShade(value);
    setPillShadeState(value);
  };

  const onLeftPanelModeChange = (mode: LeftPanelMode) => {
    setLeftPanelMode(mode);
    setLeftPanelModeState(mode);
  };

  const onPlaybackSmoothnessSlider = (value: number) => {
    setPlaybackSmoothness(value);
    setPlaybackSmoothnessState(value);
  };

  const onLineHysteresisSlider = (value: number) => {
    setLineHysteresisSec(value);
    setLineHysteresisSecState(value);
  };

  const onLyricsVisualModeSelect = (mode: LyricsVisualMode) => {
    setLyricsVisualMode(mode);
    setLyricsVisualModeState(mode);
  };

  const onLyricsTimingOffsetSlider = (value: number) => {
    setLyricsTimingOffsetMs(value);
    setLyricsTimingOffsetMsState(value);
  };

  const onAlignmentDebugToggle = (enabled: boolean) => {
    setAlignmentDebugEnabled(enabled);
    setAlignmentDebugEnabledState(enabled);
  };

  const onStrictStreamLockToggle = (enabled: boolean) => {
    setStrictStreamLockEnabled(enabled);
    setStrictStreamLockEnabledState(enabled);
  };

  const onPlaybackHelperModeSelect = (mode: PlaybackHelperMode) => {
    setPlaybackHelperMode(mode);
    setPlaybackHelperModeState(mode);
  };

  const onLowLatencyModeToggle = (enabled: boolean) => {
    setLowLatencyModeEnabled(enabled);
    setLowLatencyModeEnabledState(enabled);
  };

  const toggleAutostart = async () => {
    if (autostart) {
      await disable();
      setAutostart(false);
    } else {
      await enable();
      setAutostart(true);
    }
  };

  return (
    <div className="control-root">
      <div className="control-card">
        <h1>SpotifyDock</h1>
        <p>Control your overlay, Spotify auth popup, and startup behavior.</p>
        <div className="control-setting">
          <label htmlFor="lyrics-source">Lyrics Source</label>
          <select
            id="lyrics-source"
            value={lyricsSourceMode}
            onChange={(e) => onSourceModeChange(e.target.value as LyricsSourceMode)}
          >
            <option value="spicy">DockBridge</option>
            <option value="backup">Backup (LRCLIB + Cache)</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="pill-style">Pill Style</label>
          <select
            id="pill-style"
            value={pillStyleMode}
            onChange={(e) => onPillStyleChange(e.target.value as PillStyleMode)}
          >
            <option value="solid">Solid</option>
            <option value="acrylic">Acrylic</option>
            <option value="acrylic-shade">Acrylic + Shade</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="left-panel-mode">Left Panel</label>
          <select
            id="left-panel-mode"
            value={leftPanelMode}
            onChange={(e) => onLeftPanelModeChange(e.target.value as LeftPanelMode)}
          >
            <option value="cover-meta">Cover + Meta</option>
            <option value="cover-only">Cover Only</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="pill-shade">Pill Shade ({pillShade.toFixed(2)})</label>
          <input
            id="pill-shade"
            type="range"
            min={0.1}
            max={0.9}
            step={0.01}
            value={pillShade}
            onChange={(e) => onPillShadeChange(Number(e.target.value))}
          />
        </div>
        <div className="control-setting">
          <label htmlFor="lyrics-visual-mode">Lyrics Visual Mode</label>
          <select
            id="lyrics-visual-mode"
            value={lyricsVisualMode}
            onChange={(e) => onLyricsVisualModeSelect(e.target.value as LyricsVisualMode)}
          >
            <option value="default">Default</option>
            <option value="spicy-dense">Spicy Dense</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="lyrics-timing-offset">Lyrics Timing Offset ({lyricsTimingOffsetMs} ms)</label>
          <input
            id="lyrics-timing-offset"
            type="range"
            min={-1200}
            max={1200}
            step={10}
            value={lyricsTimingOffsetMs}
            onChange={(e) => onLyricsTimingOffsetSlider(Number(e.target.value))}
          />
        </div>
        <div className="control-setting">
          <label htmlFor="alignment-debug">Alignment Debug</label>
          <select
            id="alignment-debug"
            value={alignmentDebugEnabled ? "on" : "off"}
            onChange={(e) => onAlignmentDebugToggle(e.target.value === "on")}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="strict-stream-lock">Strict Stream Lock</label>
          <select
            id="strict-stream-lock"
            value={strictStreamLockEnabled ? "on" : "off"}
            onChange={(e) => onStrictStreamLockToggle(e.target.value === "on")}
          >
            <option value="on">On (Recommended)</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="playback-helper-mode">Playback Helper</label>
          <select
            id="playback-helper-mode"
            value={playbackHelperMode}
            onChange={(e) => onPlaybackHelperModeSelect(e.target.value as PlaybackHelperMode)}
          >
            <option value="windows">Windows Media Helper</option>
            <option value="web">Spotify Web API Helper</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="low-latency-mode">Low Latency Mode</label>
          <select
            id="low-latency-mode"
            value={lowLatencyModeEnabled ? "on" : "off"}
            onChange={(e) => onLowLatencyModeToggle(e.target.value === "on")}
          >
            <option value="off">Off (Smoother)</option>
            <option value="on">On (Tighter Sync)</option>
          </select>
        </div>
        <div className="control-setting">
          <label htmlFor="playback-smoothness">Playback Smoothness ({playbackSmoothness.toFixed(2)})</label>
          <input
            id="playback-smoothness"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={playbackSmoothness}
            onChange={(e) => onPlaybackSmoothnessSlider(Number(e.target.value))}
          />
        </div>
        <div className="control-setting">
          <label htmlFor="line-hysteresis">Line Hysteresis ({lineHysteresisSec.toFixed(2)}s)</label>
          <input
            id="line-hysteresis"
            type="range"
            min={0.05}
            max={0.6}
            step={0.01}
            value={lineHysteresisSec}
            onChange={(e) => onLineHysteresisSlider(Number(e.target.value))}
          />
        </div>
        <div className="control-actions">
          <button className="primary" onClick={() => invoke("set_overlay_visible", { visible: true })}>Show Overlay</button>
          <button className="ghost" onClick={() => invoke("set_overlay_visible", { visible: false })}>Hide Overlay</button>
          <button className="ghost" onClick={() => invoke("set_auth_popup_visible", { visible: true })}>Open Spotify Popup</button>
          <button className="ghost" onClick={toggleAutostart}>{autostart ? "Disable Autostart" : "Enable Autostart"}</button>
        </div>
        <div className="stream-debug-strip">
          <span>trackId: {streamDebug.trackId}</span>
          <span>seq: {streamDebug.seq}</span>
          <span>progressMs: {streamDebug.progressMs}</span>
        </div>
      </div>
    </div>
  );
}
