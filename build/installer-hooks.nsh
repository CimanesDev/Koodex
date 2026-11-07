; Koodex 2 replaces the Electron-based 1.x releases. Remove the old per-user
; installation quietly so Windows does not keep two copies (preferences live in
; %APPDATA%\Koodex and are preserved by the old uninstaller).
!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$LOCALAPPDATA\Programs\koodex\Uninstall Koodex.exe" 0 +3
    nsExec::Exec 'taskkill /F /IM "Koodex.exe" /FI "MODULES eq ffmpeg.dll"'
    ExecWait '"$LOCALAPPDATA\Programs\koodex\Uninstall Koodex.exe" /S'
!macroend

; Koodex 1.x hands over through electron-updater, which runs this installer
; silently with `--force-run --updated` and expects the app to relaunch.
!macro NSIS_HOOK_POSTINSTALL
  ${If} ${Silent}
    ClearErrors
    ${GetOptions} $CMDLINE "--force-run" $R1
    ${IfNot} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
!macroend
