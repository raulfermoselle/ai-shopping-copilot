---
description: Analyze and audit project documentation structure
---

# Documentation Audit

Perform a full analysis of the project's documentation structure and fix any gaps.

## What This Does

1. Scans the entire project for documentation gaps
2. Creates missing CLAUDE.md files where needed
3. **Verifies existing CLAUDE.md files are accurate**
4. Identifies modules that need docs/ folders
5. Updates stale documentation
6. **Validates markdown file placement**
7. Reports on documentation health
8. **Synchronizes README.md with current project state**

## Documentation Rules

### Where Markdown Files Belong

**Allowed locations for `.md` files:**
- `docs/` folders (root `docs/`, `src/agents/*/docs/`, `src/*/docs/`)
- `CLAUDE.md` files (anywhere in the project)
- `README.md` files (anywhere in the project)
- `Sprints/` folder (sprint management)
- `.claude/` folder (Claude context files, commands, rules, skills)
- `templates/` folder (templates)
- `memory/` folder (constitution.md, project principles)
- `prompts/` folder (prompt templates for research)
- `data/selectors/pages/*/` folder (selector research documentation)

**Project-Specific Allowed:**
- Root-level architecture docs: `solution-architecture.md`, `problem-statement.md`
- Sprint completion reports: `SPRINT-*-COMPLETE.md`

**NOT allowed:**
- Loose `.md` files outside these locations
- Documentation in non-standard folders (e.g., `{module}/specifications/`, `{module}/documentation/`)

### CLAUDE.md Files

- Must reference documentation in `docs/` folders, not arbitrary paths
- Links should use relative paths to nearest `docs/` folder
- Example: `app/CLAUDE.md` should link to `docs/` files as `../docs/...` or `./docs/...`

## Execution

### Step 1: Validate Markdown Placement

Find all `.md` files and verify they are in allowed locations:
```bash
# Find all .md files not in allowed locations
find . -name "*.md" | grep -v -E "(docs/|CLAUDE\.md|README\.md|Sprints/|\.claude/|templates/|node_modules)"
```

Flag any misplaced files for relocation to appropriate `docs/` folder.

### Step 2: Find All Modules

Scan for directories that:
- Have 5+ source files (.ts, .tsx, .js, .py, .java, etc.)
- Are not node_modules, .git, dist, build, __pycache__
- Look like code modules (have entry points)

**AI Shopping Copilot - Known Modules Requiring CLAUDE.md:**
```
src/agents/cart-builder/      # CartBuilder agent
src/agents/substitution/      # Substitution agent
src/agents/stock-pruner/      # StockPruner agent
src/agents/slot-scout/        # SlotScout agent
src/agents/coordinator/       # Coordinator agent
src/llm/                      # LLM integration (Anthropic Claude)
src/memory/                   # Memory stores and persistence
src/selectors/                # Selector registry system
src/tools/                    # Shared browser tools
src/api/                      # Coordinator API layer
src/control-panel/            # UI components
```

### Step 3: Check Documentation Coverage

For each module found:
- Does it have CLAUDE.md?
- Does complexity warrant a docs/ folder?

### Step 4: Verify Existing CLAUDE.md Files

**CRITICAL**: For each existing CLAUDE.md, verify accuracy:

1. **Directory Structure Accuracy**
   - List actual subdirectories in the module
   - Compare against "Directory Structure" or "Project Structure" sections
   - Flag any directories that exist but aren't documented
   - Flag any documented directories that no longer exist

2. **File References**
   - Check that referenced files (in tables, code blocks) still exist
   - Verify file paths are correct

3. **Key Files/Components Tables**
   - Ensure listed files match actual files in directory
   - Add any significant new files not documented

4. **Stale Content Indicators**
   - "Last Updated" dates older than recent major changes
   - References to old service names or patterns
   - Outdated configuration examples

### Step 5: Split Oversized CLAUDE.md Files

**CRITICAL**: For each CLAUDE.md over 80 lines:

1. Create docs/ folder in same directory
2. Extract detailed sections to docs/:
   - Code examples (>10 lines) → docs/examples.md
   - Architecture diagrams & explanations → docs/architecture.md
   - API documentation → docs/api.md
   - Design decisions → docs/decisions.md
3. Replace extracted content with references:
   ```markdown
   ## Architecture
   See [docs/architecture.md](docs/architecture.md) for detailed design.
   ```
4. Keep CLAUDE.md under 80 lines with:
   - Purpose (1-2 sentences)
   - Key concepts (bullet points)
   - Important files table
   - Links to docs/

### Step 6: Create Missing Documentation

For each gap found:
- Generate CLAUDE.md based on file analysis
- Create docs/ folder if module meets ANY criteria:
  - 10+ source files
  - Critical component (auth, plugins, database, API)
  - Has existing complex documentation
  - Would require >80 line CLAUDE.md

### Step 7: Update Stale Documentation

For each existing CLAUDE.md with issues:
- Fix directory structure listings
- Update file references
- Add missing components
- Update "Last Updated" date

### Step 8: README Synchronization

**Purpose**: Keep root README.md succinct and synchronized with project state.

#### README Target Structure

The README.md MUST follow this exact structure (no more, no less):

