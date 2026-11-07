; Koodex 2 replaces the Electron-based 1.x releases. Remove the old per-user
; installation quietly so Windows does not keep two copies (preferences live in
; %APPDATA%\Koodex and are preserved by the old uninstaller).
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$LOCALAPPDATA\Programs\koodex\Uninstall Koodex.exe" 0 +3
    nsExec::Exec 'taskkill /F /IM "Koodex.exe" /FI "MODULES eq ffmpeg.dll"'
    ExecWait '"$LOCALAPPDATA\Programs\koodex\Uninstall Koodex.exe" /S --updated'
!macroend
