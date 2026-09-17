# Koodex

Build a production-ready Windows desktop utility called **Koodex**.

Koodex is a tiny, quiet system utility that lets users see their current Codex usage limits without repeatedly running `/status`.

The defining product principle is:

> **Glance at it for two seconds, understand your usage, then get back to work.**

Do not build a dashboard.

Do not add unnecessary features.

Do not make the UI visually loud.

---

# 1. Product Goal

Build a Windows utility that displays:

- current 5-hour Codex usage
- current weekly Codex usage
- percentage remaining
- reset countdown/time
- connection/sync state

The application should primarily live in the Windows system tray.

The user should rarely need to open a normal application window.

The main experience should feel similar in spirit to the iPhone Dynamic Island:

- compact
- glanceable
- smooth
- contextual
- easy to hide
- unobtrusive

---

# 2. Target Platform

Primary platform:

**Windows 11**

Development environment:

- Windows
- Node.js
- npm
- Codex CLI already installed and authenticated

The finished app should build into an installable or portable Windows executable.

---

# 3. Technology Stack

Use:

- Electron
- React
- TypeScript
- Vite
- electron-builder

Prefer simple, reliable dependencies.

Do not introduce:

- large UI frameworks
- unnecessary state-management libraries
- unnecessary backend servers
- databases
- cloud services

Use plain React state/context where appropriate.

CSS may use:

- CSS Modules
- plain CSS
- Tailwind only if it genuinely simplifies implementation

Prefer plain CSS or CSS Modules for this small project.

---

# 4. Architecture

Use this high-level architecture:

```text
Koodex
│
├── Electron Main Process
│   ├── system tray
│   ├── compact pill window
│   ├── expanded popover window
│   ├── Codex App Server process
│   ├── JSON-RPC communication
│   ├── startup handling
│   ├── settings persistence
│   └── notifications
│
├── Preload
│   └── secure IPC bridge
│
└── React Renderer
    ├── compact pill
    ├── expanded usage view
    ├── settings
    └── animations
```

Electron security requirements:

- `contextIsolation: true`
- `nodeIntegration: false`
- communicate through preload
- expose only narrowly scoped IPC methods

Do not expose arbitrary filesystem or process access to the renderer.

---

# 5. Codex Usage Data

Do NOT:

- scrape terminal text visually
- automate `/status`
- read terminal pixels
- require the user to manually paste usage values
- collect OpenAI passwords or credentials

Use the currently supported local Codex App Server / protocol instead.

Before implementation, inspect the locally installed Codex version and its supported App Server API.

Use the supported rate-limit method for the installed version. If available, this may resemble:

```text
account/rateLimits/read
```

and a corresponding rate-limit update event.

Do not blindly assume protocol fields.

Inspect the actual response schema and build a typed adapter around it.

The adapter should normalize data into this internal interface:

```ts
export interface UsageWindow {
  id: 'five-hour' | 'weekly' | string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetsAt: number | null;
  windowMinutes: number | null;
}

export interface CodexUsage {
  windows: UsageWindow[];
  planType?: string;
  credits?: number | null;
  fetchedAt: number;
}
```

If the App Server reports used percentage rather than remaining percentage:

```ts
remainingPercent = 100 - usedPercent;
```

Clamp values between 0 and 100.

---

# 6. Codex Server Manager

Create a dedicated module:

```text
src/main/codex/
```

Suggested files:

```text
codex/
├── CodexServer.ts
├── CodexRpcClient.ts
├── usageAdapter.ts
├── types.ts
└── errors.ts
```

`CodexServer` should:

1. locate the installed Codex CLI
2. start its App Server using stdio
3. maintain the child process
4. initialize the protocol correctly
5. send JSON-RPC requests
6. receive responses
7. receive notifications/events
8. detect unexpected process termination
9. restart gracefully when appropriate
10. shut down cleanly when Koodex quits

Never spawn a new Codex process every few seconds.

Maintain one controlled connection when practical.

---

# 7. Usage Refresh Strategy

Prefer event-driven updates if the Codex App Server supports rate-limit update notifications.

Also implement periodic refresh as a fallback.

Default refresh interval:

**60 seconds**

User-selectable values:

- 30 seconds
- 1 minute
- 5 minutes

Keep the previous successful value visible during refresh.

Never blank the UI just because an update is happening.

If the connection fails:

- keep the previous successful usage values
- show a small disconnected/stale indicator
- retry automatically
- do not spam notifications

