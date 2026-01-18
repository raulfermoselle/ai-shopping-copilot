# Read Extension Debug Logs

Read and analyze Chrome extension debug logs to investigate: **$ARGUMENTS**

## Instructions

Follow these steps exactly:

### Step 1: Check if debug server is running

Run a health check to see if the debug server is responding:
```bash
curl -s http://localhost:9222/health
```

If it returns `{"status":"ok"}`, the server is running. Otherwise, proceed to Step 2.

### Step 2: Start debug server if needed

If the health check fails, start the debug server in background:
```bash
cd extension && node scripts/debug-server.mjs
```

Run this in background mode so you can continue working.

After starting, verify the server is running:
```bash
curl -s http://localhost:9222/health
```

If it returns `{"status":"ok"}`, proceed to Step 3.

### Step 3: Read the log file

Read the log file:
```
extension/logs/debug.log
```

For large log files, start with recent entries first. If more context is needed to understand the issue, keep reading earlier pages by offsetting backwards until you have sufficient context to analyze the problem.

### Step 4: Analyze logs for the user's issue

The user wants to debug: **$ARGUMENTS**

Analyze the logs with this context:

**Log format**: `[timestamp] [LEVEL] [SOURCE] message`

**Sources**:
- `SW` = Service Worker (background script)
- `ContentScript` = Injected page script
- `Popup` = Extension popup UI

**Look for**:
1. ERROR or WARN entries related to the issue
2. The sequence of events leading to any failure
3. Message flow between components (SW ↔ ContentScript ↔ Popup)
4. Missing expected log entries (gaps in flow)
5. Unexpected state or data values

**If expected logs are missing**:
When a user action was confirmed to have been executed but relevant component logs are absent:
1. Verify the component is using the centralized logger (`src/utils/logger.ts`)
2. Check if the specific code path has logging instrumentation
3. If logging is missing, add trace points to the relevant code paths
4. Ask the user to reproduce the issue so fresh logs are captured

### Step 5: Report findings

Provide a structured analysis:

1. **Issue Summary**: What the logs reveal about "$ARGUMENTS"
2. **Timeline**: Key events in chronological order
3. **Root Cause**: Most likely cause based on log evidence
4. **Relevant Log Entries**: Quote the specific lines that matter
5. **Suggested Fix**: Concrete next steps to resolve the issue

If logs are empty or server wasn't running during the issue:
- Inform user they need to reproduce the issue with server running
- Suggest: "Start server with `cd extension && npm run logs`, then reproduce the issue"

**After reporting**: Stop and let the user decide next steps. However, if the analysis reveals an obvious, pinpointed root cause with a clear fix, you may proceed autonomously to implement it.
