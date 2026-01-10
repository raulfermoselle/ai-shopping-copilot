System Architect — Owns the end-to-end technical design, boundaries, and interfaces; produces the build plan, module map, and key ADRs from the solution architecture. :contentReference[oaicite:0]{index=0}

Repo & Scaffolding Engineer — Bootstraps the monorepo structure, tooling, linting/formatting, env config, and “happy path” dev scripts so other agents can build safely in parallel.

Playwright/RPA Engineer — Implements resilient Auchan.pt browser automation (selectors, flows, retries, screenshots, state recovery) and abstracts it behind a clean tool API.

Agent Runtime Engineer — Builds the core agent orchestration runtime (task graph, tool-calling wrappers, state model, error taxonomy, stop-before-purchase guardrails).

Memory & Data Engineer — Implements persistence (schemas, migrations, sync/import of past orders, item identity matching), plus durable session/episodic memory and preference storage.

Decisioning/Heuristics Engineer — Implements cart-draft logic (restock cadence pruning, quantity estimation, substitution ranking, confidence scoring) as testable pure functions.

Frontend Engineer — Builds the Agent Control Panel UI (run inputs, progress, cart diff/review pack) with a clean state model and ergonomic UX for “review together.”

Backend/API Engineer — Implements the local service/API that connects UI ↔ agent runtime ↔ Playwright, with auth/session handling, logs, and stable contracts.

Observability Engineer — Adds structured logging, traces, run artifacts (screenshots/diffs), and an operator-friendly run report for debugging flaky UI automation.

Security & Safety Engineer — Enforces privacy and safety constraints (no auto-purchase, secret handling, PII minimization), threat-models the automation surface, and adds guardrails.

Test & QA Engineer — Creates an automated test strategy (unit tests for heuristics, integration tests with mocked Playwright, end-to-end smoke runs) and CI-ready fixtures.

CI/CD Engineer — Sets up pipelines, reproducible builds, and release automation (test gates, artifact packaging, optional containerization) for reliable iteration.
