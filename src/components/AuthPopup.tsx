import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { beginSpotifyLogin, clearSpotifySession, validateSpotifyConfig } from "../services/spotify";
import { useSpotifyPlayback } from "../hooks/useSpotifyPlayback";

export function AuthPopup() {
  const { playback, loading, error } = useSpotifyPlayback();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && playback) {
      invoke("set_auth_popup_visible", { visible: false }).catch(() => undefined);
    }
  }, [loading, playback]);

  useEffect(() => {
    const configError = validateSpotifyConfig();
    setActionError(configError);
  }, []);

  const onConnect = async () => {
    try {
      setActionError(null);
      await beginSpotifyLogin();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Spotify login failed");
    }
  };

  return (
    <div className="auth-window-root">
      <div className="auth-window-card">
        <div className="auth-kicker">Spotify</div>
        <div className="auth-title">Connect your account to start lyrics</div>
        <div className="auth-actions">
          <button className="primary" onClick={onConnect}>Connect Spotify</button>
          <button className="ghost" onClick={() => clearSpotifySession()}>Clear Session</button>
        </div>
        {actionError ? <div className="auth-error">{actionError}</div> : null}
        {!actionError && error ? <div className="auth-error">{error}</div> : null}
      </div>
    </div>
  );
}
