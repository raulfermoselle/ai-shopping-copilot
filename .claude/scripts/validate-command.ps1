# validate-command.ps1
# PreToolUse hook for Bash command validation
# Exit codes:
#   0 = Allow command
#   1 = Error (allow with warning)
#   2 = Block command

$Input = $input | Out-String

try {
    $JsonInput = $Input | ConvertFrom-Json -ErrorAction SilentlyContinue
    $Command = $JsonInput.tool_input.command
} catch {
    $Command = $null
}

# If we couldn't parse the input, allow it
if ([string]::IsNullOrEmpty($Command)) {
    exit 0
}

# Block dangerous operations
$DangerousPatterns = @(
    "rm -rf /",
    "rm -rf /*",
    "git push --force origin main",
    "git push --force origin master",
    "git push -f origin main",
    "git push -f origin master",
    "drop database",
    "DROP DATABASE",
    "truncate table",
    "TRUNCATE TABLE",
    "> /dev/sda",
    "mkfs",
    "dd if=",
    "Remove-Item -Recurse -Force C:\",
    "Remove-Item -Recurse -Force /",
    "Format-Volume"
)

foreach ($pattern in $DangerousPatterns) {
    if ($Command -like "*$pattern*") {
        Write-Error "BLOCKED: Dangerous operation detected: $pattern"
        Write-Error "This command has been blocked for safety. Please confirm manually if needed."
        exit 2
    }
}

# Warn about potentially risky operations
$RiskyPatterns = @(
    "git reset --hard",
    "git clean -fd",
    "git checkout -- .",
    "rm -rf",
    "git push --force",
    "git push -f",
    "Remove-Item -Recurse -Force"
)

foreach ($pattern in $RiskyPatterns) {
    if ($Command -like "*$pattern*") {
        Write-Warning "WARNING: Potentially risky operation: $pattern"
        Write-Warning "Proceeding with caution."
        exit 0
    }
}

# Warn about uncommitted changes before checkout
if ($Command -match 'git checkout|git switch') {
    try {
        $Uncommitted = (git status --porcelain 2>$null | Measure-Object -Line).Lines
        if ($Uncommitted -gt 0) {
            Write-Warning "WARNING: $Uncommitted uncommitted changes detected."
            Write-Warning "Consider committing or stashing before switching branches."
        }
    } catch {}
}

# All checks passed
exit 0
