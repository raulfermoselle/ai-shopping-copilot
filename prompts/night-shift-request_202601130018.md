You are Claude Code operating in fully autonomous night-shift mode.

Context
- The AI Shopping Copilot is feature-complete (all phases done).
- Tonight’s work is NOT feature development.
- Tonight’s mission is a single objective: make order-history extraction for the last ~2 years FAST + FAULTLESS + AUDITABLE.

Primary artifact of record (must be correct)
C:\Users\rcoelho\Desktop\ai-shopping-copilot\data\memory\household-demo\purchase-history.json

Hard constraints (absolute)
1. You MUST NOT confirm, submit, or place any order on Auchan.pt.
2. You MUST NOT ask the user for input or wait for feedback.
3. You MUST continue iterating until rate-limited or technically blocked.
4. You MUST use all subagents in parallel (your eyes and ears on the ground).
5. You MUST produce concrete on-disk evidence each iteration: screenshots, HTML snapshots, validation reports, timing breakdowns.

Non-negotiable deliverables by morning
A) Speed:
- A full sync pass must be as fast as reasonably possible.
- A second pass MUST be dramatically faster:
  - It should skip already-synced orders via orderId-based delta detection.
  - It should finish quickly (near no-op) while still doing light verification.

B) Correctness:
- purchase-history.json must have zero obvious integrity issues:
  - no missing required fields
  - no duplicates
  - valid dates
  - sane quantities
  - stable deterministic ordering
- The extracted data must match captured page evidence for a meaningful sample.
- Any mismatch must be clearly reported with the HTML + screenshot that proves it.

C) Robustness:
- Subscription/cookie/modals must be dismissed immediately, reliably, and continuously.
- The run must not hang on “expand items” or slow UI.
- Failures must degrade gracefully: retry → capture proof → continue.

Execution strategy (mandatory)
- Do NOT build new product features.
- Do NOT refactor for aesthetics.
- Do NOT write heavy test suites.
- You are doing reliability + performance engineering only.
- Iterate aggressively: instrument → run → measure → optimize → validate → repeat.

Subagents (mandatory parallelization)
Launch all subagents you have and split the work immediately:

1) playwright-rpa-engineer
- Owns: popup suppression, selectors, faster extraction path, reduced hanging.
- Must implement an ALWAYS-ON popup kill switch:
  - MutationObserver + periodic scan
  - logs each dismissal
  - screenshots on dismissal failure

2) performance-profiler
- Owns: timing instrumentation and bottleneck diagnosis.
- Must output per-order and per-step timings:
  - login
  - open order history
  - open order
  - item expansion (if any)
  - parsing
  - persistence
- Must highlight slowest orders and propose concrete optimizations.

3) data-integrity-auditor
- Owns: purchase-history.json validation + evidence checks.
- Must implement invariants:
  - unique orderId per order
  - required fields present on every record
  - quantities > 0 (or explicitly justified)
  - valid ISO dates
  - deterministic sorting
  - rerun idempotency (no duplicates)
- Must verify JSON against captured HTML for at least:
  - 10 random orders
  - plus the 5 slowest orders
- Must generate a validation report.

4) resiliency-engineer
- Owns: retries, fallbacks, non-hanging logic.
- Must ensure:
  - timeouts are tight but safe
  - retries have escalation steps
  - persistent failure produces: screenshot + html + error + orderId, then continues

5) artifact-manager
- Owns: filesystem artifacts + standardized structure.
- Must create:
  data/artifacts/order-sync/YYYY-MM-DD_HH-mm-ss/
    - run-summary.json
    - timings.csv (or json)
    - purchase-history.snapshot.json (copy of output for that run)
    - screenshots/
    - html/
    - validations/
    - failures.json (if any)

Mandatory engineering changes (do these)
1) Replace “dumb waits” with condition-based waits.
2) Reduce or eliminate “expand all items”:
   - extract from DOM without expansion if possible
   - if expansion is required, do it once, minimally, with precise selectors
3) Delta sync:
   - read existing purchase-history.json
   - skip already-synced orderIds without opening their pages
   - still sample-verify a small set of already-synced orders each run
4) Always-on popup suppression as described above.
5) Evidence capture:
   - for each newly synced order:
     - screenshot after load
     - HTML snapshot of the item list container
   - for sampled verification orders:
     - same evidence capture
6) Validation must compare:
   - parsed item count vs DOM item count
   - selected items field-by-field (name + quantity + price if available)

Iteration loop (mandatory)
Repeat until rate-limited:

LOOP:
1. Build quickly: npm run build
2. Run sync: npx tsx scripts/demo-prune-non-needed-items.ts --sync
3. Save artifacts in a new timestamped folder
4. Validate purchase-history.json against invariants + evidence
5. Identify bottlenecks, hangs, popup misses, parsing mismatches
6. Implement fixes and speedups
7. Repeat immediately

Stopping condition
Stop ONLY when:
- Rate limit is hit, OR
- Technically impossible to proceed.

Do NOT ask for confirmation.
Do NOT pause for user feedback.
Do NOT summarize mid-run.
Do NOT stop early.

Safety reminder
- Never place an order.
- Add explicit guardrails that prevent clicking any final confirmation buttons.

Begin immediately.
