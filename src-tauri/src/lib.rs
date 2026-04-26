use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

const SERVER_PORT: u16 = 4200;
const HEALTH_URL: &str = "http://localhost:4200/api/hub/state";
const HEALTH_TIMEOUT_SECS: u64 = 30;

/// Check whether a TCP port is currently free (bind succeeds → free).
fn check_port_available(port: u16) -> bool {
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
}

/// Poll the server health endpoint until it returns 200 or the timeout elapses.
fn wait_for_server(timeout: Duration) -> bool {
    let start = Instant::now();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();

    while start.elapsed() < timeout {
        if let Ok(_resp) = client.get(HEALTH_URL).send() {
            // Any HTTP response (including 401 Unauthorized) means the server is up.
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

/// Kill a child process — SIGTERM on Unix with SIGKILL fallback, taskkill on Windows.
#[cfg(unix)]
fn terminate_process(pid: u32) {
    use std::process::Command;
    // Send SIGTERM first
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output();

    // Wait up to 5s for graceful exit, then SIGKILL
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        std::thread::sleep(Duration::from_millis(200));
        // Check if still alive by sending signal 0
        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !alive {
            break;
        }
        if Instant::now() >= deadline {
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .output();
            break;
        }
    }
}

#[cfg(windows)]
fn terminate_process(pid: u32) {
    use std::process::Command;
    // Try graceful HTTP shutdown first
    let _ = reqwest::blocking::Client::new()
        .post("http://localhost:4200/shutdown")
        .timeout(Duration::from_secs(2))
        .send();

    std::thread::sleep(Duration::from_secs(2));

    // Forceful kill as fallback
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output();
}

pub fn run() {
    let sidecar_pid: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
    let sidecar_pid_clone = Arc::clone(&sidecar_pid);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // --- Force the main window to open maximized ---
            // tauri.conf.json sets `maximized: true`, but macOS's window-state
            // restoration can override that on subsequent launches. This explicit
            // call guarantees the window fills the screen every time.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.maximize();
            }

            // --- Port conflict check ---
            if !check_port_available(SERVER_PORT) {
                app_handle
                    .dialog()
                    .message("Port 4200 is already in use. Close the conflicting process and try again.")
                    .title("SpecRails Hub — Port Conflict")
                    .blocking_show();
                std::process::exit(1);
            }

            // --- Spawn sidecar ---
            let parent_pid_arg = format!("--parent-pid={}", std::process::id());

            let sidecar = app_handle
                .shell()
                .sidecar("specrails-server")
                .expect("specrails-server sidecar not configured")
                .args([&parent_pid_arg]);

            // On macOS, GUI apps launched from Finder/Dock inherit a minimal PATH
            // from launchd that omits user tool dirs (homebrew, cargo, bun,
            // ~/.local/bin). We rebuild PATH from a zsh login shell and prepend
            // well-known locations so tools like `claude` are found.
            //
            // On Windows and Linux, GUI apps inherit the user's PATH correctly
            // from Explorer / the desktop environment, so we do NOT override —
            // any override here would be POSIX-only garbage and hide real tools.
            #[cfg(target_os = "macos")]
            let sidecar = {
                let home = dirs_next::home_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
                let home_s = home.to_string_lossy();

                // zsh login PATH (covers nvm, pyenv, etc. configured in .zshrc)
                let zsh_path = std::process::Command::new("/bin/zsh")
                    .args(["-l", "-c", "echo $PATH"])
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_default();

                let prepend = format!(
                    "{home}/.local/bin:{home}/.bun/bin:{home}/.cargo/bin:\
                     /opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin",
                    home = home_s
                );

                let base = if zsh_path.is_empty() {
                    "/usr/bin:/bin:/usr/sbin:/sbin".to_string()
                } else {
                    zsh_path
                };
                let shell_path = format!("{prepend}:{base}");

                sidecar.env("PATH", &shell_path)
            };

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn specrails-server sidecar");

            let pid = child.pid();
            *sidecar_pid_clone.lock().unwrap() = Some(pid);

            // Drain sidecar stdout/stderr to prevent pipe buffer blocking.
            // Write to ~/Library/Logs/SpecRailsHub/sidecar.log for diagnostics.
            let log_path = dirs_next::home_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
                .join("Library/Logs/SpecRailsHub/sidecar.log");
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::thread::spawn(move || {
                use tauri_plugin_shell::process::CommandEvent;
                use std::io::Write;
                let mut log = std::fs::OpenOptions::new()
                    .create(true).append(true).open(&log_path).ok();
                while let Some(event) = rx.blocking_recv() {
                    let line = match event {
                        CommandEvent::Stdout(b) => format!("[OUT] {}\n", String::from_utf8_lossy(&b)),
                        CommandEvent::Stderr(b) => format!("[ERR] {}\n", String::from_utf8_lossy(&b)),
                        CommandEvent::Error(e)  => format!("[TAURI_ERR] {}\n", e),
                        CommandEvent::Terminated(s) => format!("[EXIT] code={:?}\n", s.code),
                        _ => continue,
                    };
                    if let Some(f) = log.as_mut() { let _ = f.write_all(line.as_bytes()); }
                }
            });

            // --- Health check (blocking, runs on a background thread) ---
            let app_handle2 = app_handle.clone();
            std::thread::spawn(move || {
                if !wait_for_server(Duration::from_secs(HEALTH_TIMEOUT_SECS)) {
                    app_handle2
                        .dialog()
                        .message(
                            "SpecRails Hub failed to start. Check that port 4200 is not in use.",
                        )
                        .title("SpecRails Hub — Startup Error")
                        .blocking_show();
                    std::process::exit(1);
                }
                // Server is ready — the React app (served from client/dist by Tauri)
                // makes API calls to localhost:4200 automatically; no redirect needed.
            });

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(pid) = *sidecar_pid.lock().unwrap() {
                    std::thread::spawn(move || {
                        terminate_process(pid);
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