---

# 8. Product States

The application has four primary states:

## State A — Tray Only

Normally the application is effectively invisible.

Only the tray icon remains.

No normal taskbar window.

---

## State B — Compact Pill

A tiny floating pill inspired by Dynamic Island.

Example:

```text
╭──────────────────────╮
│  ◔   5h · 68% left   │
╰──────────────────────╯
```

Or:

```text
╭──────────────────────────╮
│  ◔   Weekly · 42% left   │
╰──────────────────────────╯
```

Keep the pill approximately:

```text
width: 150–210px
height: 38–44px
```

Do not make it unnecessarily large.

---

## State C — Expanded Popover

Clicking the tray icon or compact pill opens:

```text
╭────────────────────────────────╮
│ Koodex                     ···│
│ ● Synced just now              │
│                                │
│ 5-hour                     68%  │
│ █████████████████░░░░░         │
│ Resets in 2h 18m               │
│                                │
│ Weekly                     42%  │
│ ██████████░░░░░░░░░░░         │
│ Resets in 3d 14h               │
│                                │
│ Updated just now           ↻   │
╰────────────────────────────────╯
```

Target approximate dimensions:

```text
320px wide
220–290px tall
```

Height should adapt to content.

Do not leave empty areas for unavailable usage windows.

---

## State D — Settings

A small settings screen/menu.

Only include:

```text
Launch at startup        [toggle]

Low usage alerts         [toggle]

Refresh interval         >
1 minute

About

Quit Koodex
```

Do not build a full settings dashboard.

---

# 9. Compact Pill Alternation

If both 5-hour and weekly limits are available, alternate between them.

Default interval:

**3 seconds**

Sequence:

```text
5h · 68% left
     ↓
Weekly · 42% left
     ↓
5h · 68% left
```

Animate the transition.

Use something subtle like:

- 4–8 px vertical movement
- opacity crossfade
- 160–220 ms duration

Do not use:

- bouncing
- spinning
- large sliding animations
- flashy effects

---

# 10. Priority Logic

When both usage windows exist, determine the initial one intelligently.

Prioritize the more urgent quota.

Use:

```ts
function getPriority(window: UsageWindow) {
  return window.remainingPercent ?? 100;
}
```

The lower remaining percentage should appear first.

Example:

```text
5h = 82% remaining
weekly = 31% remaining
```

Show:

```text
Weekly · 31% left
```

first.

Still alternate between both afterward.

---

# 11. Hover Behavior

Hovering over the tray icon should provide a useful native tooltip.

Example:

```text
Koodex
5h: 68% left
Weekly: 42% left
```

If reset information fits comfortably:

```text
Koodex · 5h 68% · Weekly 42%
```

Keep it concise.

---

# 12. Expanded Interaction

Expected interaction:

```text
click tray icon
      ↓
popover opens near tray
      ↓
user reads usage
      ↓
click elsewhere
      ↓
popover disappears
```

Also close it when:

- Escape is pressed
- another application receives focus
- user clicks the tray icon again

Do not terminate Koodex when the popover closes.

---

# 13. Optional Floating Pill

Create the architecture so a persistent floating pill can be enabled later.

For MVP, provide an optional setting:

```text
Show floating usage pill
```

When enabled:

- show the compact pill
- default near the bottom-right of the primary monitor
- place it above the taskbar
- allow dragging
- remember its position
- never steal focus when appearing

Right-click or settings should allow hiding it.

When disabled:

- tray-only experience remains

The tray icon must always remain available.

---

# 14. Window Behavior

All utility windows should be:

- frameless
- non-maximizable
- non-resizable unless necessary
- hidden from taskbar
- compact
- rounded visually
- positioned intelligently around the tray/taskbar

Handle:

- display scaling
- multiple monitors
- taskbar position
- screen edges

Ensure the window remains fully visible.

---

# 15. Visual Language

Overall style:

**quiet, premium, minimal system utility**

References in spirit:

- Dynamic Island
- Linear
- Raycast
- Arc
- modern Windows 11 utilities

Do not directly copy any brand.

---

# 16. Color System

Dark theme first.

Use approximately:

```css
--background: #101112;
--surface: #171819;
--surface-hover: #1d1e20;

--text-primary: #f5f5f5;
--text-secondary: #96999e;
--text-muted: #6f7378;

--border: rgba(255,255,255,0.08);

--track: rgba(255,255,255,0.10);
--progress: #eeeeee;
```

