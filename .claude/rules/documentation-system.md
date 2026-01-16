# Documentation System - Proactive Management

> **TEMPLATE**: Tailor these rules to your project's documentation structure.

You are responsible for maintaining the project's documentation structure. This is not optional - you must proactively analyze, create, and update documentation as part of your normal work.

## Core Principle: Hierarchical Context

Documentation follows a hierarchy where **proximity determines specificity**:

```
Root level → Broad architecture, cross-cutting concerns
├── Module level → Module purpose, patterns, key decisions
│   ├── Submodule level → Specific implementation details
│   │   └── Deep level → File-specific context when complex
```

**Rule: A CLAUDE.md at level N should NOT explain details of level N+2 or deeper.**

## Documentation Types

### 1. CLAUDE.md Files
- **Purpose**: Immediate context for Claude when accessing that directory
- **Location**: In any directory that needs context
- **Loads**: On-demand when Claude accesses files in that directory

### 2. docs/ Folders
- **Purpose**: Detailed documentation for complex areas
- **Location**: Alongside CLAUDE.md when a module is complex enough
- **Contains**:
  - `architecture.md` - Design decisions, data flow
  - `api.md` - Endpoints, contracts (if applicable)
  - `decisions.md` - ADRs, why choices were made
  - Other topic-specific files as needed

## When to Create Documentation

### Create CLAUDE.md When:
- Directory has 5+ source files
- Directory contains distinct functionality
- You notice yourself needing context that doesn't exist
- You make decisions that future Claude instances should know
- The module has non-obvious patterns or conventions

### Create docs/ Folder When (ANY of these):
- CLAUDE.md exceeds 80 lines → MUST split into docs/
- Module has 10+ source files
- Module has multiple complex subsystems
- There are architectural decisions to record
- API contracts or integrations exist

## Proactive Behavior

### During Development

**After creating new files/modules:**
- Check if parent directory has CLAUDE.md
- If directory now has 5+ files → Create CLAUDE.md

**After significant changes:**
- Verify existing CLAUDE.md files reflect current state
- Update if changes affect architecture or patterns

**After making decisions:**
- Document WHY in CLAUDE.md or docs/decisions.md
- Note impacts on other modules in parent-level docs

## File Templates

### CLAUDE.md Template (Module Level)
```markdown
# {Module Name}

**Purpose**: {One sentence}
**Owner**: {Component that uses/manages this}

## What This Does

{2-3 sentences explaining the module's role}

## Key Concepts

- **{Concept}**: {Brief explanation}

## Important Files

| File | Role |
|------|------|
| {entry} | Entry point |
| {config} | Configuration |

## Patterns

- {Pattern used in this module}

## Gotchas

- {Non-obvious thing that causes bugs}
```

## Quality Checks

Before finishing any task, verify:

1. **Did I create/modify files in a directory without CLAUDE.md?**
   - If 5+ files now exist → Create CLAUDE.md

2. **Did I make architectural decisions?**
   - If yes → Document in appropriate level

3. **Did I establish new patterns?**
   - If yes → Add to relevant CLAUDE.md

4. **Is existing documentation still accurate?**
   - If changes affected documented behavior → Update docs

---

## Project-Specific Rules

### Module Documentation Paths

Each agent module should have documentation at:

```
src/agents/{agent-name}/
├── CLAUDE.md              # Module overview, patterns, gotchas
└── docs/                  # If complex (>80 lines in CLAUDE.md)
    ├── architecture.md    # Agent design, state machine, tool flow
    └── decisions.md       # ADRs for agent-specific choices
```

**Required CLAUDE.md locations:**
- `src/agents/cart-builder/CLAUDE.md`
- `src/agents/substitution/CLAUDE.md`
- `src/agents/stock-pruner/CLAUDE.md`
- `src/agents/slot-scout/CLAUDE.md`
- `src/agents/coordinator/CLAUDE.md`
- `src/llm/CLAUDE.md`
- `src/memory/CLAUDE.md`
- `src/selectors/CLAUDE.md`

### Selector Registry Documentation

New page automations require:
1. Selector JSON file in `data/selectors/pages/{page}/v1.json`
2. Entry in `data/selectors/registry.json`
3. Screenshots in `data/selectors/pages/{page}/screenshots/`

### Tool Documentation

Each tool file should have:
- JSDoc header explaining purpose
- Input/output type definitions
- Error scenarios documented in comments

### Learning Subsystem Documentation

Agent learning modules (`learning/` folders) require:
- `types.ts` with all data structures
- Comments explaining the learning signals used
- Examples of how preferences affect decisions

### Naming Conventions

- Agent folders: lowercase with hyphens (`cart-builder`, `slot-scout`)
- Type files: `types.ts` in each module
- Test files: `__tests__/*.test.ts` or `*.test.ts`
- Tool files: verb-noun pattern (`load-order-history.ts`, `scan-cart.ts`)
