//! Popover, settings and floating pill windows. Hidden windows are destroyed
//! after a second so idle Koodex keeps no web view (and no WebView2 processes).
use crate::geometry::{self, Rect, DOCK_TAB_WIDTH};
use crate::settings::Settings;
use crate::usage::now_ms;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const POPOVER: &str = "popover";
pub const SETTINGS: &str = "settings";
pub const PILL: &str = "pill";
const POPOVER_WIDTH: f64 = 320.0;
/// A small static UI needs no GPU process, background services or extensions.
/// Every window must pass identical arguments (they share one WebView2 environment).
/// The first three disabled features are Tauri's defaults.
const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,SpareRendererForSitePerProcess \
--disable-gpu --disable-gpu-compositing --disable-background-networking --disable-component-update \
--disable-extensions --disable-sync --no-pings --renderer-process-limit=1";

#[derive(Default)]
struct State {
    anchor: Option<Rect>,
    blurred_at: i64,
    opened_at: i64,
    drag: Option<((f64, f64), Rect)>,
    expanded: bool,
    dock_mode: String,
    slide: u64,
}

#[derive(Default)]
pub struct Windows {
    state: Mutex<State>,
}

fn area_of(m: &Monitor) -> (Rect, f64) {
    let a = m.work_area();
    (
        Rect { x: a.position.x as f64, y: a.position.y as f64, width: a.size.width as f64, height: a.size.height as f64 },
        m.scale_factor(),
    )
}

fn monitor_at(app: &AppHandle, x: f64, y: f64) -> Option<(Rect, f64)> {
    app.monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| {
            // Off-screen points (a removed display) fall back to the nearest monitor.
            app.available_monitors().ok()?.into_iter().min_by_key(|m| {
                let (r, _) = area_of(m);
                let dx = (x - (r.x + r.width / 2.0)).abs();
                let dy = (y - (r.y + r.height / 2.0)).abs();
                (dx + dy) as i64
            })
        })
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| area_of(&m))
}

fn primary(app: &AppHandle) -> (Rect, f64) {
    app.primary_monitor()
        .ok()
        .flatten()
        .map(|m| area_of(&m))
        .unwrap_or((Rect { x: 0.0, y: 0.0, width: 1280.0, height: 720.0 }, 1.0))
}

fn bounds(w: &WebviewWindow) -> Option<Rect> {
    let p = w.outer_position().ok()?;
    let s = w.outer_size().ok()?;
    Some(Rect { x: p.x as f64, y: p.y as f64, width: s.width as f64, height: s.height as f64 })
}

fn set_bounds(w: &WebviewWindow, r: Rect) {
    let _ = w.set_size(PhysicalSize::new(r.width.round().max(1.0) as u32, r.height.round().max(1.0) as u32));
    let _ = w.set_position(PhysicalPosition::new(r.x.round() as i32, r.y.round() as i32));
}

fn center(r: Rect) -> (f64, f64) {
    (r.x + r.width / 2.0, r.y + r.height / 2.0)
}

