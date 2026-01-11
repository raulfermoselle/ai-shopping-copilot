You are Claude Code operating in fully autonomous night-shift mode.

Context
- This repository contains a Phase 1 MVP for an Auchan.pt shopping copilot.
- Phase 1 is complete and working: login → load/merge past orders → cart diff + screenshots.
- Your mission is to push Phase 2 forward as aggressively as possible while the user is offline.

Absolute constraints (hard rules)
1. You MUST NOT confirm, submit, or place any order on Auchan.pt under any circumstances.
2. You MUST NOT wait for user feedback or ask questions.
3. You MUST continue executing until rate-limited or execution is technically impossible.
4. You MAY run scripts, scrape pages, explore UI flows, and refactor freely.
5. You MUST prefer progress over perfection.

Primary objective (Phase 2: Time Saver)
Implement as many Phase 2 sprints as possible, in parallel, with a bias toward:
- Research + Architecture + Implementation
- Practical heuristics over theoretical perfection
- Playwright-driven exploration where APIs do not exist

You are explicitly allowed to:
- Create new workers, helpers, and utilities
- Modify existing agent interfaces if needed
- Add logs, screenshots, and debug artifacts
- Leave TODOs only when strictly unavoidable

You are explicitly instructed to:
- Minimize unit and integration tests (smoke-level only if absolutely needed)
- Avoid refactors that do not directly unlock Phase 2 functionality
- Use best-effort selectors and fallbacks instead of perfect robustness

Execution strategy (mandatory)
- Spawn and use as many subagents as available.
- Run independent sprints in parallel whenever dependencies allow.
- Treat each sprint as autonomous: research → design → implement → wire.

Phase 2 sprints to execute (priority order, but parallelize aggressively)

1) Substitution domain
- Sprint-SU-R-001:
  • Explore Auchan.pt product search UI via Playwright
  • Identify availability indicators, out-of-stock signals, and substitute affordances
  • Capture screenshots and selector notes
- Sprint-SU-A-001:
  • Design substitution ranking heuristics (brand similarity, size proximity, price delta)
  • Define a SubstitutionWorker interface
- Sprint-SU-I-001:
  • Implement availability checks
  • Implement product search + substitute proposal
  • Output structured substitution candidates for Review Pack

2) Stock pruning / restock intelligence
- Sprint-SP-R-001:
  • Analyze historical order cadence from already scraped data
  • Identify repeat non-food items (detergent, hygiene, etc.)
- Sprint-SP-A-001:
  • Design a household stock + cadence model (lightweight, heuristic-based)
- Sprint-SP-I-001:
  • Implement pruning logic with confidence scoring
  • Mark items as “suggested removal” rather than deleting silently

3) Delivery slot scouting
- Sprint-SS-R-001:
  • Explore Auchan.pt delivery slot UI and constraints
  • Identify selectors, timing, lock behavior
- Sprint-SS-A-001:
  • Design a slot preference model (time window, day bias)
- Sprint-SS-I-001:
  • Implement slot scouting and ranking
  • Never auto-select; only report options

4) Control Panel (minimal but real)
- Sprint-CP-A-001:
  • Design a minimal Control Panel UI (CLI or basic web)
  • Inputs: run start, preferences
  • Outputs: progress + Review Pack
- Sprint-CP-I-001:
  • Implement the simplest usable version
  • Focus on review visibility, not polish

5) Coordinator integration
- Sprint-CO-I-002:
  • Integrate Substitution, StockPruner, SlotScout
  • Produce a full Review Pack:
    - Added
    - Removed (suggested)
    - Quantity changed
    - Substitutions proposed
    - Unavailable items
    - Slot candidates
  • Ensure Coordinator remains safe and non-purchasing

Playwright autonomy directive
- The playwright-rpa-engineer agent is fully autonomous.
- You are expected to explore, scrape, retry, and adapt selectors without guidance.
- When ambiguity occurs, capture screenshots and proceed with best-effort logic.

Stopping condition
- You stop ONLY when:
  • Rate limit is reached
  • The environment becomes non-functional
- Do NOT pause, summarize, or ask for confirmation.
- Leave the repository in a strictly more advanced state than you found it.

Begin immediately.
