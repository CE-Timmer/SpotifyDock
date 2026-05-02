import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getLyricsSourceMode, setLyricsSourceMode, type LyricsSourceMode } from "../services/settings";

export function ControlPanel() {
  const [autostart, setAutostart] = useState(false);
  const [lyricsSourceMode, setLyricsSourceModeState] = useState<LyricsSourceMode>(getLyricsSourceMode());

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => undefined);
  }, []);

  const onSourceModeChange = (mode: LyricsSourceMode) => {
    setLyricsSourceMode(mode);
    setLyricsSourceModeState(mode);
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
            <option value="spicy">Spicy Lyrics</option>
            <option value="backup">Backup (LRCLIB + Cache)</option>
          </select>
        </div>
        <div className="control-actions">
          <button className="primary" onClick={() => invoke("set_overlay_visible", { visible: true })}>Show Overlay</button>
          <button className="ghost" onClick={() => invoke("set_overlay_visible", { visible: false })}>Hide Overlay</button>
          <button className="ghost" onClick={() => invoke("set_auth_popup_visible", { visible: true })}>Open Spotify Popup</button>
          <button className="ghost" onClick={toggleAutostart}>{autostart ? "Disable Autostart" : "Enable Autostart"}</button>
        </div>
      </div>
    </div>
  );
}
