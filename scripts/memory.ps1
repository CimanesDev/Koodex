# Reports private memory for a running Koodex, including its WebView2 helpers.
# Usage: npm run memory   (or: powershell -File scripts/memory.ps1 -Path C:path	oKoodex.exe)
param([string]$ProcessName = "Koodex", [string]$Path = "")

$all = Get-CimInstance Win32_Process
$root = $all | Where-Object { $_.Name -eq "$ProcessName.exe" -and ($Path -eq "" -or $_.ExecutablePath -eq $Path) } | Select-Object -First 1
if (-not $root) { Write-Error "Koodex is not running."; exit 1 }

# Walk the process tree: WebView2 helpers are descendants of the app.
$ids = @($root.ProcessId)
do {
  $children = @($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId })
  if ($children.Count) { $ids += $children.ProcessId }
} while ($children.Count)

$rows = foreach ($id in $ids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p) {
    [pscustomobject]@{
      Process   = $p.ProcessName
      Id        = $p.Id
      PrivateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
      WorkingMB = [math]::Round($p.WorkingSet64 / 1MB, 1)
    }
  }
}
$rows | Sort-Object PrivateMB -Descending | Format-Table -AutoSize
$total = ($rows | Measure-Object PrivateMB -Sum).Sum
"Total private memory: {0:N1} MB across {1} process(es) (Codex CLI child included if running)" -f $total, $rows.Count