Status accents:

```text
> 25% left:
neutral or subtle green

10–25%:
amber

< 10%:
red
```

Do not color the entire interface.

Only color:

- small status indicator
- progress accent
- percentage if necessary

---

# 17. Typography

Use the native system font stack.

For Windows:

```css
font-family:
  Inter,
  "Segoe UI Variable",
  "Segoe UI",
  system-ui,
  sans-serif;
```

Do not require downloading fonts.

Typography hierarchy:

```text
Main percentage:
22–28px semibold

Quota label:
13–14px medium

Secondary information:
12–13px regular

Tiny metadata:
11–12px
```

Avoid giant text.

---

# 18. Spacing

Follow a restrained spacing scale:

```text
4
8
12
16
20
24
```

Prefer:

```text
16px outer padding
12–16px section gaps
8px element gaps
```

The interface should feel compact but not cramped.

---

# 19. Progress Indicator

Compact pill:

Use a small circular usage ring around approximately:

```text
18–22px
```

The ring represents remaining usage.

Example:

```text
◔  68%
```

Do not put numbers inside the ring.

The number should remain textual.

Expanded view:

Use thin horizontal progress bars:

```text
height: 6px
border-radius: 999px
```

No gradient.

---

# 20. Reset Formatting

Create a reusable formatter.

Examples:

```text
28 minutes
2h 18m
1d 6h
3d 14h
```

Expanded UI wording:

```text
Resets in 2h 18m
```

If the reset is very close:

```text
Resets in 8m
```

If reset time is unknown:

do not invent one.

Simply hide the reset row or show:

```text
Reset time unavailable
```

---

# 21. Sync Status

Possible states:

```ts
type SyncState =
  | 'connecting'
  | 'synced'
  | 'refreshing'
  | 'stale'
  | 'offline'
  | 'error';
```

UI examples:

```text
● Synced just now

● Updating…

○ Last updated 4m ago

○ Codex unavailable
```

Keep these visually subtle.

---

# 22. Error States

Handle these gracefully:

## Codex CLI not installed

Display:

```text
Codex not found

Install or configure the Codex CLI to
start showing usage.
```

---

## User not logged in

Display:

```text
Sign in to Codex first
```

Provide a short explanation.

Do not request credentials inside Koodex.

---

## App Server unavailable

Display:

```text
Unable to read Codex usage

Retry
```

Keep retry automatic as well.

---

## Network issue

Keep cached information.

Show:

```text
Last updated 8m ago
```

instead of removing values.

---

# 23. Caching

Persist the last successful usage state locally.

Store:

```ts
{
  usage,
  fetchedAt
}
```

On application launch:

1. immediately load cached usage
2. render it
3. mark it as stale if needed
4. connect to Codex
5. replace with live information

This prevents a blank startup screen.

---

# 24. Settings Persistence

Persist locally:

```ts
interface Settings {
  launchAtStartup: boolean;
  notificationsEnabled: boolean;
  refreshIntervalSeconds: 30 | 60 | 300;
  floatingPillEnabled: boolean;
  pillPosition?: {
    x: number;
    y: number;
  };
}
```

Use an established lightweight Electron settings solution or a simple JSON-backed configuration.

Do not use a database.

---

# 25. Startup

Implement:

```text
Launch Koodex when Windows starts
```

Use the proper Electron mechanism.

If startup is enabled:

- launch silently
- do not display the expanded window
- initialize tray
- connect in background

---

# 26. Notifications

Notifications are OFF by default.

If enabled, notify at:

```text
25% remaining
10% remaining
5% remaining
```

Avoid duplicates.

Track which thresholds have already generated alerts for the current reset cycle.

Example notification:

```text
Koodex

Your 5-hour Codex limit has 10% remaining.
Resets in 38 minutes.
```

No motivational language.

No unnecessary alerts.

---

# 27. Tray Menu

Right-click tray icon:

```text
Koodex

5h: 68% left
Weekly: 42% left

Open
Refresh

Launch at startup    ✓
Show floating pill   ✓

Settings

Quit
```

Keep it native and simple.

---

# 28. Tray Icon

Create a clean monochrome tray icon.

Prefer a circular usage ring.

Requirements:

- readable at 16×16
- readable at 20×20
- compatible with dark/light Windows taskbars
- no tiny text
- simple silhouette

If dynamically rendering quota progress into the tray icon is stable, implement it.

