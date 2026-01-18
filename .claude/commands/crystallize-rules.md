# /crystallize-rules

Crystallize durable insights from this session into enforceable rules.

## Instructions

You have access to the full conversation context. Perform the following autonomously:

### Step 1: Mine the Session

Review the entire conversation and identify:
- **Obstacles overcome**: Problems that required debugging, investigation, or multiple attempts
- **Subtle issues resolved**: Bugs or misunderstandings with non-obvious root causes
- **Patterns established**: Conventions, structures, or approaches that were decided upon
- **Systems wired up**: Integrations, configurations, or architectures that must work a specific way
- **Wrong assumptions corrected**: Moments where initial understanding was proven incorrect

Look especially for:
- Errors that took multiple attempts to fix
- "Aha" moments where the real cause differed from the suspected cause
- Decisions about how components should communicate
- Constraints discovered through trial and error
- Configurations that are fragile or must be exact

### Step 2: Filter for Durability

For each insight, ask: "Will this still matter in 5 sessions? In 10?"

**Keep** insights that are:
- Structural (how systems connect)
- Constraint-based (what must always/never be done)
- Protocol-based (how components communicate)
- Safety-related (what prevents breakage)

**Discard** insights that are:
- About a specific bug (already fixed)
- About temporary workarounds
- About features still in flux
- Historical context that explains "why we did X" rather than "always do X"

### Step 3: Transform to Directives

Convert each durable insight into an imperative rule:

**Wrong** (documentation style):
> "We discovered that the popup was using hardcoded action strings which didn't match the service worker, causing INVALID_REQUEST errors."

**Right** (directive style):
> "Never hardcode message action strings. Import all action names from `src/types/messages.ts`."

**Wrong** (lesson learned style):
> "The logger calls broke because replace_all removed the opening quote from message strings."

**Right** (directive style):
> "When using replace_all for logging migrations, verify string literal boundaries are preserved."

Rules must be:
- Imperative voice ("Always...", "Never...", "Use...", "Verify...")
- Self-contained (no references to "this session" or "we learned")
- Actionable (specific enough to follow without context)
- Terse (one to two sentences maximum)

### Step 4: Map to General Principles

Each concrete directive should trace to a general principle. This creates a two-tier knowledge system:
1. **General Principles** — timeless heuristics that transcend this project
2. **Concrete Directives** — project-specific applications of those principles

For each directive:

1. **Identify the parent principle** — Is there a well-known heuristic this maps to?
   - Clean Code (Robert C. Martin)
   - SOLID principles
   - Unix philosophy
   - Agentic coding patterns (emerging field)

2. **Validate if uncertain** — If the principle seems novel or emergent, perform a web search to find prior art or validate against best practices.

3. **Check if principle exists in CLAUDE.md** — Look in the `## General Principles` section.

4. **Add principle if missing** — If the general principle doesn't exist, add it to `## General Principles` with:
   - The principle name
   - A terse statement of the principle
   - Source/attribution if known (e.g., "Clean Code G25", "Unix Philosophy")

5. **Link directive to principle** — The concrete directive should reference its parent principle.

**Example mapping:**

| Concrete Directive | General Principle |
|--------------------|-------------------|
| "Never hardcode message action strings" | "Replace magic values with named constants" (Clean Code G25) |
| "Start debug server and read logs autonomously" | "Agentic assistants require autonomous access to all feedback loops" |

**Format for General Principles section:**

```markdown
## General Principles

### Replace Magic Values with Named Constants
Scattered literals create silent mismatches when values change. Use named constants for numbers, strings, and action identifiers.
*Source: Clean Code (Martin, 2008) — G25*

### Agentic Assistants Require Autonomous Feedback Loops
Any feedback that requires manual human relay breaks the autonomous iteration cycle. Ensure build, test, lint, and log outputs are directly accessible.
*Source: Emergent pattern in agentic coding (2025)*
```

### Step 5: Locate Target Sections

Read the root `CLAUDE.md` file. For each rule, identify where it belongs:

| Domain | Section |
|--------|---------|
| Browser automation | Tool Layer, Playwright DOM Extraction |
| Message passing | Extension architecture, Message Protocol |
| Selectors | Selector Registry |
| Logging/debugging | Autonomous Debug Logging (or create if missing) |
| Safety constraints | Safety Constraints, Security Rules |
| Build/bundling | Development Commands |
| Testing | Development Commands |
| Agent patterns | Agent Design Patterns |
| LLM integration | LLM Integration |

If no section fits, create a new `### Project-Specific Rules` subsection at the end of the relevant module's documentation.

### Step 6: Write the Rules

For each rule:
1. Read the target section to understand its format
2. Append the rule using consistent formatting (typically a bullet point or paragraph)
3. Do not add headers like "Rules from session X" — integrate seamlessly

### Step 7: Report

Output a summary in this format:

```
## Rules Crystallized

### General Principles Added
- **[Principle Name]**: "[Principle statement]" — *[Source]*

### Concrete Directives Added

#### [Section Name]
- "[Directive text]" → *[Parent Principle]*

#### [Section Name]
- "[Directive text]" → *[Parent Principle]*

---
Total: N principles, M directives crystallized into CLAUDE.md
```

## Constraints

- **Never write documentation** — only directives
- **Never include rationale** — the rule stands alone
- **Never reference the session** — rules are timeless
- **Never write "lessons learned"** — rules are not retrospective
- **If nothing durable emerged** — report "No durable rules to crystallize" and exit
- **Err on the side of fewer, stronger rules** — one good rule beats three weak ones
