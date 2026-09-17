# Koodex

A quiet Windows tray companion for Codex and optional Claude Code quota reports.

## Features

- Codex usage events and configurable polling down to 10 seconds; remaining percentages and reset countdowns.
- Click the floating pill to switch quotas, or show both side by side.
- Optional countdowns and a one-click refresh button on the pill.
- Ring or bar indicators, five accent colors, and a unified hover surface.
- A simple ring logo. Dual tray bars (top: 5-hour, bottom: weekly) or concentric rings (outer: 5-hour, inner: weekly).
- Indicator-only pills, combined or separate indicators, optional drag grip, and top/side screen pins.
- Optional Claude Code status-line bridge with local change detection and explicit report freshness.
- Separate preferences window with an interactive, exact-size pill preview.
- First-run setup, local caching, automatic reconnect, and optional startup and alerts.

![Koodex preferences](assets/screenshots/preferences-appearance.png)

![Pill with reset countdowns and quick refresh](assets/screenshots/pill-reset-refresh.png)

## Getting started

Run the installer or portable executable. On first launch, choose your preferences in the welcome screen, try the preview, and click **Start Koodex**. The preview uses clearly labeled sample values and never refreshes your real account.

Click the tray icon for usage details. Right-click the floating pill for **Settings** or **Usage details**. Settings has its own window; **Done**, Close, and Escape dismiss it without opening usage details. It stays open when another app gets focus. The usage popup still dismisses on click-away.

In settings:

- **Floating pill:** choose one or both limits, separate or combined indicators, text or indicator-only, click-only or automatic switching, countdowns, and quick refresh.
- **Appearance:** choose progress style, accent, and tray icon.
- **Placement:** pin top left/center/right or vertically on either side; hide the grip to lock a free position. Preview updates immediately.
- **Providers:** choose Codex or prepare the optional Claude Code bridge. One provider is displayed at a time.
- **General:** configure startup, low-usage alerts, and background refresh frequency.

One-limit mode is **click-only by default**. Automatic cycling starts only if you choose an interval. Upgrading from 1.0/1.1 turns off the old implicit auto-switch once; subsequent explicit choices are preserved. Existing users keep their other preferences and skip the welcome screen.

Quick refresh requests a Codex snapshot or rereads the last Claude report. It cannot reset a quota. Tray bars and rings show both limits independently, rounded to 10% steps; the tooltip shows exact reported percentages. Top/outer always means 5-hour, bottom/inner means weekly, even when the other quota is absent. The static mark is a simple ring.

For faster Codex updates, select **General > Refresh interval > Live · every 10 seconds**. New installs default to this; upgrades preserve the saved interval. Usage events trigger immediate reads, but server reporting may lag. This is near-real-time, not a guarantee of token-by-token updates.

## Claude Code and other providers

In **Providers**, select **Claude Code (bridge)** and click **Prepare Claude bridge**. This copies a small script into Koodex's user-data folder and displays a JSON configuration entry. Merge the `statusLine` entry into `~/.claude/settings.json`. Back up an existing status line before replacing it; Koodex never edits Claude's configuration automatically. Node.js must be on PATH. Run a Claude Code session with a supported Pro/Max account and complete a response to receive quota data.

The bridge follows Claude's [documented status-line rate-limit fields](https://code.claude.com/docs/en/statusline), whose current example requires Claude Code 2.1.251+. It saves only five-hour/seven-day percentages, reset timestamps, and local receipt time. It does not save prompts, session IDs, transcripts, paths, or credentials. Koodex detects changed reports within about half a second, marks reports stale after approximately a minute or when a reported reset expires, and keeps the original timestamp when you refresh. An idle or unsupported Claude session cannot supply fresh account usage. Missing quota fields remain unavailable. The bridge represents the latest reporting session; it is not a multi-account aggregator. Remove the `statusLine` entry to disconnect it.

Claude support has been validated with documented sample payloads and real Electron/file integration, not a live Claude subscription in this environment. The installed Claude CLI here is older than the version required by the current example.

Cursor and other providers are not implemented in this release. Cursor's documented [team usage endpoints](https://cursor.com/docs/account/teams/admin-api) aggregate hourly and recommend at most hourly polling, so they do not establish a live personal-quota integration. No private endpoints or browser credentials are used.

## Requirements

