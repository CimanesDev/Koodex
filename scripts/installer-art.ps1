Add-Type -AssemblyName System.Drawing
$buildPath = Join-Path $PSScriptRoot '..\build'
[System.IO.Directory]::CreateDirectory($buildPath) | Out-Null
function New-InstallerArt([string]$Name, [int]$Width, [int]$Height, [bool]$Sidebar) {
  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $background = if ($Sidebar) { [System.Drawing.Color]::FromArgb(19, 22, 25) } else { [System.Drawing.Color]::White }
  $foreground = if ($Sidebar) { [System.Drawing.Color]::FromArgb(240, 243, 245) } else { [System.Drawing.Color]::FromArgb(19, 22, 25) }
  $graphics.Clear($background)
  $brush = New-Object System.Drawing.SolidBrush($foreground)
  $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(151, 164, 175))
  $pen = New-Object System.Drawing.Pen($foreground, 3)
  $font = New-Object System.Drawing.Font('Segoe UI', 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $small = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  if ($Sidebar) {
    $graphics.DrawEllipse($pen, 22, 30, 40, 40)
    $graphics.DrawString('Koodex', $font, $brush, 19, 86)
    $graphics.DrawString("Usage,`nat a glance.", $small, $muted, 20, 121)
    $graphics.FillRectangle($muted, 22, 192, 115, 4)
    $graphics.FillRectangle($muted, 22, 205, 115, 4)
    $graphics.FillRectangle($brush, 22, 192, 79, 4)
    $graphics.FillRectangle($brush, 22, 205, 47, 4)
    $graphics.DrawString("MADE BY`ncimanesdev", $small, $muted, 20, 265)
  } else {
    $graphics.DrawEllipse($pen, 9, 15, 26, 26)
    $graphics.DrawString('Koodex', $font, $brush, 44, 12)
  }
  $bitmap.Save((Join-Path $buildPath ($Name + '.bmp')), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Save((Join-Path $buildPath ($Name + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); $brush.Dispose(); $muted.Dispose(); $pen.Dispose(); $font.Dispose(); $small.Dispose()
}
New-InstallerArt 'installerHeader' 150 57 $false
New-InstallerArt 'installerSidebar' 164 314 $true
