!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Koodex"
  !define MUI_WELCOMEPAGE_TEXT "Your usage, at a glance.$\r$\n$\r$\nKoodex shows Codex and optional Claude Code usage in your Windows tray and a customizable floating pill.$\r$\n$\r$\nChoose where to install, then personalize your pill with a live preview.$\r$\n$\r$\nMade by cimanesdev. No Koodex account or telemetry."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!define MUI_FINISHPAGE_TITLE "Koodex is ready"
!define MUI_FINISHPAGE_TEXT "Find Koodex in your system tray.$\r$\n$\r$\nOn first launch, choose your pill style, position and provider. Connect using your existing Codex CLI or set up the optional Claude Code bridge in Providers.$\r$\n$\r$\nMade by cimanesdev."
!define MUI_FINISHPAGE_RUN_TEXT "Open Koodex"

!macro customHeader
  BrandingText "Koodex | Made by cimanesdev"
!macroend