Otherwise use a clean static Koodex icon and rely on tooltip values.

Do not sacrifice reliability just to make the tray icon animated.

---

# 29. Animations

Animations should only communicate state.

Use:

```text
150–220 ms
ease-out
```

Animate:

- compact metric transitions
- popover appearing
- settings transitions
- progress changes

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

Disable nonessential animation in reduced-motion mode.

---

# 30. Accessibility

Support:

- keyboard navigation
- Escape to dismiss
- visible focus states
- semantic buttons
- appropriate ARIA labels
- sufficient text contrast
- reduced motion
- minimum reasonable hit targets

Do not make tiny visual elements impossible to click.

---

# 31. Project Structure

Create approximately:

```text
Koodex/
│
├── src/
│   ├── main/
│   │   ├── main.ts
│   │   ├── tray.ts
│   │   ├── windows.ts
│   │   ├── positioning.ts
│   │   ├── startup.ts
│   │   ├── notifications.ts
│   │   ├── settings.ts
│   │   │
│   │   └── codex/
│   │       ├── CodexServer.ts
│   │       ├── CodexRpcClient.ts
│   │       ├── usageAdapter.ts
│   │       ├── types.ts
│   │       └── errors.ts
│   │
│   ├── preload/
│   │   └── preload.ts
│   │
│   └── renderer/
│       ├── App.tsx
│       ├── main.tsx
│       │
│       ├── components/
│       │   ├── CompactPill.tsx
│       │   ├── UsageRing.tsx
│       │   ├── UsageBar.tsx
│       │   ├── UsageWindow.tsx
│       │   ├── ExpandedPopover.tsx
│       │   ├── SyncStatus.tsx
│       │   └── SettingsView.tsx
│       │
│       ├── hooks/
│       │   ├── useUsage.ts
│       │   └── useAlternatingMetric.ts
│       │
│       ├── styles/
│       │   ├── globals.css
│       │   └── tokens.css
│       │
│       └── types/
│           └── ipc.ts
│
├── assets/
│   ├── tray/
│   └── icons/
│
├── tests/
│
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── README.md
└── LICENSE
```

Adjust if technically necessary, but maintain clean separation.

---

# 32. IPC Contract

Expose narrow APIs such as:

```ts
window.Koodex.getUsage()

window.Koodex.refreshUsage()

window.Koodex.onUsageUpdated(callback)

window.Koodex.getSettings()

window.Koodex.updateSettings(settings)

window.Koodex.openSettings()

window.Koodex.hidePopover()

window.Koodex.quit()
```

Do not expose:

```text
exec
spawn
filesystem
shell
```

directly to the renderer.

---

# 33. Usage Hook

Create something similar to:

```ts
const {
  usage,
  syncState,
  refresh,
  lastUpdated
} = useUsage();
```

React components should not know JSON-RPC details.

Keep transport logic outside the UI.

---

# 34. Alternation Hook

Implement:

```ts
useAlternatingMetric(windows, 3000)
```

Requirements:

- one window → never alternate
- two or more → rotate
- most urgent starts first
- pause or reduce unnecessary switching when expanded
- clean timer on unmount
- avoid unnecessary rerenders

---

# 35. Testing

Add tests for business logic.

At minimum test:

### Remaining percentage

```text
used = 32
remaining = 68
```

### Clamping

```text
used = -3 → remaining 100
used = 104 → remaining 0
```

### Quota priority

```text
5h = 72%
weekly = 28%

weekly should be initial display
```

### Reset formatter

Verify:

```text
45m
2h 15m
1d 4h
```

### Missing windows

The UI must work with:

```text
only weekly
```

and:

```text
only 5-hour
```

---

# 36. Development Mock Mode

Implement mock data mode so UI development does not depend on consuming or connecting to real Codex usage.

Example:

```bash
npm run dev:mock
```

Mock scenarios:

```text
normal
low
critical
single-window
offline
loading
```

Example normal:

```ts
{
  windows: [
    {
      id: 'five-hour',
      label: '5-hour',
      remainingPercent: 68,
      resetsAt: ...
    },
    {
      id: 'weekly',
      label: 'Weekly',
      remainingPercent: 42,
      resetsAt: ...
    }
  ]
}
```

---

# 37. Build Commands

Provide working commands:

```bash
npm install

npm run dev

npm run dev:mock

npm run build

npm run dist
```

`npm run dist` should produce the Windows build.

---

# 38. Packaging

