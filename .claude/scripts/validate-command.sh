#!/bin/bash
# validate-command.sh
# PreToolUse hook for Bash command validation
# Exit codes:
#   0 = Allow command
#   1 = Error (allow with warning)
#   2 = Block command

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# If we couldn't parse the input, allow it
if [ -z "$COMMAND" ]; then
    exit 0
fi

# Block dangerous operations
DANGEROUS_PATTERNS=(
    "rm -rf /"
    "rm -rf /*"
    "git push --force origin main"
    "git push --force origin master"
    "git push -f origin main"
    "git push -f origin master"
    "drop database"
    "DROP DATABASE"
    "truncate table"
    "TRUNCATE TABLE"
    "> /dev/sda"
    "mkfs"
    "dd if="
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qF "$pattern"; then
        echo "BLOCKED: Dangerous operation detected: $pattern" >&2
        echo "This command has been blocked for safety. Please confirm manually if needed." >&2
        exit 2
    fi
done

# Warn about potentially risky operations
RISKY_PATTERNS=(
    "git reset --hard"
    "git clean -fd"
    "git checkout -- ."
    "rm -rf"
    "git push --force"
    "git push -f"
)

for pattern in "${RISKY_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qF "$pattern"; then
        echo "WARNING: Potentially risky operation: $pattern" >&2
        echo "Proceeding with caution." >&2
        exit 0
    fi
done

# Warn about uncommitted changes before checkout
if echo "$COMMAND" | grep -qE 'git checkout|git switch'; then
    UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
    if [ "$UNCOMMITTED" -gt 0 ]; then
        echo "WARNING: $UNCOMMITTED uncommitted changes detected." >&2
        echo "Consider committing or stashing before switching branches." >&2
    fi
fi

# All checks passed
exit 0
