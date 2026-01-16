---
description: Tailor the task-execute workflow to your specific project
---

# Tailor Task-Execute Workflow

**YOU MUST** analyze this project and **EDIT** the workflow commands and rules files to match this specific codebase.

## Why This Matters

Generic commands work, but **tailored commands perform 2-3x better**. Your job is to overfit these files to this project.

---

## Step 1: Analyze the Project

**DO THIS NOW** - Use Glob, Grep, and Read to gather information:

### 1.1 Detect Tech Stack

Look for these files and read them:
```
package.json, requirements.txt, pyproject.toml, Cargo.toml, go.mod, pom.xml, build.gradle, Gemfile, composer.json
```

Extract: language, framework, dependencies, scripts.

### 1.2 Detect Project Structure

```bash
ls -la
```

Identify:
- Source directories (`src/`, `app/`, `lib/`)
- Test directories (`tests/`, `test/`, `__tests__/`)
- Documentation location
- Monorepo vs single project

### 1.3 Read Existing Context

Look for and read:
- `.claude/CLAUDE.md` or `CLAUDE.md`
- `README.md`
- `CONTRIBUTING.md`
- Any `docs/architecture.md`

Extract: project purpose, conventions, team rules.

### 1.4 Sample Code Patterns

Read 2-3 source files to identify:
- Async patterns used
- Error handling approach
- Naming conventions
- Import/export patterns

### 1.5 Detect Infrastructure

Check for:
- `docker-compose.yml` → services, databases
- `Dockerfile` → deployment
- `.github/workflows/` → CI/CD
- Cloud config files (cloudbuild.yaml, serverless.yml, etc.)

---

## Step 2: Present Findings

Show the user what you found:

```markdown
## Project Analysis

| Aspect | Detected |
|--------|----------|
| Language | {language} |
| Framework | {framework} |
| Database | {database or "not detected"} |
| Deployment | {target or "not detected"} |
| Test Framework | {test framework} |

### Structure
{brief directory overview}

### Patterns Found
- {pattern 1}
- {pattern 2}

### Existing Rules
- {from CLAUDE.md or docs}

I will now tailor the following files. Proceed?
```

**Wait for user confirmation before editing.**

---

## Step 3: Edit the Files

**ACTUALLY EDIT these files using the Edit tool:**

### 3.1 Edit `.claude/rules/security.md`

Add a "## Project-Specific Rules" section with:

```markdown
## Project-Specific Rules

### Authentication
- {detected auth pattern, e.g., "JWT via Authorization header"}

### Data Access
- {e.g., "All queries must include tenant_id for isolation"}

### Secrets
- {e.g., "Use environment variables, never hardcode"}

### {Other relevant security rules for this stack}
```

### 3.2 Edit `.claude/rules/documentation-system.md`

Add a "## Project-Specific Rules" section with:

```markdown
## Project-Specific Rules

### Module Paths
- {actual paths where CLAUDE.md files should exist}

### Required Documentation
- {what this project requires per module}

### Naming Conventions
- {detected file/folder naming patterns}
```

### 3.3 Edit `.claude/commands/code-review.md`

Find the review criteria sections and ADD project-specific checks.

**For Python projects, add:**
```markdown
#### Project-Specific Checks
- Type hints on all public functions?
- Async/await used correctly (no blocking in async)?
- {ORM} queries optimized (no N+1)?
- Pydantic models for request/response validation?
- Tests use {test framework} patterns?
```

**For TypeScript/Node projects, add:**
```markdown
#### Project-Specific Checks
- TypeScript strict mode compliant?
- Proper error handling with typed errors?
- {Framework} best practices followed?
- Components follow project structure?
- Tests use {test framework} patterns?
```

**For other stacks, add equivalent checks.**

### 3.4 Edit `.claude/commands/plan-review.md`

Find the review criteria sections and ADD:

```markdown
#### Project-Specific Constraints
- Respects {detected architecture} boundaries?
- Uses existing {patterns/utilities} where applicable?
- Compatible with {deployment target}?
- Considers {database/cache} implications?
```

### 3.5 Edit `.claude/commands/docs-audit.md`

Find the "Where Markdown Files Belong" section and UPDATE paths:

```markdown
**Allowed locations for `.md` files:**
- `docs/` folders (root `docs/`, `{actual module paths}/docs/`)
- `CLAUDE.md` files
- `README.md` files
- {other project-specific locations}
```

Update module detection for this project's actual structure.

---

## Step 4: Report Changes

After editing, show the user:

```markdown
## Tailoring Complete

### Files Modified

| File | Changes |
|------|---------|
| `rules/security.md` | Added {N} project-specific rules |
| `rules/documentation-system.md` | Added module paths, naming conventions |
| `commands/code-review.md` | Added {tech stack} specific checks |
| `commands/plan-review.md` | Added architecture constraints |
| `commands/docs-audit.md` | Updated paths for project structure |

### What's Now Tailored
- Security rules know about {auth pattern}
- Code review checks for {framework} best practices
- Plan review enforces {architecture} boundaries
- Docs audit uses {actual project paths}

### Test It
Run `/code-review` on a recent change to verify the tailoring works.
```

---

## Key Rules

1. **ALWAYS analyze before editing** - Don't guess, read the actual code
2. **ALWAYS ask before editing** - Show findings, get confirmation
3. **ALWAYS edit the files** - Don't just describe, use the Edit tool
4. **PRESERVE existing content** - Add sections, don't replace the whole file
5. **BE SPECIFIC** - Use actual paths, actual patterns, actual framework names
