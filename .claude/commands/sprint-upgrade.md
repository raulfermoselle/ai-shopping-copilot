---
description: Check for and apply Sprint Management framework updates
---

# Sprint Upgrade Protocol

This command automatically upgrades Sprint Management to the latest version.

**Framework Version:** 2.0.0

## Usage

Simply say:
```
Update Sprint Management to the latest version
```

Or use the command:
```
/sprint-upgrade
```

---

## Automatic Upgrade Process

When invoked, execute these steps automatically:

### Step 1: Pull Latest Framework

```bash
# Find or clone the framework repository
if [ -d "$HOME/SprintManagement" ]; then
    cd "$HOME/SprintManagement" && git pull
else
    git clone https://github.com/github-joyngroup/SprintManagement.git "$HOME/SprintManagement"
fi
```

### Step 2: Check Versions

```bash
# Get current installed version
INSTALLED=$(grep -oP 'installed_version:\s*"\K[^"]+' Sprints/sprint.config.yaml 2>/dev/null || echo "1.0.0")

# Get latest framework version
LATEST=$(cat "$HOME/SprintManagement/VERSION")

echo "Installed: $INSTALLED"
echo "Latest: $LATEST"
```

### Step 3: Run Upgrade Script

```bash
python "$HOME/SprintManagement/upgrade.py" --project .
```

### Step 4: Commit Changes

```bash
git add .
git commit -m "chore: Upgrade Sprint Management to v$LATEST

Automated upgrade from v$INSTALLED to v$LATEST

🤖 Generated with Claude Code"
```

---

## What This Command Does

1. **Pulls latest framework** from GitHub repository
2. **Detects current installed version** from `sprint.config.yaml`
3. **Creates backup** of current `Sprints/` folder
4. **Applies migrations** based on version difference
5. **Copies updated skill files** to `.claude/commands/`
6. **Updates version markers** in config files
7. **Commits all changes** automatically

---

## Version Detection

### Current Installed Version

Check `Sprints/sprint.config.yaml`:

```yaml
version: "1.0"
# or
version: "2.0.0"
framework:
  installed_version: "2.0.0"
```

If no version field, assume `1.0.0`.

### Latest Framework Version

Read from framework repo VERSION file or:
```
https://raw.githubusercontent.com/github-joyngroup/SprintManagement/master/VERSION
```

---

## Migration: 1.x → 2.0

### Pre-Migration Checklist

- [ ] No uncommitted changes in working directory
- [ ] Current sprint completed (recommended)
- [ ] Git backup available (committed state)

### Migration Steps

#### Step 1: Backup Current State

```bash
# Create backup branch
git checkout -b backup/sprint-v1-$(date +%Y%m%d)
git checkout -

# Or create archive
cp -r Sprints/ Sprints.backup.v1/
```

#### Step 2: Update Configuration

**Update `sprint.config.yaml`:**

Add new sections:
```yaml
version: "2.0.0"

framework:
  installed_from: "https://github.com/github-joyngroup/SprintManagement"
  installed_version: "2.0.0"
  installed_date: "{TODAY}"

concurrency:
  enabled: true
  mode: "branch-based"

naming:
  branch_based:
    strip_prefixes:
      - "feat/"
      - "feature/"
      - "fix/"
      - "bugfix/"
      - "hotfix/"
      - "chore/"
      - "refactor/"
    max_branch_segment_length: 20
    pattern: "Sprint-{BRANCH_SHORT}-{NUMBER:02d}-{NAME}"

logging:
  session_logs: true
  session_log_pattern: "{DATE}-{BRANCH_SHORT}-{SESSION_ID}.md"
  session_log_path: "Logs/sessions/"
  master_log_mode: "curated"
```

#### Step 3: Update .gitignore

Add to project `.gitignore`:
```gitignore
# Sprint local state (v2.0+)
Sprints/.sprint-state.local
```

#### Step 4: Create Session Logs Folder

```bash
mkdir -p Sprints/Logs/sessions/
touch Sprints/Logs/sessions/.gitkeep
```

#### Step 5: Migrate MASTER-SPRINT.md

**From v1.x format:**
```markdown
Active Sprint: Sprint-01-setup
Deadlock Counter: 0
```

**To v2.0 format:**
```markdown
## Active Sprints by Branch

| Branch | Sprint | Status | Started | Last Activity |
|--------|--------|--------|---------|---------------|
| main | Sprint-main-01-setup | Active | {DATE} | {DATE} |
```

**Migration logic:**
1. Read current active sprint
2. Detect current branch (default: main)
3. Transform sprint name if needed
4. Create branch table with single row

#### Step 6: Migrate SPRINT-INDEX.md

