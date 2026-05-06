use std::{
  env,
  fs,
  io::{Read, Write},
  net::{TcpListener, TcpStream},
  path::PathBuf,
  process::Command,
  sync::{Arc, Mutex},
  sync::atomic::{AtomicBool, Ordering},
  thread,
};

use tauri::{
  menu::{Menu, MenuItem},
  tray::{TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime,
};
use serde_json::Value;
use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::Media::Control::{
  GlobalSystemMediaTransportControlsSessionManager,
  GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[derive(Clone)]
struct SpicyBridgeState {
  latest_payload: Arc<Mutex<Option<String>>>,
  last_update_ms: Arc<Mutex<u64>>,
}

#[derive(Clone)]
struct WindowsMediaState {
  latest_payload: Arc<Mutex<Option<String>>>,
  enabled: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct WindowsMediaTimeline {
  source_app: String,
  track_id: String,
  title: String,
  artist: String,
  duration_ms: u64,
  progress_ms: u64,
  is_playing: bool,
  fetched_at: u64,
}

fn lyrics_cache_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
  let mut dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  dir.push("lyrics-cache");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

#[tauri::command]
fn lyrics_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
  Ok(lyrics_cache_path(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn load_lyrics_for_track(app: tauri::AppHandle, track_id: String, fallback_file_name: String) -> Result<Option<String>, String> {
  let dir = lyrics_cache_path(&app)?;

  for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    if !entry.path().is_file() {
      continue;
    }

    let payload = fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
    if payload.contains(&format!("\"trackId\": \"{}\"", track_id)) {
      return Ok(Some(payload));
    }
  }

  let mut fallback = dir;
  fallback.push(fallback_file_name);
  if fallback.exists() {
    let payload = fs::read_to_string(fallback).map_err(|e| e.to_string())?;
    return Ok(Some(payload));
  }

  Ok(None)
}

#[tauri::command]
fn save_lyrics_file(app: tauri::AppHandle, file_name: String, json_payload: String) -> Result<(), String> {
  let mut file_path = lyrics_cache_path(&app)?;
  file_path.push(file_name);
  fs::write(file_path, json_payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_auth_popup_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
  let popup = app.get_webview_window("auth-popup").ok_or("auth popup not found")?;

  if visible {
    popup.show().map_err(|e| e.to_string())?;
    popup.set_focus().map_err(|e| e.to_string())?;
  } else {
    popup.hide().map_err(|e| e.to_string())?;
  }

  Ok(())
}

#[tauri::command]
fn set_overlay_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
  let main = app.get_webview_window("main").ok_or("main window not found")?;
  let hover = app.get_webview_window("hover-zone").ok_or("hover window not found")?;
  if visible {
    main.show().map_err(|e| e.to_string())?;
    hover.show().map_err(|e| e.to_string())?;
  } else {
    main.hide().map_err(|e| e.to_string())?;
    hover.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn focus_control_window(app: tauri::AppHandle) -> Result<(), String> {
  let control = app.get_webview_window("control").ok_or("control window not found")?;
  control.show().map_err(|e| e.to_string())?;
  control.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_overlay_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
  let main = app.get_webview_window("main").ok_or("main window not found")?;
  main.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hover_zone_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
  let hover = app.get_webview_window("hover-zone").ok_or("hover window not found")?;
  if enabled {
    hover.show().map_err(|e| e.to_string())
  } else {
    hover.hide().map_err(|e| e.to_string())
  }
}

#[tauri::command]
fn set_hover_zone_width(app: tauri::AppHandle, width: u32) -> Result<(), String> {
  let main = app.get_webview_window("main").ok_or("main window not found")?;
  let hover = app.get_webview_window("hover-zone").ok_or("hover window not found")?;

  let main_pos = main.outer_position().map_err(|e| e.to_string())?;
  let main_size = main.outer_size().map_err(|e| e.to_string())?;

  let max_width = main_size.width.max(1);
  let clamped_width = width.clamp(120, max_width);
  let x_offset = ((max_width - clamped_width) / 2) as i32;
  let hover_x = main_pos.x + x_offset;

  hover
    .set_position(PhysicalPosition::new(hover_x, 0))
    .map_err(|e| e.to_string())?;
  hover
    .set_size(PhysicalSize::new(clamped_width, 10))
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
fn set_overlay_mode_compact(app: tauri::AppHandle, compact: bool) -> Result<(), String> {
  let main = app.get_webview_window("main").ok_or("main window not found")?;
  let hover = app.get_webview_window("hover-zone").ok_or("hover window not found")?;

  let target_width: u32 = if compact { 304 } else { 800 };
  let target_height: u32 = 132;

  let monitor = main
    .current_monitor()
    .map_err(|e| e.to_string())?
    .or_else(|| main.primary_monitor().ok().flatten());

  let (x, y) = if let Some(m) = monitor {
    let size = m.size();
    let centered_x = ((size.width as i32 - target_width as i32) / 2).max(0);
    (centered_x, 16)
  } else {
    let pos = main.outer_position().map_err(|e| e.to_string())?;
    (pos.x, 16)
  };

  main
    .set_position(PhysicalPosition::new(x, y))
    .map_err(|e| e.to_string())?;
  main
    .set_size(PhysicalSize::new(target_width, target_height))
    .map_err(|e| e.to_string())?;

  hover
    .set_position(PhysicalPosition::new(x, 0))
    .map_err(|e| e.to_string())?;
  hover
    .set_size(PhysicalSize::new(target_width, 10))
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
fn get_spicy_bridge_payload(state: tauri::State<SpicyBridgeState>) -> Result<Option<String>, String> {
  let guard = state.latest_payload.lock().map_err(|e| e.to_string())?;
  Ok(guard.clone())
}

#[tauri::command]
fn get_spicy_bridge_status(state: tauri::State<SpicyBridgeState>) -> Result<String, String> {
  let has_payload = state
    .latest_payload
    .lock()
    .map_err(|e| e.to_string())?
    .is_some();
  let last_update_ms = *state.last_update_ms.lock().map_err(|e| e.to_string())?;

  Ok(format!(
    "{{\"hasPayload\":{},\"lastUpdateMs\":{}}}",
    has_payload, last_update_ms
  ))
}

#[tauri::command]
fn get_windows_media_timeline(state: tauri::State<WindowsMediaState>) -> Result<Option<String>, String> {
  let guard = state.latest_payload.lock().map_err(|e| e.to_string())?;
  Ok(guard.clone())
}

#[tauri::command]
fn set_windows_media_helper_enabled(
  state: tauri::State<WindowsMediaState>,
  enabled: bool,
) -> Result<(), String> {
  state.enabled.store(enabled, Ordering::Relaxed);
  Ok(())
}

#[cfg(target_os = "windows")]
fn timespan_to_ms(duration_100ns: i64) -> u64 {
  if duration_100ns <= 0 {
    return 0;
  }
  (duration_100ns as u64) / 10_000
}

#[cfg(target_os = "windows")]
fn query_windows_media_timeline() -> Option<WindowsMediaTimeline> {
  let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().ok()?.get().ok()?;
  let session = manager.GetCurrentSession().ok()?;

  let source_app = session.SourceAppUserModelId().ok().map(|s| s.to_string()).unwrap_or_default();
  let source_lower = source_app.to_lowercase();
  if !source_lower.contains("spotify") {
    return None;
  }

  let playback_info = session.GetPlaybackInfo().ok()?;
  let playback_status = playback_info.PlaybackStatus().ok()?;
  let is_playing = matches!(
    playback_status,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
  );

  let timeline = session.GetTimelineProperties().ok()?;
  let duration_ms = timespan_to_ms(timeline.EndTime().ok()?.Duration);
  let progress_ms = timespan_to_ms(timeline.Position().ok()?.Duration);

  let media_props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
  let title = media_props.Title().ok().map(|s| s.to_string()).unwrap_or_default();
  let artist = media_props.Artist().ok().map(|s| s.to_string()).unwrap_or_default();

  let fetched_at = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0);

  let track_id = format!(
    "winmedia:{}:{}:{}",
    title.trim().to_lowercase(),
    artist.trim().to_lowercase(),
    duration_ms
  );

  Some(WindowsMediaTimeline {
    source_app,
    track_id,
    title,
    artist,
    duration_ms,
    progress_ms,
    is_playing,
    fetched_at,
  })
}

#[cfg(not(target_os = "windows"))]
fn query_windows_media_timeline() -> Option<WindowsMediaTimeline> {
  None
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
  let response = format!(
    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.flush();
}

fn handle_bridge_connection(
  mut stream: TcpStream,
  shared: &Arc<Mutex<Option<String>>>,
  last_update_ms: &Arc<Mutex<u64>>,
  app_handle: &tauri::AppHandle,
) {
  let mut buffer = vec![0_u8; 256 * 1024];
  let bytes_read = match stream.read(&mut buffer) {
    Ok(n) => n,
    Err(_) => return,
  };
  if bytes_read == 0 {
    return;
  }

  let raw = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
  let mut header_body = raw.splitn(2, "\r\n\r\n");
  let header_text = header_body.next().unwrap_or_default();
  let body_from_split = header_body.next().unwrap_or_default();

  let mut lines = header_text.lines();
  let request_line = lines.next().unwrap_or_default();
  let mut request_parts = request_line.split_whitespace();
  let method = request_parts.next().unwrap_or_default();
  let path = request_parts.next().unwrap_or_default();

  let mut content_length = 0_usize;
  for line in lines {
    if let Some(value) = line.strip_prefix("Content-Length:") {
      content_length = value.trim().parse::<usize>().unwrap_or(0);
    }
  }

  if method == "OPTIONS" {
    respond(&mut stream, "200 OK", "{\"ok\":true}");
    return;
  }

  if method == "GET" && path == "/v1/current-track" {
    if let Ok(mut guard) = last_update_ms.lock() {
      *guard = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    }
    let payload = shared
      .lock()
      .ok()
      .and_then(|g| g.clone())
      .unwrap_or_else(|| "null".to_string());
    respond(&mut stream, "200 OK", &payload);
    return;
  }

  if method == "POST" && path == "/v1/current-track" {
    let mut body = body_from_split.to_string();
    if body.len() < content_length {
      let mut rest = vec![0_u8; content_length - body.len()];
      if stream.read_exact(&mut rest).is_ok() {
        body.push_str(&String::from_utf8_lossy(&rest));
      }
    }

    match serde_json::from_str::<Value>(&body) {
      Ok(value) => {
        let serialized = value.to_string();
        if let Ok(mut guard) = shared.lock() {
          *guard = Some(serialized.clone());
        }
        if let Ok(mut guard) = last_update_ms.lock() {
          *guard = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        }
        let _ = app_handle.emit("spicy-bridge-update", serialized);
        respond(&mut stream, "200 OK", "{\"ok\":true}");
      }
      Err(_) => {
        respond(&mut stream, "400 Bad Request", "{\"ok\":false,\"error\":\"invalid-json\"}");
      }
    }
    return;
  }

  respond(&mut stream, "404 Not Found", "{\"ok\":false,\"error\":\"not-found\"}");
}

fn start_spicy_bridge_server(
  shared: Arc<Mutex<Option<String>>>,
  last_update_ms: Arc<Mutex<u64>>,
  app_handle: tauri::AppHandle,
) {
  thread::spawn(move || {
    let listener = match TcpListener::bind("127.0.0.1:61337") {
      Ok(l) => l,
      Err(err) => {
        eprintln!("Spicy bridge bind failed: {err}");
        return;
      }
    };

    for stream in listener.incoming() {
      if let Ok(stream) = stream {
        handle_bridge_connection(stream, &shared, &last_update_ms, &app_handle);
      }
    }
  });
}

fn start_windows_media_monitor(
  shared: Arc<Mutex<Option<String>>>,
  enabled: Arc<AtomicBool>,
  app_handle: tauri::AppHandle,
) {
  let mut last_emitted: Option<String> = None;
  thread::spawn(move || loop {
    if !enabled.load(Ordering::Relaxed) {
      thread::sleep(std::time::Duration::from_millis(1800));
      continue;
    }

    let payload = query_windows_media_timeline()
      .and_then(|data| serde_json::to_string(&data).ok());

    if let Ok(mut guard) = shared.lock() {
      *guard = payload.clone();
    }

    if let Some(serialized) = payload {
      if last_emitted.as_deref() != Some(serialized.as_str()) {
        last_emitted = Some(serialized.clone());
        let _ = app_handle.emit("windows-media-update", serialized);
      }
    } else {
      last_emitted = None;
    }

    thread::sleep(std::time::Duration::from_millis(1200));
  });
}

fn setup_window(app: &tauri::App) {
  let mut x = 0;
  let mut y = 16;
  let mut monitor_w = 1920;

  if let Some(window) = app.get_webview_window("main") {
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);

    if let Ok(Some(monitor)) = window.primary_monitor() {
      let size = monitor.size();
      monitor_w = size.width as i32;
      x = ((size.width as i32 - 800) / 2).max(0);
      y = 16;
      let _ = window.set_position(PhysicalPosition::new(x, y));
      let _ = window.set_size(PhysicalSize::new(800, 132));
    }
  }

  if let Some(hover_zone) = app.get_webview_window("hover-zone") {
    let _ = hover_zone.set_always_on_top(true);
    let _ = hover_zone.set_shadow(false);
    let _ = hover_zone.set_position(PhysicalPosition::new(x, 0));
    let _ = hover_zone.set_size(PhysicalSize::new(800, 10));
  }

  if let Some(auth_popup) = app.get_webview_window("auth-popup") {
    let popup_x = ((monitor_w - 430) / 2).max(0);
    let popup_y = y + 140;
    let _ = auth_popup.set_always_on_top(true);
    let _ = auth_popup.set_position(PhysicalPosition::new(popup_x, popup_y));
    let _ = auth_popup.set_size(PhysicalSize::new(430, 190));
  }
}

#[cfg(target_os = "windows")]
fn apply_native_overlay_vibrancy(window: &tauri::WebviewWindow) {
  let _ = window_vibrancy::apply_mica(window, Some(true))
    .or_else(|_| window_vibrancy::apply_acrylic(window, Some((16, 19, 26, 120))))
    .or_else(|_| window_vibrancy::apply_blur(window, Some((16, 19, 26, 120))));
}

#[cfg(not(target_os = "windows"))]
fn apply_native_overlay_vibrancy(_window: &tauri::WebviewWindow) {}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
  let open_control = MenuItem::with_id(app, "open_control", "Open SpotifyDock", true, None::<&str>)?;
  let show_overlay = MenuItem::with_id(app, "show_overlay", "Show Overlay", true, None::<&str>)?;
  let hide_overlay = MenuItem::with_id(app, "hide_overlay", "Hide Overlay", true, None::<&str>)?;
  let connect_spotify = MenuItem::with_id(app, "connect_spotify", "Connect Spotify", true, None::<&str>)?;
  let restart = MenuItem::with_id(app, "restart_dock", "Restart Dock", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

  let menu = Menu::with_items(
    app,
    &[&open_control, &show_overlay, &hide_overlay, &connect_spotify, &restart, &quit],
  )?;

  let tray_icon = tauri::include_image!("icons/32x32.png");

  TrayIconBuilder::new()
    .icon(tray_icon)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app_handle, event| {
      match event.id().as_ref() {
        "open_control" => {
          if let Some(control) = app_handle.get_webview_window("control") {
            let _ = control.show();
            let _ = control.set_focus();
          }
        }
        "show_overlay" => {
          if let Some(main) = app_handle.get_webview_window("main") {
            let _ = main.show();
          }
          if let Some(hover) = app_handle.get_webview_window("hover-zone") {
            let _ = hover.show();
          }
        }
        "hide_overlay" => {
          if let Some(main) = app_handle.get_webview_window("main") {
            let _ = main.hide();
          }
          if let Some(hover) = app_handle.get_webview_window("hover-zone") {
            let _ = hover.hide();
          }
        }
        "connect_spotify" => {
          if let Some(popup) = app_handle.get_webview_window("auth-popup") {
            let _ = popup.show();
            let _ = popup.set_focus();
          }
        }
        "restart_dock" => {
          if let Ok(exe) = env::current_exe() {
            let _ = Command::new(exe).spawn();
          }
          app_handle.exit(0);
        }
        "quit" => {
          app_handle.exit(0);
        }
        _ => {}
      }
    })
    .on_tray_icon_event(|tray, event| {
      if matches!(event, TrayIconEvent::Click { .. } | TrayIconEvent::DoubleClick { .. }) {
        if let Some(control) = tray.app_handle().get_webview_window("control") {
          let _ = control.show();
          let _ = control.set_focus();
        }
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let spicy_bridge_state = SpicyBridgeState {
    latest_payload: Arc::new(Mutex::new(None)),
    last_update_ms: Arc::new(Mutex::new(0)),
  };
  let spicy_bridge_shared = spicy_bridge_state.latest_payload.clone();
  let spicy_bridge_last_update = spicy_bridge_state.last_update_ms.clone();
  let windows_media_state = WindowsMediaState {
    latest_payload: Arc::new(Mutex::new(None)),
    enabled: Arc::new(AtomicBool::new(false)),
  };
  let windows_media_shared = windows_media_state.latest_payload.clone();
  let windows_media_enabled = windows_media_state.enabled.clone();

  tauri::Builder::default()
    .manage(spicy_bridge_state)
    .manage(windows_media_state)
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      app.handle().plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
      ))?;
      start_spicy_bridge_server(
        spicy_bridge_shared.clone(),
        spicy_bridge_last_update.clone(),
        app.handle().clone(),
      );
      start_windows_media_monitor(
        windows_media_shared.clone(),
        windows_media_enabled.clone(),
        app.handle().clone(),
      );
      setup_window(app);
      setup_tray(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_lyrics_for_track,
      save_lyrics_file,
      lyrics_cache_dir,
      get_spicy_bridge_payload,
      get_spicy_bridge_status,
      get_windows_media_timeline,
      set_windows_media_helper_enabled,
      set_auth_popup_visible,
      set_overlay_visible,
      focus_control_window,
      set_overlay_click_through,
      set_hover_zone_enabled,
      set_hover_zone_width,
      set_overlay_mode_compact
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
