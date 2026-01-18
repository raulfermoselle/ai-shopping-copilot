# capture_state Procedure

**Purpose**: Capture browser state after each significant action for autonomous debugging.

**When to Call**: After every significant action (navigation, click, form submission) during workflow execution.

---

## Procedure

### 1. Create Timestamped Directory

```
runs/{ISO-timestamp}/{phase}-{task}-{step}/
```

Example: `runs/2026-01-18T14-30-00/phase1-T005-verify-connection/`

### 2. Capture Screenshot

Call `browser_screenshot` MCP tool.

Save result description to `screenshot-notes.md` (the tool returns a visual that Claude can see directly).

### 3. Capture DOM Snapshot

Call `browser_snapshot` MCP tool.

Save the accessibility tree output to `snapshot.txt`.

### 4. Record Current URL

Extract URL from the snapshot or previous navigation result.

Save to `url.txt`.

### 5. Capture Console Logs

Call `browser_get_console_logs` MCP tool.

Save output to `console.json`.

### 6. Write Observations

Create `notes.md` with:
- What action was taken
- What state was expected
- What state was observed
- Any anomalies or concerns
- Confidence level (high/medium/low)

---

## Directory Structure

```
runs/
└── 2026-01-18T14-30-00/
    └── phase1-T005-verify/
        ├── screenshot-notes.md   # Description of what screenshot shows
        ├── snapshot.txt          # Accessibility tree from browser_snapshot
        ├── url.txt               # Current page URL
        ├── console.json          # Console logs
        └── notes.md              # Claude's observations
```

---

## Example Capture

### Step: Verify login state

**Action**: Navigate to auchan.pt account page

**Procedure**:
1. `browser_navigate` to account URL
2. `browser_screenshot` - observe page visually
3. `browser_snapshot` - get element tree
4. `browser_get_console_logs` - check for errors
5. Write notes: "User appears logged in. Account menu visible. No console errors."

**Artifacts**:
```
runs/2026-01-18T14-30-00/phase2-T007-auth-check/
├── screenshot-notes.md  → "Screenshot shows account page with user email visible"
├── snapshot.txt         → [accessibility tree output]
├── url.txt              → "https://www.auchan.pt/pt/conta"
├── console.json         → []
└── notes.md             → "Auth verified. User logged in. Confidence: high"
```

---

## Naming Conventions

| Component | Format | Example |
|-----------|--------|---------|
| Timestamp | ISO-8601 (file-safe) | `2026-01-18T14-30-00` |
| Phase | `phase{N}` | `phase1`, `phase2` |
| Task | `T{NNN}` | `T005`, `T010` |
| Step | kebab-case description | `verify-connection`, `merge-order-1` |

---

## Usage in Workflow

```
FOR each significant action:
    1. Execute action (navigate, click, type)
    2. Call capture_state({phase}, {task}, {step})
    3. Verify expected state from artifacts
    4. IF unexpected:
        - Read snapshot, analyze DOM
        - Check console for errors
        - Diagnose and decide: retry, adjust, or escalate
```

---

## Notes

- Screenshots are viewed directly by Claude (multimodal) - no need to save image files
- Snapshot text can be large - save full output but focus on relevant elements
- Console logs help diagnose network/JS errors
- Notes.md is the key artifact for debugging failed runs