impl Windows {
    fn create(&self, app: &AppHandle, label: &str, query: &str, width: f64, height: f64) -> Option<WebviewWindow> {
        if let Some(w) = app.get_webview_window(label) {
            return Some(w);
        }
        let settings = label == SETTINGS;
        let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html?{query}").into()))
            .title(match label { SETTINGS => "Koodex Settings", POPOVER => "Koodex Usage", _ => "Koodex" })
            .inner_size(width, height)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(settings)
            .skip_taskbar(!settings)
            .always_on_top(!settings)
            .focused(label != PILL)
            .additional_browser_args(WEBVIEW_ARGS)
            .visible(false);
        // Mock/test profiles keep their own WebView2 data so they can run beside
        // an installed Koodex (a shared profile must use identical arguments).
        if let Some(dir) = crate::isolated_webview_dir() {
            builder = builder.data_directory(dir);
        }
        let window = builder.build().ok()?;
        let handle = app.clone();
        let name = label.to_string();
        window.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let core = crate::core(&handle);
                if name == PILL {
                    let _ = core.update_settings(serde_json::json!({"floatingPillEnabled": false}));
                } else {
                    core.windows.hide(&handle, &name);
                }
            }
            WindowEvent::Focused(false) if name == POPOVER => {
                let core = crate::core(&handle);
                // A closing context menu or tray click can steal focus right
                // after the popover opens; take it back instead of hiding.
                if now_ms() - core.windows.state.lock().unwrap().opened_at < 700 {
                    if let Some(w) = handle.get_webview_window(POPOVER) {
                        let _ = w.set_focus();
                    }
                    return;
                }
                core.windows.state.lock().unwrap().blurred_at = now_ms();
                core.windows.hide(&handle, POPOVER);
            }
            _ => {}
        });
        Some(window)
    }

    fn show(&self, w: &WebviewWindow, focus: bool) {
        let _ = w.show();
        if focus {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }

    pub fn hide(&self, app: &AppHandle, label: &str) {
        let Some(w) = app.get_webview_window(label) else { return };
        let _ = w.hide();
        if label == POPOVER {
            let _ = app.emit_to(PILL, "view", "usage");
        }
        // Release the web view shortly after; quick reopen clicks reuse it.
        let handle = app.clone();
        let label = label.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if let Some(w) = handle.get_webview_window(&label) {
                if !w.is_visible().unwrap_or(true) {
                    let _ = w.destroy();
                }
            }
        });
    }

    pub fn is_visible(&self, app: &AppHandle, label: &str) -> bool {
        app.get_webview_window(label).map_or(false, |w| w.is_visible().unwrap_or(false))
    }

    pub fn open_popover(&self, app: &AppHandle, anchor: Option<Rect>) {
        let anchor = anchor
            .or_else(|| app.get_webview_window(PILL).filter(|w| w.is_visible().unwrap_or(false)).and_then(|w| bounds(&w)))
            .or_else(|| app.cursor_position().ok().map(|p| Rect { x: p.x, y: p.y, width: 1.0, height: 1.0 }));
        {
            let mut st = self.state.lock().unwrap();
            st.anchor = anchor;
            st.opened_at = now_ms();
        }
        let Some(w) = self.create(app, POPOVER, "view=popover", POPOVER_WIDTH, 270.0) else { return };
        let height = bounds(&w).map(|b| b.height);
        self.position_popover(app, &w, height);
        self.show(&w, true);
        let _ = app.emit_to(PILL, "view", "paused");
    }

    pub fn toggle_popover(&self, app: &AppHandle, anchor: Rect) {
        if self.is_visible(app, POPOVER) {
            self.hide(app, POPOVER);
        } else if now_ms() - self.state.lock().unwrap().blurred_at > 250 {
            self.open_popover(app, Some(anchor));
        }
    }

    fn position_popover(&self, app: &AppHandle, w: &WebviewWindow, height: Option<f64>) {
        let anchor = self.state.lock().unwrap().anchor;
        let (area, scale) = match anchor {
            Some(a) => {
                let (x, y) = center(a);
                monitor_at(app, x, y).unwrap_or_else(|| primary(app))
            }
            None => primary(app),
        };
        let anchor = anchor.unwrap_or(area);
        let height = height.unwrap_or(270.0 * scale);
        set_bounds(w, geometry::near_anchor(anchor, POPOVER_WIDTH * scale, height, area, scale));
    }

    pub fn resize_popover(&self, app: &AppHandle, height: f64) {
        let Some(w) = app.get_webview_window(POPOVER) else { return };
        let scale = w.scale_factor().unwrap_or(1.0);
        let height = height.ceil().clamp(160.0, 560.0) * scale;
        self.position_popover(app, &w, Some(height));
    }

    pub fn open_settings(&self, app: &AppHandle, section: Option<&str>) {
        self.hide(app, POPOVER);
        let existed = app.get_webview_window(SETTINGS).is_some();
        let query = match section {
            Some(s) => format!("view=settings&section={s}"),
            None => "view=settings".into(),
        };
        let Some(w) = self.create(app, SETTINGS, &query, 740.0, 760.0) else { return };
        if !existed || !w.is_visible().unwrap_or(false) {
            let cursor = app.cursor_position().ok();
            let (area, scale) = cursor.and_then(|p| monitor_at(app, p.x, p.y)).unwrap_or_else(|| primary(app));
            let (width, height) = ((740.0 * scale).min(area.width), (760.0 * scale).min(area.height));
            set_bounds(
                &w,
                geometry::clamp(
                    Rect { x: area.x + (area.width - width) / 2.0, y: area.y + (area.height - height) / 2.0, width, height },
                    area,
                ),
            );
        }
        if existed && section.is_some() {
            let _ = app.emit_to(SETTINGS, "view", "updates");
        }
        self.show(&w, true);
    }

    fn pill_area(&self, app: &AppHandle, settings: &Settings, w: Option<&WebviewWindow>) -> (Rect, f64) {
        if let Some(b) = w.and_then(bounds) {
            let (x, y) = center(b);
            if let Some(found) = monitor_at(app, x, y) {
                return found;
            }
        }
        match &settings.pill_position {
            Some(p) => monitor_at(app, p.x as f64, p.y as f64).unwrap_or_else(|| primary(app)),
            None => primary(app),
        }
    }

    pub fn sync_pill(&self, app: &AppHandle, settings: &Settings) {
        let mode = if settings.pill_side_hideable && geometry::is_vertical(settings) {
            settings.pill_placement.clone()
        } else {
            String::new()
        };
        {
            let mut st = self.state.lock().unwrap();
            if mode != st.dock_mode {
                st.expanded = false;
            }
            st.dock_mode = mode.clone();
            st.slide += 1;
        }
        if !settings.floating_pill_enabled || !settings.setup_completed {
            self.hide(app, PILL);
            return;
        }
        let existing = app.get_webview_window(PILL);
        let (area, scale) = self.pill_area(app, settings, None);
        let (lw, lh) = geometry::pill_size(settings);
        let size = (lw * scale, lh * scale);
        let Some(w) = existing.or_else(|| self.create(app, PILL, "view=pill", lw, lh)) else { return };
        let (x, y) = geometry::pinned_position(settings, area, size, scale);
        let mut rect = geometry::clamp(Rect { x, y, width: size.0, height: size.1 }, area);
        if !mode.is_empty() {
            rect = self.dock_bounds(settings, area, scale, self.state.lock().unwrap().expanded);
        }
        set_bounds(&w, rect);
        if !w.is_visible().unwrap_or(false) {
            self.show(&w, false);
        }
        self.restore_overlay(app);
    }

    /// Keeps the pill above other windows, unless Koodex's own panels are open.
    pub fn restore_overlay(&self, app: &AppHandle) {
        let Some(w) = app.get_webview_window(PILL) else { return };
        if !w.is_visible().unwrap_or(false) || self.is_visible(app, POPOVER) {
            return;
        }
        let _ = w.set_always_on_top(false);
        let _ = w.set_always_on_top(true);
    }

    fn dock_bounds(&self, settings: &Settings, area: Rect, scale: f64, expanded: bool) -> Rect {
        let (lw, lh) = geometry::pill_size(settings);
        let size = (lw * scale, lh * scale);
        let tab = DOCK_TAB_WIDTH * scale;
        let width = if expanded { size.0 + tab } else { tab };
        let (_, y) = geometry::pinned_position(settings, area, size, scale);
        geometry::clamp(
            Rect {
                x: if settings.pill_placement == "left" { area.x } else { area.x + area.width - width },
                y,
                width,
                height: size.1,
            },
            area,
        )
    }

    pub fn expand_pill(&self, app: &AppHandle, settings: &Settings, expanded: bool) {
        let Some(w) = app.get_webview_window(PILL) else { return };
        let generation = {
            let mut st = self.state.lock().unwrap();
            if st.dock_mode.is_empty() {
                return;
            }
            st.expanded = expanded;
            st.slide += 1;
            st.slide
        };
        let (area, scale) = self.pill_area(app, settings, Some(&w));
        let Some(from) = bounds(&w) else { return };
        let to = self.dock_bounds(settings, area, scale, expanded);
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let start = std::time::Instant::now();
            loop {
                if crate::core(&handle).windows.state.lock().unwrap().slide != generation {
                    return;
                }
                let progress = (start.elapsed().as_secs_f64() / 0.18).min(1.0);
                let eased = 1.0 - (1.0 - progress).powi(3);
                set_bounds(
                    &w,
                    Rect {
                        x: from.x + (to.x - from.x) * eased,
                        width: from.width + (to.width - from.width) * eased,
                        ..to
                    },
                );
                if progress >= 1.0 {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(16)).await;
            }
        });
    }

    /// Returns the new pill position/pin offset to persist when a drag ends.
    pub fn drag_pill(&self, app: &AppHandle, settings: &Settings, phase: &str) -> Option<serde_json::Value> {
        let w = app.get_webview_window(PILL)?;
        let cursor = app.cursor_position().ok()?;
        let cursor = (cursor.x, cursor.y);
        let mut st = self.state.lock().unwrap();
        if phase == "start" {
            st.slide += 1;
            st.drag = Some((cursor, bounds(&w)?));
            return None;
        }
        let (origin, start) = st.drag?;
        if phase == "cancel" {
            set_bounds(&w, start);
            st.drag = None;
            return None;
        }
        if phase != "move" && phase != "end" {
            return None;
        }
        let end = phase == "end";
        if end {
            st.drag = None;
        }
        let docked = !st.dock_mode.is_empty();
        drop(st);
        let moved = Rect { x: start.x + cursor.0 - origin.0, y: start.y + cursor.1 - origin.1, ..start };
        if settings.pill_placement == "free" {
            let (area, scale) = monitor_at(app, cursor.0, cursor.1)?;
            let next = if end { geometry::snap(moved, area, scale) } else { geometry::clamp(moved, area) };
            set_bounds(&w, next);
            return end.then(|| serde_json::json!({"pillPosition": {"x": next.x, "y": next.y}}));
        }
        let (sx, sy) = center(start);
        let (area, scale) = monitor_at(app, sx, sy)?;
        let (lw, lh) = geometry::pill_size(settings);
        let size = (lw * scale, lh * scale);
        let offset = geometry::pin_offset_for_drag(settings, (moved.x, moved.y), area, size, scale);
        let pinned = Settings { pill_pin_offset: Some(offset), ..settings.clone() };
        let (x, y) = geometry::pinned_position(&pinned, area, size, scale);
        let x = if docked {
            if settings.pill_placement == "left" { area.x } else { area.x + area.width - moved.width }
        } else {
            x
        };
        set_bounds(&w, geometry::clamp(Rect { x, y, ..moved }, area));
        end.then(|| serde_json::json!({"pillPinOffset": offset}))
    }

    pub fn destroy_all(&self, app: &AppHandle) {
        for label in [POPOVER, SETTINGS, PILL] {
            if let Some(w) = app.get_webview_window(label) {
                let _ = w.destroy();
            }
        }
    }
}
