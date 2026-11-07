# Koodex

A quiet Windows tray companion that shows your **Codex** or **Claude Code** usage limits: remaining percentages, reset countdowns, a floating pill and a live tray meter.

**[Download Koodex for Windows](https://github.com/CimanesDev/Koodex/releases/latest)** · [Website](https://cimanesdev.github.io/Koodex/)

Choose the `x64-setup.exe` installer under **Assets**. Requires Windows 10/11 x64 (WebView2 is installed automatically if missing). Release builds are unsigned and may show a Windows publisher warning.

## What's new in 2.1

- **Show both providers, cleanly.** Pick **Codex**, **Claude Code** or **Both** from the popup header, the tray menu or the pill's right-click menu. In Both, the pill stacks one full-size row per provider, each styled with your Pill & appearance choices (one or both limits, separate or combined rings/bars, reset countdowns), and the popup shows one card per provider. The tray icon follows the provider you choose.
- **Real logos.** The pill, switches and settings use the official Codex (OpenAI) and Claude marks.
- **Fixed:** right-click → **Usage details** now opens the usage popup (it closed instantly before).

## What's new in 2.0

- **Rewritten in Rust (Tauri 2).** No bundled Chromium. Tray-only Koodex uses a few MB instead of ~90 MB, and the installer is a few MB instead of ~100 MB. See [Resource use](#resource-use).
- **Claude Code usage that actually updates.** 1.x relied on Claude Code's terminal status line, so usage from the desktop app, IDE extensions or claude.ai never arrived and reports went stale. Koodex now reads the same account usage that Claude Code's `/usage` shows, so every Claude surface counts. No Node.js required.
- **One provider at a time** by default, switched instantly from the usage popup header, the tray menu (**Show usage for**) or the pill's right-click menu.
- Sharper tray icons rendered at your display's DPI, a draggable settings window that no longer closes when it loses focus, and an updater that verifies every installer against the release's SHA-256 checksums.

Upgrading from 1.x keeps your preferences (`%APPDATA%\Koodex`). The installer removes the old Electron copy, and Koodex removes the 1.x Claude status-line bridge from `~/.claude/settings.json`, restoring your previous status line (a dated backup is kept).

## Features

- Floating pill: one limit (click to switch) or both, text or indicator-only, rings or bars, stacked/nested combined styles, five accents, Solid/Glass surfaces, 35–100% opacity (full on hover).
- Placement: free (snaps to edges and top centre), top pins, left/right vertical pins that slide along their edge, and an optional collapsible side tab.
- Tray meter or rings for 5-hour (top/outer) and weekly (bottom/inner) limits, following the taskbar theme.
- Optional reset countdowns, quick refresh, window-average pace estimates, low-usage alerts at 25%, 10% and 0%, a show/hide shortcut (Ctrl+Shift+K or Ctrl+Alt+K), and launch at startup.
- Local only: no Koodex account and no telemetry.

## Providers

**Codex.** Install the Codex CLI and run `codex login` once. Koodex keeps one `codex app-server` child running while Codex is selected: usage events trigger immediate reads, and polling (down to every 10 seconds) catches other sessions. The child is stopped when you switch to Claude Code.

**Claude Code.** Run `claude` once and log in with a Pro or Max account. Koodex reads the OAuth sign-in Claude Code stores in `~/.claude/.credentials.json` (or `CLAUDE_CONFIG_DIR`) and asks `api.anthropic.com` for your 5-hour and weekly utilisation (plus Opus/Sonnet weekly limits once used). The token is sent only to Anthropic. When the saved access token has expired, which happens if you mostly use the desktop app, Koodex renews it the way Claude Code does and writes the renewed token back so Claude Code stays signed in. It checks at most every 30 seconds and backs off if rate limited. The endpoint is the one Claude Code itself uses, not a documented public API, so a future Claude Code release could change it.

Cursor is not supported: its documented usage API is hourly team data, not live personal limits.

## Resource use

Koodex 2 creates web views only while they are visible. Hidden windows are destroyed after a second, so tray-only mode runs no browser engine at all.

| Windows 10, same machine and settings | Koodex 1.8 (Electron) | Koodex 2.0 (Tauri) |
| --- | --- | --- |
| Tray only, private memory | ~90 MB | **3.3 MB** (no web view running) |
| Pill visible, private memory (incl. WebView2) | ~201 MB | **~103 MB** |
| Installer | ~103 MB | **1.6 MB** |

WebView2 runs with software rendering, background services and extensions disabled, and a single renderer process. Numbers exclude the separate Codex CLI child, which both versions use (about 40 MB). Measure your own with `npm run memory` while Koodex runs.

## Development

Requirements: Node.js 22+, Rust (stable, MSVC), and the Visual Studio C++ build tools.

```powershell
npm install
npm run dev        # Tauri dev build with hot-reloading UI
npm run dev:mock   # sample data in a separate profile; never contacts Codex or Claude
npm test           # TypeScript tests + cargo test
npm run typecheck
```

Mock scenarios: set `$env:KOODEX_MOCK` to `normal`, `low`, `critical`, `single-window`, `offline` or `loading` before `npm run dev:mock`.

Layout:

- `src-tauri/src`: Rust backend. `main.rs` (state, monitors, commands), `codex.rs`, `claude.rs`, `windows.rs`, `tray.rs`, `icon.rs` (tray rasteriser), `geometry.rs`, `settings.rs`, `alerts.rs`, `updates.rs`.
- `src/renderer`: React UI. `bridge.ts` maps `window.Koodex` onto Tauri IPC.
- `src/shared`: types and formatting shared by the UI (`pill.ts` mirrors `geometry.rs`).

## Releasing

```powershell
npm run release
```

This builds `Koodex_<version>_x64-setup.exe` under `src-tauri/target/release/bundle/nsis/` (or `$env:CARGO_TARGET_DIR`) and writes `SHA256SUMS.txt` and `latest.yml` beside it. Upload all three to a GitHub release tagged `v<version>`. `latest.yml` lets Koodex 1.x installs update to 2.x from their own App updates panel. The in-app updater refuses installers that are not listed in `SHA256SUMS.txt`. Installed copies check shortly after launch and every six hours; nothing installs until you choose **Restart and install**. Never replace the files of a published version; release a higher version instead. For signing, see [docs/code-signing.md](docs/code-signing.md).

## Credits

Provider logos come from [Simple Icons](https://simpleicons.org) (CC0). Claude is a trademark of Anthropic; OpenAI and Codex are trademarks of OpenAI. They are used only to identify each provider; Koodex is not affiliated with either company.
