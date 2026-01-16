# log-session-start.ps1
# SubagentStart hook for sprint-executor agent
# Logs the start of an execution session

$SessionsDir = "Sprints/Logs/sessions"
$Date = Get-Date -Format "yyyy-MM-dd"
$Time = Get-Date -Format "HH:mm:ss"

try {
    $Branch = git branch --show-current 2>$null
    if ([string]::IsNullOrEmpty($Branch)) { $Branch = "unknown" }
} catch {
    $Branch = "unknown"
}

# Get short branch name (last segment, max 20 chars)
$BranchShort = ($Branch -split '/')[-1]
if ($BranchShort.Length -gt 20) { $BranchShort = $BranchShort.Substring(0, 20) }

# Generate random session ID
$SessionId = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })

# Create sessions directory if it doesn't exist
if (-not (Test-Path $SessionsDir)) {
    New-Item -ItemType Directory -Path $SessionsDir -Force | Out-Null
}

# Create session log file
$SessionFile = "$SessionsDir/$Date-$BranchShort-$SessionId.md"

$SessionContent = @"
# Session Log: $Date-$BranchShort-$SessionId

**Branch**: $Branch
**Started**: ${Date}T${Time}
**Agent**: sprint-executor

## Session Start
Autonomous execution session initiated.

## Tasks Worked On
<!-- Tasks will be logged here -->

## Decisions Made
<!-- Autonomous decisions will be logged here -->

## Files Modified
<!-- Modified files will be tracked here -->

## Notes for Next Session
<!-- Important context for continuation -->
"@

Set-Content -Path $SessionFile -Value $SessionContent -Encoding UTF8

# Output session ID for reference
Write-Host "Session started: $SessionId"
Write-Host "Log file: $SessionFile"
