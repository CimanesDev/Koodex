//! Pill sizing and placement. Keep `pill_size` in sync with `src/shared/pill.ts`.
//! All rectangles here are physical pixels; sizes are scaled by the monitor DPI.
use crate::settings::Settings;

pub const DOCK_TAB_WIDTH: f64 = 32.0;
const GAP: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn is_vertical(s: &Settings) -> bool {
    s.pill_placement == "left" || s.pill_placement == "right"
}

/// Logical (CSS pixel) pill size.
pub fn pill_size(s: &Settings) -> (f64, f64) {
    let both = s.pill_layout == "both";
    let minimal = s.pill_content == "indicator";
    let vertical = is_vertical(s);
    let combined = both && s.pill_both_style == "combined";
    let ring = s.pill_indicator == "ring";
    let grip_on = s.pill_show_drag_handle;
    let grip = if grip_on { if vertical { 16.0 } else { 20.0 } } else { 0.0 };
    let refresh = if s.pill_show_refresh { 32.0 } else { 0.0 };
    let badge = if s.pill_show_provider { if vertical { 18.0 } else { 22.0 } } else { 0.0 };
    let reset = s.pill_show_reset && !minimal;
    if s.show_both_providers {
        // Two provider segments: logo + both-limits indicator (+ two short values).
        if vertical {
            let segment = 20.0 + (if ring { 28.0 } else { 14.0 }) + if minimal { 0.0 } else { 26.0 };
            return (if minimal { 44.0 } else { 56.0 }, segment * 2.0 + 13.0 + 16.0 + grip + refresh);
        }
        let segment = 22.0 + (if ring { 28.0 } else { 44.0 }) + if minimal { 0.0 } else { 42.0 };
        return (segment * 2.0 + 13.0 + 16.0 + grip + refresh, 44.0);
    }
    if vertical {
        if minimal {
            return (
                if ring { 40.0 } else { 36.0 },
                (if ring { if both && !combined { 72.0 } else { 40.0 } } else { 64.0 }) + grip + refresh + badge,
            );
        }
        return (
            if combined { 144.0 } else { 132.0 },
            (if both { 88.0 } else { 48.0 }) + (if reset { if both { 28.0 } else { 14.0 } } else { 0.0 }) + grip + refresh + badge,
        );
    }
    if combined {
        if minimal {
            return ((if ring { 44.0 } else { 104.0 }) + grip + refresh + badge, 44.0);
        }
        return (
            224.0 + (if grip_on { 0.0 } else { -12.0 }) + refresh + badge,
            64.0 + if reset { 26.0 } else { 0.0 },
        );
    }
    if minimal {
        return (
            (if ring { if both { 80.0 } else { 44.0 } } else if both { 172.0 } else { 104.0 }) + grip + refresh + badge,
            40.0,
        );
    }
    (
        (if both { 284.0 } else { 176.0 }) + refresh + badge - if grip_on { 0.0 } else { 12.0 },
        (if ring { 44.0 } else { 50.0 }) + if reset { 18.0 } else { 0.0 },
    )
}

pub fn clamp(r: Rect, area: Rect) -> Rect {
    Rect {
        x: r.x.min(area.x + area.width - r.width).max(area.x).round(),
        y: r.y.min(area.y + area.height - r.height).max(area.y).round(),
        ..r
    }
}

pub fn snap(r: Rect, area: Rect, scale: f64) -> Rect {
    let mut out = clamp(r, area);
    let (gap, distance) = (GAP * scale, 32.0 * scale);
    let left = area.x + gap;
    let right = area.x + area.width - r.width - gap;
    let top = area.y + gap;
    if (out.x - left).abs() <= distance {
        out.x = left;
    } else if (out.x - right).abs() <= distance {
        out.x = right;
    }
    if (out.y - top).abs() <= distance {
        out.y = top;
        let center = (area.x + (area.width - r.width) / 2.0).round();
        if (out.x - center).abs() <= 64.0 * scale {
            out.x = center;
        }
    }
    clamp(out, area)
}

