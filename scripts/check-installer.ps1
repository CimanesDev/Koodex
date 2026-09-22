param([string]$Version = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SetupWindows {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool RedrawWindow(IntPtr h, IntPtr rect, IntPtr region, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
  public struct Rect { public int Left, Top, Right, Bottom; }
  public static string Text(IntPtr h) { var s = new StringBuilder(8192); GetWindowText(h,s,s.Capacity); return s.ToString(); }
  public static IntPtr Find(int pid) { IntPtr found=IntPtr.Zero; EnumWindows((h,p)=>{uint id; GetWindowThreadProcessId(h,out id); if(id==pid && Text(h).Contains("Koodex")) found=h; return true;},IntPtr.Zero); return found; }
  public static IntPtr[] Children(IntPtr parent) { var found=new List<IntPtr>(); EnumChildWindows(parent,(h,p)=>{found.Add(h); return true;},IntPtr.Zero); return found.ToArray(); }
}
'@
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$executable = Join-Path $workspace "release\$Version\Koodex-$Version-x64-nsis.exe"
$screenshots = Join-Path $workspace 'assets\screenshots'
[System.IO.Directory]::CreateDirectory($screenshots) | Out-Null
$installerProcess = Start-Process -FilePath $executable -PassThru -WindowStyle Hidden
function Save-SetupImage([IntPtr]$Handle, [string]$Name) {
  $rect = New-Object SetupWindows+Rect
  [SetupWindows]::GetWindowRect($Handle, [ref]$rect) | Out-Null
  $bitmap = New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left), ($rect.Bottom-$rect.Top))
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $dc = $graphics.GetHdc()
  try { [SetupWindows]::PrintWindow($Handle, $dc, 2) | Out-Null }
  finally { $graphics.ReleaseHdc($dc) }
  $bitmap.Save((Join-Path $screenshots $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
}
try {
  $handle = [IntPtr]::Zero
  for ($attempt=0; $attempt -lt 80 -and $handle -eq [IntPtr]::Zero; $attempt++) {
    Start-Sleep -Milliseconds 250
    $handle = [SetupWindows]::Find($installerProcess.Id)
  }
  if ($handle -eq [IntPtr]::Zero) { throw 'Installer window not found' }
  # Render outside the desktop without taking focus, so native controls can be captured.
  [SetupWindows]::SetWindowPos($handle, [IntPtr]::Zero, -20000, -20000, 0, 0, 0x55) | Out-Null
  [SetupWindows]::RedrawWindow($handle, [IntPtr]::Zero, [IntPtr]::Zero, 0x185) | Out-Null
  Start-Sleep -Milliseconds 750
  $welcome = ([SetupWindows]::Children($handle) | ForEach-Object { [SetupWindows]::Text($_) }) -join "`n"
  if ($welcome -notmatch 'Welcome to Koodex' -or $welcome -notmatch 'cimanesdev') { throw 'Branded welcome text missing' }
  Save-SetupImage $handle 'installer-welcome.png'
  $foundDirectory = $false
  for ($step=0; $step -lt 4; $step++) {
    $controls = [SetupWindows]::Children($handle)
    $text = ($controls | ForEach-Object { [SetupWindows]::Text($_) }) -join "`n"
    if ($text -match 'Choose Install Location') { $foundDirectory = $true; break }
    # Only advance informational wizard pages. Never click Install.
    $next = $controls | Where-Object { [SetupWindows]::Text($_) -match '^(&?Next\s*>?|I &?Agree)$' } | Select-Object -First 1
    if (-not $next) { break }
    [SetupWindows]::PostMessage($handle, 0x0111, [IntPtr]([SetupWindows]::GetDlgCtrlID($next)), $next) | Out-Null
    Start-Sleep -Milliseconds 500
  }
  if (-not $foundDirectory) { Write-Output $text; Save-SetupImage $handle 'installer-check.png'; throw 'Install location page not reached' }
  Save-SetupImage $handle 'installer-location.png'
  Write-Output 'Installer UI passed: branded welcome, creator credit, and location choice. Installation was not started.'
} finally {
  # End only the preview process started by this script, before installation.
  if (-not $installerProcess.HasExited) { $installerProcess.Kill(); $installerProcess.WaitForExit() }
  $installerProcess.Dispose()
}
