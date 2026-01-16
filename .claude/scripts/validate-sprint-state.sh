#!/bin/bash
# validate-sprint-state.sh
# Validates sprint state consistency
# Can be used as a PreToolUse hook or standalone

STATE_FILE="Sprints/.sprint-state.local"
MASTER_SPRINT="Sprints/MASTER-SPRINT.md"

# Check if we're in a Sprint Management project
if [ ! -d "Sprints" ]; then
    echo "Not a Sprint Management project (no Sprints directory)"
    exit 0
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo "WARNING: Could not determine current git branch"
    exit 0
fi

# Check local state file
if [ -f "$STATE_FILE" ]; then
    STATE_BRANCH=$(grep "^branch:" "$STATE_FILE" | cut -d: -f2 | tr -d ' ')
    
    if [ "$STATE_BRANCH" != "$CURRENT_BRANCH" ]; then
        echo "WARNING: Branch mismatch detected"
        echo "  Local state branch: $STATE_BRANCH"
        echo "  Current git branch: $CURRENT_BRANCH"
        echo "Consider running context recovery to update state."
    fi
    
    # Check deadlock counter
    DEADLOCK=$(grep "^deadlock_counter:" "$STATE_FILE" | cut -d: -f2 | tr -d ' ')
    if [ -n "$DEADLOCK" ] && [ "$DEADLOCK" -ge 3 ]; then
        echo "WARNING: High deadlock counter ($DEADLOCK)"
        echo "Review EXCEPTIONS-LOG.md for blocked tasks."
    fi
else
    echo "INFO: No local state file found. First session or needs context recovery."
fi

# Check MASTER-SPRINT.md exists
if [ ! -f "$MASTER_SPRINT" ]; then
    echo "WARNING: MASTER-SPRINT.md not found"
    echo "Sprint Management may not be properly initialized."
fi

exit 0