- Windows 11, x64.
- For Codex: Codex CLI installed and signed in with an account that reports usage limits. Run `codex login` separately; API-key accounts may not report subscription quotas.
- For Claude: supported Claude Code, a Pro/Max account with quota data, and Node.js on PATH for the optional bridge.
- Node.js 22.12+ and npm for development.

Koodex locates `codex.exe` on PATH or the native executable in the standard global npm installation, including `%APPDATA%\npm`. If installed elsewhere, add the native executable's directory to PATH and restart Koodex.

## Development

```powershell
npm install
npm run dev
npm run dev:mock
```

Vite updates renderer changes; restart the command after main/preload changes. Mock mode uses a separate configuration directory and never connects to Codex:

```powershell
$env:KOODEX_MOCK = 'critical'
npm run dev:mock
Remove-Item Env:KOODEX_MOCK
```

Scenarios: `normal`, `low`, `critical`, `single-window` (weekly only), `offline` (cached), and `loading`. Startup registration is available only in packaged builds.

## Building

```powershell
npm run build
npm run dist
```

Version 1.3 outputs in `release/1.3.0/`:

- `Koodex-1.3.0-x64-nsis.exe` - per-user installer, no administrator privileges required.
- `Koodex-1.3.0-x64-portable.exe` - standalone launcher.
- `win-unpacked/Koodex.exe` - unpacked app (keep its adjacent files).

Quit an older running Koodex before starting the new version. Builds are unsigned unless electron-builder signing is configured. Uninstall preserves preferences and cached usage. Keep the portable launcher at a stable path if enabling startup. Normal Windows startup is silent after setup.

The icon source is `assets/icons/koodex.svg`. `node scripts/icons.mjs` regenerates the PNG/ICO assets and tray icon variants from their matching geometry.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run test:scenarios
npm run test:customization
npm run test:placement
npm run test:customization -- --exe=release/1.3.0/win-unpacked/Koodex.exe
npm run test:live
npm run test:packaged-live
```

UI checks launch real Electron windows with isolated data under `.smoke-data/`. They cover welcome setup, preview isolation, click-only behavior, opt-in automatic switching, countdowns, immediate refresh, unified hover, independent settings dismissal, customization, and persistence after restart. Logic tests cover quota conversion, unknown windows, countdowns, RPC framing, alert deduplication, settings migration, and positioning.

Live checks perform read-only quota requests, submit no model turns, and verify process reuse and shutdown. The packaged check verifies live usage and startup API arguments; it intercepts startup registration to avoid adding the test copy to Windows startup. A Windows sign-out/sign-in cycle, Focus Assist behavior, and physical multi-monitor configurations still need manual acceptance testing on the target machine.

## How it works

The main process maintains one `codex app-server --listen stdio://` child. After initialization it reads `account/rateLimits/read`. Sparse rate-limit and account update notifications trigger a full read. Periodic reads cover activity in other clients. Failures back off from 5 seconds to 5 minutes while keeping previous values visible.

Wire types were inspected using `codex-cli 0.154.0 app-server generate-ts` on September 16, 2026. The adapter prefers the `codex` bucket, falls back to the legacy snapshot, and converts Unix reset seconds to milliseconds. Protocol changes may require adapter updates. See the [official App Server documentation](https://learn.chatgpt.com/docs/app-server).

Renderers are sandboxed with context isolation, Node integration disabled, and a narrow preload API. Navigation and new windows are blocked. Native positions use device-independent work-area coordinates. The visible pill's timer is not background-throttled; hidden windows remain throttled.

## Privacy

Koodex reads usage through your local Codex installation or the optional Claude quota-only bridge. Codex contacts its service using existing authentication. Koodex never asks for provider passwords, does not read or store authentication tokens, operates no remote backend, and includes no telemetry or advertising. Each provider's own configuration governs its behavior.

Preferences, cached usage, and alert deduplication state are JSON files in Electron's user-data directory (`%APPDATA%/Koodex`). Mock mode uses `%APPDATA%/Koodex-mock`. Delete the directory while the app is closed to reset preferences and repeat setup.

## Troubleshooting

- **Codex not found:** install Codex or add its native executable directory to PATH.
- **Sign in to Codex first:** run `codex login`, then refresh.
- **Offline / saved usage:** automatic retries continue; cached reset times need a successful read to confirm recovery.
- **No usage limits available:** the account reported no windows. Koodex does not invent percentages.
- **No window after setup:** look for the usage meter in the tray, including Windows' hidden-icons menu.

## License

MIT. Not affiliated with OpenAI.
