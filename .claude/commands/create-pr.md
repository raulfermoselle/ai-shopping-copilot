---
description: Create a pull request to develop branch
---

# Create Pull Request

Creates a pull request from the current branch to develop using GitHub CLI.

## Usage

```
/create-pr
```

---

## Pre-flight Checks

### 1. Verify GitHub CLI

```bash
gh auth status
```

If not authenticated, instruct user to run `gh auth login`.

### 2. Verify Branch

```bash
git branch --show-current
```

- Must NOT be on `main`, `master`, or `develop`
- Must be a feature branch

### 3. Check for Uncommitted Changes

```bash
git status --porcelain
```

If changes exist, ask user whether to:
- Commit them first
- Stash them
- Proceed anyway

### 4. Verify Remote is Up to Date

```bash
git status -sb
```

If behind remote or not pushed:
```bash
git push -u origin HEAD
```

---

## PR Creation Process

### Step 1: Gather Sprint Information

Read sprint data for PR content:

```bash
cat Sprints/.sprint-state.local
```

Get:
- `branch` - Full branch name
- `active_sprint` - Current sprint ID

Read the sprint files:
- `Sprints/Active/{branch}/*/SPRINT-PLAN.md` - For objectives
- `Sprints/Active/{branch}/*/SPRINT-LOG.md` - For files modified

### Step 2: Generate PR Title

Format: `{type}: {short description}`

**Step 2a: Extract type from branch name:**
- `feat/*` → `feat:`
- `fix/*` → `fix:`
- `refactor/*` → `refactor:`
- `docs/*` → `docs:`
- `chore/*` → `chore:`

**Step 2b: Get description from sprint context:**

Read SPRINT-PLAN.md from the most recent sprint:
```
Sprints/Active/{branch_short}/Sprint-*-planning-*/SPRINT-PLAN.md
```

Extract from:
1. **Sprint Goals / Primary Objectives** - First objective is usually the main deliverable
2. **Sprint title** - The sprint name often describes the work
3. **Task list** - Summarize what tasks accomplished

**Priority for description:**
1. First primary objective from SPRINT-PLAN.md (best)
2. Sprint name from directory (e.g., "planning-health-endpoint" → "health endpoint")
3. Branch name transformation (fallback)

**Examples:**

| Branch | Sprint Objective | Generated Title |
|--------|------------------|-----------------|
| `feat/health-check` | "Add /health endpoint with readiness probes" | `feat: Add health endpoint with readiness probes` |
| `fix/login-bug` | "Fix session timeout on login page" | `fix: Fix session timeout on login page` |
| `feat/user-auth` | "Implement JWT authentication" | `feat: Implement JWT authentication` |

### Step 3: Generate PR Body

Read sprint files to gather context:

**From SPRINT-PLAN.md (planning sprint):**
- Primary objectives → Summary bullets
- Task breakdown → What was planned

**From SPRINT-LOG.md (implementation sprints):**
- Completed tasks → What was done
- Files modified → Changes list
- Key decisions → Notable implementation choices

**PR Body Template:**

```markdown
## Summary
{2-3 bullet points from SPRINT-PLAN.md primary objectives}

## What Changed
{Group files by type/area from SPRINT-LOG.md}

### Added
- `{new_file.py}` - {purpose}

### Modified
- `{existing_file.py}` - {what changed}

### Key Decisions
- {Decision 1 from SPRINT-LOG.md}
- {Decision 2}

## Tasks Completed
- [x] T001: {task description}
- [x] T002: {task description}
- [x] T003: {task description}

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Sprint Reference
| Sprint | Type | Status |
|--------|------|--------|
| {planning-sprint} | Planning | Completed |
| {impl-sprint-1} | Implementation | Completed |

---
Generated with [Claude Code](https://claude.ai/code)
```

### Step 4: Create PR

```bash
gh pr create --base develop --title "{title}" --body "$(cat <<'EOF'
{generated body}
EOF
)"
```

### Step 5: Return PR URL

After creation, display:
```
PR Created: https://github.com/{owner}/{repo}/pull/{number}
```

---

## Options

### Draft PR

To create as draft:
```
/create-pr --draft
```

Adds `--draft` flag to `gh pr create`.

### Custom Base Branch

To target a different base:
```
/create-pr --base main
```

Default is `develop`.

### Auto-merge (if enabled)

```
/create-pr --auto-merge
```

Enables auto-merge after PR creation (requires repo settings to allow).

---

## Error Handling

| Error | Resolution |
|-------|------------|
| `gh: command not found` | Install GitHub CLI: `brew install gh` or `winget install GitHub.cli` |
| `not logged in` | Run `gh auth login` |
| `no commits between` | Branch has no changes vs base |
| `pull request already exists` | Show existing PR URL |

---

## Example

```
/create-pr

Pre-flight:
  OK gh authenticated
  OK Branch: feat/health-check
  OK No uncommitted changes
  OK Pushed to remote

Creating PR:
  Title: feat: Add health check endpoint to API Hub
  Base: develop

  Summary:
  - Add /health endpoint to API Hub
  - Implement readiness and liveness probes
  - Add health check documentation

PR Created: https://github.com/org/repo/pull/129
```

---

## Integration with /task-execute

This command is automatically suggested at the end of `/task-execute` Phase 4.

Can also be invoked standalone after any development work.
