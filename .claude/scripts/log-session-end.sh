#!/bin/bash
# log-session-end.sh
# SubagentStop hook for sprint-executor agent
# Logs the end of an execution session

SESSIONS_DIR="Sprints/Logs/sessions"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BRANCH_SHORT=$(echo "$BRANCH" | sed 's/.*\///' | cut -c1-20)

# Find the most recent session file for today and this branch
SESSION_FILE=$(ls -t "$SESSIONS_DIR"/${DATE}-${BRANCH_SHORT}-*.md 2>/dev/null | head -1)

if [ -n "$SESSION_FILE" ] && [ -f "$SESSION_FILE" ]; then
    # Append session end marker
    cat >> "$SESSION_FILE" << ENDMARKER

---

## Session End
**Ended**: ${DATE}T${TIME}
**Status**: Completed

<!-- End of session log -->
ENDMARKER
    echo "Session ended. Log updated: $SESSION_FILE"
else
    echo "Warning: Could not find session log file to update"
fi