**From v1.x format:**
```markdown
| # | Sprint | Status |
|---|--------|--------|
| 01 | Sprint-01-setup | Active |
| 02 | Sprint-02-feature | Completed |
```

**To v2.0 format:**
```markdown
| Sprint ID | Branch | Created | Status | Merged To |
|-----------|--------|---------|--------|-----------|
| Sprint-main-01-setup | main | {DATE} | Active | - |
| Sprint-main-02-feature | main | {DATE} | Completed | - |
```

**Migration logic:**
1. Read all sprint rows
2. Add branch column (default: main for existing)
3. Transform sprint names to include branch
4. Preserve status and dates

#### Step 7: Migrate Sprint Folders (Optional)

**From v1.x structure:**
```
Active/
└── Sprint-01-setup/
```

**To v2.0 structure:**
```
Active/
└── main/
    └── Sprint-main-01-setup/
```

**Migration options:**
1. **Full rename** - Rename all folders (breaking if references exist)
2. **Hybrid** - Keep old folders, new sprints use new structure
3. **Legacy mode** - Don't rename, only new sprints use branch naming

Recommended: **Hybrid mode** for existing projects.

#### Step 8: Update Skills

Copy updated skill files from framework to `.claude/commands/`:
- `sprint-new.md`
- `sprint-start.md`
- `sprint-complete.md`
- `sprint-status.md`
- `context-recovery.md`
- `sprint-upgrade.md` (this file)

#### Step 9: Create Initial Local State

Create `Sprints/.sprint-state.local`:
```yaml
branch: main
branch_short: main
active_sprint: Sprint-main-01-setup  # or current active
sprint_path: Active/main/Sprint-main-01-setup
session_id: {random}
deadlock_counter: 0
last_task: null
created: {NOW}
last_updated: {NOW}
```

#### Step 10: Commit Migration

```bash
git add .
git commit -m "chore: Upgrade Sprint Management 1.x → 2.0.0

Migration changes:
- Updated sprint.config.yaml with v2.0 settings
- Added .sprint-state.local to .gitignore
- Created Logs/sessions/ folder
- Migrated MASTER-SPRINT.md to branch table format
- Migrated SPRINT-INDEX.md to branch-keyed format
- Updated all sprint skills

🤖 Generated with Claude Code"
```

---

## Check Mode Output

```
## Sprint Management Upgrade Check

**Current Version**: 1.0.0
**Latest Version**: 2.0.0
**Status**: Upgrade Available

### What's New in 2.0.0:
- Branch-based concurrent sprint support
- Local state file (.sprint-state.local)
- Session-based logging
- Framework versioning and upgrade tooling

### Migration Required:
- [ ] Update sprint.config.yaml
- [ ] Update .gitignore
- [ ] Create Logs/sessions/ folder
- [ ] Migrate MASTER-SPRINT.md format
- [ ] Migrate SPRINT-INDEX.md format
- [ ] Update skill files

Run `/sprint-upgrade` to apply these changes.
```

---

## Post-Upgrade Verification

After upgrade completes:

1. **Verify config version:**
   ```yaml
   version: "2.0.0"
   ```

2. **Check .gitignore:**
   ```
   grep "sprint-state.local" .gitignore
   ```

3. **Verify sessions folder:**
   ```
   ls Sprints/Logs/sessions/
   ```

4. **Test sprint creation:**
   ```
   /sprint-new test-upgrade
   ```
   Should create: `Active/{branch}/Sprint-{branch}-01-test-upgrade/`

5. **Verify local state created:**
   ```
   cat Sprints/.sprint-state.local
   ```

---

## Rollback

If issues occur after upgrade:

```bash
# Restore from backup branch
git checkout backup/sprint-v1-YYYYMMDD -- Sprints/

# Or restore from archive
rm -rf Sprints/
mv Sprints.backup.v1/ Sprints/

# Commit rollback
git add .
git commit -m "revert: Rollback Sprint Management upgrade"
```

---

## Troubleshooting

### "Already on latest version"

Use `--force` to re-apply migrations:
```
/sprint-upgrade --force
```

### "Uncommitted changes detected"

Commit or stash changes first:
```bash
git stash
/sprint-upgrade
git stash pop
```

### "Config file not found"

Project may not have Sprint Management installed:
```
/sprint-new  # This will initialize if needed
```

### "Migration failed"

1. Check error message for specific issue
2. Restore from backup if needed
3. Report issue with error details

---

## Remote Upgrade (Future)

In future versions, upgrade can fetch latest from remote:

```bash
# Clone latest framework
git clone https://github.com/github-joyngroup/SprintManagement.git /tmp/sm-upgrade

# Run upgrade script
python /tmp/sm-upgrade/upgrade.py --project .

# Cleanup
rm -rf /tmp/sm-upgrade
```
