You are Claude Code operating in fully autonomous night-shift mode.

Context
- Phase 1 and Phase 2 of the AI Shopping Copilot are COMPLETE.
- The system already:
  • Builds a cart from history
  • Detects availability
  • Proposes substitutions
  • Prunes stock
  • Scouts delivery slots
  • Produces a full Review Pack
  • Has a basic Control Panel
- Your mission is to execute Phase 3: POLISH (Learning & Resilience).

This is a production-hardening and self-improvement phase.
Assume all intelligence pipelines already exist.

Absolute constraints (hard rules)
1. You MUST NOT confirm, submit, or place any order on Auchan.pt.
2. You MUST NOT wait for user feedback or ask questions.
3. You MUST continue executing until rate-limited or technically blocked.
4. You MUST prefer learning loops, robustness, and observability over new features.
5. You MUST leave the system strictly more autonomous and resilient than you found it.

High-level Phase 3 objective
Transform the system from:
“Rule-based intelligence with good heuristics”
into:
“A learning, preference-aware, resilient agent that improves every run.”

Core Phase 3 themes (do not skip any)
- Persistent memory
- Preference learning
- Adaptive behavior
- UI / selector resilience
- Post-run feedback loop
- Trust & transparency
- Documentation for handoff

Execution strategy (mandatory)
- Use as many subagents as available.
- Parallelize sprints aggressively.
- Each sprint is autonomous: design → implement → wire → persist.
- Do NOT overinvest in tests; smoke-level only if unavoidable.
- Favor pragmatic data models over perfect abstractions.

Phase 3 sprints to execute (parallelize aggressively)

1) Persistent memory foundation
Sprint-G-003
- Implement a persistent memory layer (SQLite or JSON-backed, your choice).
- Support:
  • Household preferences
  • Item-level signals
  • Substitution history
  • Stock cadence signals
  • Episodic run summaries
- Define clear read/write boundaries.
- Ensure memory is append-safe and debuggable.

2) Learning from user decisions
Sprint-CB-I-002
- Learn from:
  • Approved items
  • Removed items
  • Quantity corrections
- Convert Review Pack outcomes into preference signals.
- Introduce confidence weighting (recent > old).
- Feed learned preferences back into CartBuilder.

Sprint-SU-I-002
- Learn acceptable substitutions from user approvals.
- Track:
  • Brand tolerance
  • Size tolerance
  • Price delta tolerance
- Persist substitution success/failure.
- Bias future rankings accordingly.

Sprint-SP-I-002
- Learn adaptive restock cadence.
- Adjust pruning confidence based on:
  • False removals
  • Emergency re-adds
- Prefer conservative behavior when uncertain.

3) Post-run feedback loop
Sprint-CO-I-003
- Implement a structured post-run feedback capture:
  • “Good”
  • “Remove next time”
  • “Wrong substitution”
  • “We ran out too early”
- Store feedback as episodic memory.
- Feed feedback into learning pipelines automatically.
- Zero user questioning during the run; feedback is optional after.

4) UI & automation resilience
Sprint-G-004
- Add selector fallback strategies:
  • Multiple selectors per element
  • Text-based heuristics
  • DOM structure tolerance
- Implement retry logic with escalation:
  • Retry → screenshot → continue with degraded confidence
- Ensure failures degrade gracefully and never block the run.

5) Control Panel enhancement
Sprint-CP-I-002
- Enhance UI to show:
  • Confidence per decision
  • “Why this was added/removed”
  • Learned preferences in effect
- Improve progress visibility.
- Keep UI simple, honest, and review-oriented.

6) Documentation & handoff
Sprint-G-D-001
- Write concise but complete documentation:
  • Setup & configuration
  • How learning works
  • Memory layout
  • Safety boundaries
  • Troubleshooting Playwright failures
- Treat docs as production-grade, not marketing.

Global quality bar (mandatory)
- Transparency over magic
- Conservative automation where trust matters
- Learning must be inspectable and reversible
- Never silently override user intent
- Every decision should be explainable in the Review Pack

Stopping condition
- You stop ONLY when:
  • Rate limit is reached
  • Execution is technically impossible
- Do NOT summarize.
- Do NOT ask for confirmation.
- Do NOT pause for feedback.

Begin Phase 3 execution immediately.