/// Where the pill goes for the current placement. `size` is physical.
pub fn pinned_position(s: &Settings, area: Rect, size: (f64, f64), scale: f64) -> (f64, f64) {
    let (width, height) = size;
    let gap = GAP * scale;
    let left = area.x + gap;
    let right = area.x + area.width - width - gap;
    let top = area.y + gap;
    if s.pill_placement != "free" {
        if let Some(offset) = s.pill_pin_offset {
            return if is_vertical(s) {
                (
                    if s.pill_placement == "left" { left } else { right },
                    (top + (area.height - height - gap * 2.0).max(0.0) * offset).round(),
                )
            } else {
                ((left + (area.width - width - gap * 2.0).max(0.0) * offset).round(), top)
            };
        }
    }
    match s.pill_placement.as_str() {
        "top-left" => (left, top),
        "top-center" => ((area.x + (area.width - width) / 2.0).round(), top),
        "top-right" => (right, top),
        "left" => (left, (area.y + (area.height - height) / 2.0).round()),
        "right" => (right, (area.y + (area.height - height) / 2.0).round()),
        _ => match &s.pill_position {
            Some(p) => (p.x as f64, p.y as f64),
            None => (area.x + area.width - width - 20.0 * scale, area.y + area.height - height - 20.0 * scale),
        },
    }
}

pub fn pin_offset_for_drag(s: &Settings, point: (f64, f64), area: Rect, size: (f64, f64), scale: f64) -> f64 {
    let gap = GAP * scale;
    let (distance, length) = if is_vertical(s) {
        (point.1 - area.y - gap, area.height - size.1 - gap * 2.0)
    } else {
        (point.0 - area.x - gap, area.width - size.0 - gap * 2.0)
    };
    (distance / length.max(1.0)).clamp(0.0, 1.0)
}

/// Places a `width`×`height` popup next to `anchor`, below if it fits.
pub fn near_anchor(anchor: Rect, width: f64, height: f64, area: Rect, scale: f64) -> Rect {
    let below = anchor.y + anchor.height + 8.0 * scale;
    clamp(
        Rect {
            x: anchor.x + anchor.width - width,
            y: if below + height <= area.y + area.height { below } else { anchor.y - height - 8.0 * scale },
            width,
            height,
        },
        area,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    const AREA: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };

    #[test]
    fn default_pill_is_bottom_right() {
        let s = Settings::default();
        let size = pill_size(&s);
        assert_eq!(size, (176.0, 44.0));
        assert_eq!(pinned_position(&s, AREA, size, 1.0), (1920.0 - 176.0 - 20.0, 1040.0 - 44.0 - 20.0));
    }

    #[test]
    fn both_providers_size() {
        let s = Settings { show_both_providers: true, ..Default::default() };
        assert_eq!(pill_size(&s), (2.0 * 92.0 + 13.0 + 16.0 + 20.0, 44.0));
        let v = Settings { pill_placement: "left".into(), pill_content: "indicator".into(), ..s };
        assert_eq!(pill_size(&v), (44.0, 2.0 * 48.0 + 13.0 + 16.0 + 16.0));
    }

    #[test]
    fn snaps_to_top_center() {
        let r = snap(Rect { x: 900.0, y: 20.0, width: 100.0, height: 40.0 }, AREA, 1.0);
        assert_eq!((r.x, r.y), (910.0, 12.0));
    }

    #[test]
    fn pin_offset_round_trip() {
        let mut s = Settings { pill_placement: "right".into(), ..Default::default() };
        let size = pill_size(&s);
        let offset = pin_offset_for_drag(&s, (0.0, 500.0), AREA, size, 1.0);
        s.pill_pin_offset = Some(offset);
        assert_eq!(pinned_position(&s, AREA, size, 1.0).1, 500.0);
    }

    #[test]
    fn popup_flips_above_near_bottom() {
        let r = near_anchor(Rect { x: 1800.0, y: 1000.0, width: 20.0, height: 20.0 }, 320.0, 300.0, AREA, 1.0);
        assert_eq!(r.y, 1000.0 - 300.0 - 8.0);
    }
}
