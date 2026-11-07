//! Renders tray icons at runtime (formerly 576 pre-generated PNGs).
//! Geometry matches the 1.x `scripts/icons.mjs` artwork.

fn rounded(x: f64, y: f64, left: f64, top: f64, width: f64, height: f64, r: f64) -> bool {
    let dx = (x - left - width / 2.0).abs() - width / 2.0 + r;
    let dy = (y - top - height / 2.0).abs() - height / 2.0 + r;
    (dx.max(0.0)).hypot(dy.max(0.0)) + dx.max(dy).min(0.0) <= r
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Style {
    Meter,
    Ring,
}

/// RGBA pixels. `five_hour`/`weekly` are 0–10 steps, or -1 when unknown.
pub fn render(size: u32, style: Style, color: [u8; 3], five_hour: i32, weekly: i32) -> Vec<u8> {
    let s = size as f64;
    let mut out = vec![0u8; (size * size * 4) as usize];
    let both_unknown = five_hour < 0 && weekly < 0;
    for y in 0..size {
        for x in 0..size {
            let mut alpha_sum = 0u32;
            for sy in 0..4 {
                for sx in 0..4 {
                    let px = (x as f64 + (sx as f64 + 0.5) / 4.0) / s;
                    let py = (y as f64 + (sy as f64 + 0.5) / 4.0) / s;
                    let mut alpha = 0u32;
                    match style {
                        Style::Meter => {
                            for (level, top) in [(five_hour, 0.26), (weekly, 0.61)] {
                                if level < 0 && !both_unknown {
                                    continue;
                                }
                                if rounded(px, py, 0.1, top, 0.8, 0.14, 0.04) {
                                    alpha = 65;
                                }
                                if level > 0 && rounded(px, py, 0.1, top, 0.8 * level as f64 / 10.0, 0.14, 0.04) {
                                    alpha = 255;
                                }
                            }
                        }
                        Style::Ring => {
                            let d = (px - 0.5).hypot(py - 0.5);
                            let tau = std::f64::consts::TAU;
                            let angle = ((py - 0.5).atan2(px - 0.5) + std::f64::consts::PI * 2.5) % tau;
                            if (five_hour >= 0 || weekly < 0) && d > 0.355 && d < 0.455 {
                                alpha = if angle < tau * five_hour as f64 / 10.0 { 255 } else { 55 };
                            }
                            if (weekly >= 0 || five_hour < 0) && d > 0.17 && d < 0.27 {
                                alpha = if angle < tau * weekly as f64 / 10.0 { 255 } else { 55 };
                            }
                        }
                    }
                    alpha_sum += alpha;
                }
            }
            // Straight alpha: the color is uniform, only coverage varies.
            let at = ((y * size + x) * 4) as usize;
            out[at..at + 3].copy_from_slice(&color);
            out[at + 3] = (alpha_sum / 16) as u8;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renders_expected_coverage() {
        let full = render(20, Style::Meter, [255, 255, 255], 10, 10);
        let empty = render(20, Style::Meter, [255, 255, 255], 0, 0);
        let alpha = |p: &Vec<u8>| p.chunks(4).map(|c| c[3] as u32).sum::<u32>();
        assert_eq!(full.len(), 20 * 20 * 4);
        assert!(alpha(&full) > alpha(&empty) * 2);
        let ring = render(32, Style::Ring, [0, 0, 0], -1, -1);
        assert!(alpha(&ring) > 0);
    }
}
