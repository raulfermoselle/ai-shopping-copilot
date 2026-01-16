#!/bin/bash
# log-session-start.sh
# SubagentStart hook for sprint-executor agent
# Logs the start of an execution session

SESSIONS_DIR="Sprints/Logs/sessions"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BRANCH_SHORT=$(echo "$BRANCH" | sed 's/.*\///' | cut -c1-20)
SESSION_ID=$(cat /dev/urandom | tr -dc 'a-z0-9' | fold -w 6 | head -n 1)

# Create sessions directory if it doesn't exist
mkdir -p "$SESSIONS_DIR"

# Create session log file
SESSION_FILE="$SESSIONS_DIR/${DATE}-${BRANCH_SHORT}-${SESSION_ID}.md"

cat > "$SESSION_FILE" << SESSIONEOF
# Session Log: ${DATE}-${BRANCH_SHORT}-${SESSION_ID}

**Branch**: $BRANCH
**Started**: ${DATE}T${TIME}
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
SESSIONEOF

# Output session ID for reference
echo "Session started: $SESSION_ID"
echo "Log file: $SESSION_FILE"