```markdown
# {Project Name}

{One sentence: what it is / who it's for}

- {Core capability 1}
- {Core capability 2}
- {Core capability 3} (optional, max 3 bullets)

## Quick Start

**Prerequisites:** {runtime versions in one line}

```bash
git clone {repo-url}
cp .env.example .env
{single command to start everything}
```

Verify: {one line - URL or "you should see X"}

## What's in This Repo

{One sentence overview of repo contents}

```
/{dir1}     – {one-line description}
/{dir2}     – {one-line description}
/{dir3}     – {one-line description}
...
```

**Tech Stack:** {main technologies only, comma-separated}

## Commands

| Command | Description |
|---------|-------------|
| `{cmd}` | {what it does} |
...
(5-8 commands max)

## Documentation

- [Docs Index](docs/README.md)
- [Architecture](docs/architecture/...)
- [Module Dev]({module}/CLAUDE.md)
- [Contributing](CONTRIBUTING.md)
```

#### Content Sources

| Section | Source | Extraction |
|---------|--------|------------|
| Project name | `package.json`, `pyproject.toml`, or `.claude/CLAUDE.md` | `name` field |
| One-liner | `.claude/CLAUDE.md` | First sentence of description |
| Core capabilities | `.claude/CLAUDE.md` | "Key Features" or bullets |
| Prerequisites | `docker-compose.yml`, `package.json`, `pyproject.toml` | Runtime versions |
| Start command | `docker-compose.yml`, `Makefile`, `scripts/` | Primary dev command |
| Verify URL | `docker-compose.yml` | Frontend port or health endpoint |
| Repo structure | Filesystem scan | Top-level directories only |
| Tech stack | `.claude/CLAUDE.md`, `package.json`, `requirements.txt` | Main frameworks/languages |
| Commands | `Makefile`, `package.json scripts`, `docker-compose.yml` | Common dev commands |
| Doc links | `docs/README.md`, existing CLAUDE.md files | Verify links exist |

#### Validation Rules

1. **Structure Compliance**
   - README has exactly 5 sections (name, quick start, repo contents, commands, docs)
   - No extra sections (no "Features", "API Reference", "Changelog" etc.)
   - Total length: ideally under 80 lines

2. **Freshness Checks**
   - Services in README match `docker-compose.yml`
   - Ports are accurate
   - Commands actually work (exist in Makefile/package.json)
   - Doc links point to existing files
   - Tech stack matches current dependencies

3. **Drift Detection**
   - Compare directory listing with actual top-level dirs
   - Compare services with docker-compose services
   - Flag any README content not matching sources

#### Update Logic

```python
def sync_readme():
    current = read_file("README.md")
    expected = generate_readme_from_sources()

    drift = detect_drift(current, expected)

    if drift.has_structural_issues:
        # README doesn't follow target structure
        report_structural_issues(drift)
        propose_restructure(expected)

    elif drift.has_stale_content:
        # Structure OK but content outdated
        for section, issues in drift.stale_sections:
            update_section(section, issues)

    else:
        # README is in sync
        report_readme_ok()
```

#### Output for README Sync

```
README.md Sync
--------------
  Structure:  Compliant (5 sections)
  Length:     62 lines

  Freshness:
    [x] Services match docker-compose.yml
    [x] Ports accurate
    [x] Commands exist
    [x] Doc links valid
    [!] Tech stack outdated (missing: asyncpg)

  Actions:
    Updated: Tech stack line (added asyncpg)

  README.md: SYNCHRONIZED
```

---

### Step 9: Output Report

```
Documentation Audit Complete
============================

Scanned: {X} directories
Modules found: {Y}

Misplaced .md files:
  !  {path}/some-doc.md - should be in {path}/docs/
  OK No misplaced files (if none found)

Created CLAUDE.md:
  {path}/CLAUDE.md - {brief description}

Created docs/ folders:
  {path}/docs/ - architecture.md, decisions.md
  {path}/docs/ - examples.md, api.md

Split oversized files:
  {path}/CLAUDE.md - 216->75 lines, extracted to docs/

Updated (accuracy fixes):
  {path}/CLAUDE.md - fixed directory structure

Verified (no changes needed):
  {path}/CLAUDE.md

Coverage: {Z}% ({N}/{M} modules documented)

Oversized CLAUDE.md files remaining:
  [ ] {path}/CLAUDE.md - {lines} lines (needs manual split)

README.md Status:
  Structure: {Compliant/Non-compliant}
  Freshness: {X}/{Y} checks passed
  Actions:   {Updated sections or "No changes needed"}
```

## Verification Checklist

### Markdown File Placement
- [ ] All `.md` files are in `docs/` folders, or are CLAUDE.md/README.md
- [ ] No documentation in non-standard folders
- [ ] Sprints/ folder only contains sprint-related docs

### CLAUDE.md Files
- [ ] Directory structure matches actual filesystem
- [ ] All significant subdirectories are documented
- [ ] File tables list files that actually exist
- [ ] No references to deleted/renamed files
- [ ] Links point to `docs/` folders (not old paths like `specs/`)
- [ ] Configuration examples use current env var names
- [ ] Service names match docker-compose.yml
- [ ] Port numbers are accurate
- [ ] "Last Updated" date reflects recent changes

### README.md
- [ ] Follows 5-section structure (name, quick start, repo, commands, docs)
- [ ] No extra sections (Features, API, Changelog, etc.)
- [ ] Under 80 lines total
- [ ] One-liner accurately describes project
- [ ] Quick start command actually works
- [ ] Directory tree matches top-level folders
- [ ] Tech stack lists main technologies only
- [ ] Commands table has 5-8 entries max
- [ ] All doc links point to existing files
- [ ] Services/ports match docker-compose.yml

## When to Run

- After major refactoring
- When onboarding to check documentation health
- Periodically to catch drift
- After `/clear` to rebuild context

## Note

This command forces a full audit. During normal development, the `documentation-system.md` rule handles proactive documentation automatically.
