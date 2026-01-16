# validate-sprint-state.ps1
# Validates sprint state consistency
# Can be used as a PreToolUse hook or standalone

$StateFile = "Sprints/.sprint-state.local"
$MasterSprint = "Sprints/MASTER-SPRINT.md"

# Check if we're in a Sprint Management project
if (-not (Test-Path "Sprints")) {
    Write-Host "Not a Sprint Management project (no Sprints directory)"
    exit 0
}

# Get current branch
try {
    $CurrentBranch = git branch --show-current 2>$null
    if ([string]::IsNullOrEmpty($CurrentBranch)) {
        Write-Host "WARNING: Could not determine current git branch"
        exit 0
    }
} catch {
    Write-Host "WARNING: Could not determine current git branch"
    exit 0
}

# Check local state file
if (Test-Path $StateFile) {
    $StateContent = Get-Content $StateFile -Raw
    $StateBranch = ($StateContent | Select-String -Pattern "^branch:\s*(.+)$" -AllMatches).Matches.Groups[1].Value.Trim()

    if ($StateBranch -ne $CurrentBranch) {
        Write-Host "WARNING: Branch mismatch detected"
        Write-Host "  Local state branch: $StateBranch"
        Write-Host "  Current git branch: $CurrentBranch"
        Write-Host "Consider running context recovery to update state."
    }

    # Check deadlock counter
    $DeadlockMatch = ($StateContent | Select-String -Pattern "^deadlock_counter:\s*(\d+)$" -AllMatches)
    if ($DeadlockMatch.Matches.Count -gt 0) {
        $Deadlock = [int]$DeadlockMatch.Matches.Groups[1].Value
        if ($Deadlock -ge 3) {
            Write-Host "WARNING: High deadlock counter ($Deadlock)"
            Write-Host "Review EXCEPTIONS-LOG.md for blocked tasks."
        }
    }
} else {
    Write-Host "INFO: No local state file found. First session or needs context recovery."
}

# Check MASTER-SPRINT.md exists
if (-not (Test-Path $MasterSprint)) {
    Write-Host "WARNING: MASTER-SPRINT.md not found"
    Write-Host "Sprint Management may not be properly initialized."
}

exit 0
