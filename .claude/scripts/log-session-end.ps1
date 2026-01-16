# log-session-end.ps1
# SubagentStop hook for sprint-executor agent
# Logs the end of an execution session

$SessionsDir = "Sprints/Logs/sessions"
$Date = Get-Date -Format "yyyy-MM-dd"
$Time = Get-Date -Format "HH:mm:ss"

try {
    $Branch = git branch --show-current 2>$null
    if ([string]::IsNullOrEmpty($Branch)) { $Branch = "unknown" }
} catch {
    $Branch = "unknown"
}

# Get short branch name
$BranchShort = ($Branch -split '/')[-1]
if ($BranchShort.Length -gt 20) { $BranchShort = $BranchShort.Substring(0, 20) }

# Find the most recent session file for today and this branch
$SessionFile = Get-ChildItem -Path "$SessionsDir/$Date-$BranchShort-*.md" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($SessionFile -and (Test-Path $SessionFile.FullName)) {
    # Append session end marker
    $EndContent = @"

---

## Session End
**Ended**: ${Date}T${Time}
**Status**: Completed

<!-- End of session log -->
"@
    Add-Content -Path $SessionFile.FullName -Value $EndContent -Encoding UTF8
    Write-Host "Session ended. Log updated: $($SessionFile.FullName)"
} else {
    Write-Host "Warning: Could not find session log file to update"
}
