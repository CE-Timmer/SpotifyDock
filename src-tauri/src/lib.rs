use std::{
  fs,
  io::{Read, Write},
  net::{TcpListener, TcpStream},
  path::PathBuf,
  sync::{Arc, Mutex},
  thread,
};

use tauri::{
  menu::{Menu, MenuItem},
  tray::{TrayIconBuilder, TrayIconEvent},
  Manager, PhysicalPosition, PhysicalSize, Runtime,
};
use serde_json::Value;

#[derive(Clone)]
struct SpicyBridgeState {
  latest_payload: Arc<Mutex<Option<String>>>,
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
fn get_spicy_bridge_payload(state: tauri::State<SpicyBridgeState>) -> Result<Option<String>, String> {
  let guard = state.latest_payload.lock().map_err(|e| e.to_string())?;
  Ok(guard.clone())
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
  let response = format!(
    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.flush();
}

fn handle_bridge_connection(mut stream: TcpStream, shared: &Arc<Mutex<Option<String>>>) {
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
        if let Ok(mut guard) = shared.lock() {
          *guard = Some(value.to_string());
        }
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

fn start_spicy_bridge_server(shared: Arc<Mutex<Option<String>>>) {
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
        handle_bridge_connection(stream, &shared);
      }
    }
  });
}

fn setup_window(app: &tauri::App) {
  let mut x = 0;
  let mut y = 16;
  let mut monitor_w = 1920;

  if let Some(window) = app.get_webview_window("main") {
    let _ = window.set_always_on_top(true);

    if let Ok(Some(monitor)) = window.primary_monitor() {
      let size = monitor.size();
      monitor_w = size.width as i32;
      x = ((size.width as i32 - 800) / 2).max(0);
      y = 16;
      let _ = window.set_position(PhysicalPosition::new(x, y));
      let _ = window.set_size(PhysicalSize::new(800, 120));
    }
  }

  if let Some(hover_zone) = app.get_webview_window("hover-zone") {
    let _ = hover_zone.set_always_on_top(true);
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

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
  let open_control = MenuItem::with_id(app, "open_control", "Open SpotifyDock", true, None::<&str>)?;
  let show_overlay = MenuItem::with_id(app, "show_overlay", "Show Overlay", true, None::<&str>)?;
  let hide_overlay = MenuItem::with_id(app, "hide_overlay", "Hide Overlay", true, None::<&str>)?;
  let connect_spotify = MenuItem::with_id(app, "connect_spotify", "Connect Spotify", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

  let menu = Menu::with_items(
    app,
    &[&open_control, &show_overlay, &hide_overlay, &connect_spotify, &quit],
  )?;

  TrayIconBuilder::new()
    .icon(app.default_window_icon().cloned().ok_or_else(|| tauri::Error::AssetNotFound("Default icon missing".into()))?)
    .menu(&menu)
    .show_menu_on_left_click(true)
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
        "quit" => {
          app_handle.exit(0);
        }
        _ => {}
      }
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::DoubleClick { .. } = event {
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
  };
  let spicy_bridge_shared = spicy_bridge_state.latest_payload.clone();

  tauri::Builder::default()
    .manage(spicy_bridge_state)
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
      start_spicy_bridge_server(spicy_bridge_shared.clone());
      setup_window(app);
      setup_tray(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_lyrics_for_track,
      save_lyrics_file,
      lyrics_cache_dir,
      get_spicy_bridge_payload,
      set_auth_popup_visible,
      set_overlay_visible,
      focus_control_window
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