Use electron-builder.

Produce preferably:

```text
Koodex Setup.exe
```

and, if straightforward:

```text
Koodex Portable.exe
```

Configure:

- app name
- icons
- Windows metadata
- version
- installer
- uninstall behavior

Do not require administrator privileges unless truly necessary.

---

# 39. README

Create a polished README containing:

## Koodex

One-line description.

### Features

Short feature list.

### Screenshot

Placeholder path is fine initially.

### Requirements

Mention:

- Windows
- Codex CLI
- authenticated Codex installation

### Development

Exact commands.

### Building

Exact commands.

### How it works

Briefly explain the Codex App Server integration.

### Privacy

State that:

- usage data is read locally from Codex
- Koodex does not require users to submit their OpenAI password
- Koodex does not operate its own remote backend

Only make privacy claims that are actually true based on the implementation.

---

# 40. Product Restraint

This requirement is extremely important.

Do NOT add:

- token graphs
- historical analytics
- account dashboards
- productivity scores
- AI recommendations
- usage leaderboards
- account profile cards
- unnecessary charts
- giant settings pages
- login system
- cloud sync
- telemetry by default
- advertisements
- social features

This is a small utility.

If a feature does not help answer:

> “How much Codex do I have left?”

it probably does not belong in V1.

---

# 41. Desired Finished Experience

When Windows starts:

```text
Koodex starts quietly
       ↓
tray icon appears
       ↓
usage loads
```

User is coding.

They wonder about Codex usage.

They click the tray icon.

Within one glance they see:

```text
5-hour
68% left
Resets in 2h 18m

Weekly
42% left
Resets in 3d 14h
```

They click VS Code again.

Koodex disappears.

They continue working.

That is the product.

---

# 42. Implementation Order

Work in this order.

## Phase 1 — Scaffold

Create:

- Electron
- Vite
- React
- TypeScript
- preload
- build configuration

Verify the app launches.

---

## Phase 2 — Tray

Implement:

- tray icon
- hidden taskbar behavior
- click handler
- right-click menu
- quit

Verify tray behavior before continuing.

---

## Phase 3 — Mock UI

Using mock usage data, implement:

- compact pill
- expanded popover
- usage bars
- reset countdown
- alternation
- settings

Polish the UI before integrating live data.

---

## Phase 4 — Codex Integration

Inspect the installed Codex protocol.

Implement:

- App Server startup
- JSON-RPC client
- initialization
- rate-limit request
- rate-limit updates if available
- adapter

Map live data into the existing UI model.

Do not restructure the UI around raw Codex responses.

---

## Phase 5 — Reliability

Implement:

- reconnect
- cached data
- stale state
- server shutdown
- failure handling
- missing quota windows

---

## Phase 6 — Windows Integration

Implement:

- launch at startup
- notifications
- positioning
- multiple displays
- optional floating pill

---

## Phase 7 — Packaging

Create:

- app icon
- installer
- portable build if practical
- README

---

## Phase 8 — Final Polish

Review:

- spacing
- animations
- typography
- click targets
- popup behavior
- CPU usage
- memory leaks
- timers
- process cleanup

Remove anything that feels unnecessary.

---

# 43. Definition of Done

The MVP is complete when all of the following work:

- Koodex runs on Windows
- tray icon appears
- app does not clutter the taskbar
- current Codex usage is retrieved automatically
- 5-hour limit displays when available
- weekly limit displays when available
- remaining percentage is correct
- reset time is displayed
- compact mode alternates between limits
- expanded view shows both limits
- clicking away closes the popover
- Escape closes the popover
- refresh works
- temporary connection failures do not destroy cached values
- launch-at-startup works
- settings persist
- the app can be packaged into a Windows executable
- Koodex cleanly terminates its child processes on exit

---

# 44. Coding Instructions

Do not just explain what should be built.

Actually create the files and implement it.

As you work:

1. inspect the existing repository first
2. do not overwrite useful existing work unnecessarily
3. implement one phase at a time
4. run the project after significant changes
5. fix TypeScript errors immediately
6. run lint/tests where available
7. verify Electron process cleanup
8. verify the packaged build
9. keep the UI aligned with the minimal design requirements

When there is uncertainty about the Codex App Server protocol, inspect the installed/current implementation instead of inventing API behavior.

Prefer a smaller reliable implementation over unnecessary complexity.

The final result should feel like a **native little Windows utility**, not a web page inside a desktop shell.