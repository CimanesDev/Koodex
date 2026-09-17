# Koodex 1.4 resource measurements

Measured on Windows on September 17, 2026, using the x64 packaged builds on the same machine. These are observations from one controlled comparison, not minimum requirements or guarantees.

## Memory

`scripts/profile.mjs` starts each build with a fresh, isolated settings directory and the same mock quota data. It waits 2.5 seconds after each interaction and sums `app.getAppMetrics()` private memory across Electron processes. Values below are MiB (1,048,576 bytes). Working-set sums are also recorded by the script, but can double-count shared pages and are not the headline comparison.

| State | 1.3.0 private memory | 1.4.0 private memory | 1.4.0 renderer count |
| --- | ---: | ---: | ---: |
| Tray-only startup | 299.1 MiB | 90.2 MiB | 0 |
| Pill visible | 303.8 MiB | 161.9 MiB | 1 |
| Pill and settings visible | 315.5 MiB | 216.7 MiB | 2 |
| Settings closed | 314.5 MiB | 182.2 MiB | 1 |

1.3.0 retains three renderers in all four states. The resource test additionally closes settings before its initial load finishes, reopens and releases it three times, and verifies zero renderer processes after hiding the pill. Electron can retain main/GPU caches after windows close, so returning to tray-only mode does not guarantee the original cold-start memory level.

The benchmark uses mock data to isolate Koodex's cost; it excludes the separate Codex CLI app-server process. Actual live-provider memory, OS caches, graphics drivers, uptime, and other applications affect totals. CPU and battery improvements were not quantified.

## Package sizes

Sizes below use decimal MB (1,000,000 bytes).

| Artifact | 1.3.0 | 1.4.0 |
| --- | ---: | ---: |
| Installer | 112.60 MB | 102.89 MB |
| Portable launcher | 112.44 MB | 102.73 MB |
| Unpacked application | 395.05 MB | 336.25 MB |
| Application archive (`app.asar`) | 9.52 MB | 0.77 MB |

The installer is 8.6% smaller and the unpacked application is 14.9% smaller. Most remaining bytes are the Electron/Chromium runtime. The build keeps required runtime libraries and licenses, ships the English Chromium locale, and excludes screenshots, debug maps, obsolete icons, and duplicate bundled dependencies. The app's own date/time formatting still follows the system locale through JavaScript's internationalization support.

## Reproduce

```powershell
node scripts/profile.mjs --exe=release/1.3.0/win-unpacked/Koodex.exe --label=1.3.0
npm run test:resources -- --exe=release/1.4.0/win-unpacked/Koodex.exe --label=1.4.0
npm run test:package
```

Profiles are written under `.smoke-data/`. The package audit verifies all required dual tray assets, the Claude bridge, and the single locale, and rejects shipped source maps, screenshots, or duplicate Node dependencies. Existing user settings and running app instances are not used by these tests.
