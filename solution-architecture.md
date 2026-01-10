RECOMMENDED ARCHITECTURE (Assistant mode for Auchan.pt, laptop, couple reviews together)

Goal
- Cut the recurring ~2-hour grocery session down to a short review + approval, prioritizing time saved (your option A), while keeping you fully in control of final purchase (assistant mode).

High-level approach
- Build a “Cart Preparation Agent” that operates as a guided assistant:
  1) Rebuilds the cart from your usual baskets/history/favorites.
  2) Removes likely-not-needed items using “household stock heuristics”.
  3) Detects unavailable items and proposes substitutions.
  4) Prepares delivery-slot candidates based on your input preference.
  5) Produces a clear “Review Pack” for you and your wife to validate together, then you click “place order” yourselves.

Agent architecture (based on agentic AI best practices)
- Hybrid agent (deliberative + reactive):
  - Deliberative: plans the session into steps (login → load past orders → reconcile cart → substitutions → delivery slots → review pack).
  - Reactive: handles dynamic website states (out-of-stock, UI changes, timeouts).
- Coordinator–Worker–Delegator (CWD) pattern:
  - Coordinator: orchestrates the run and creates the review checklist.
  - Worker: “Cart Builder” (loads/merges prior orders, favorites).
  - Worker: “Availability & Substitution” (finds replacements quickly).
  - Worker: “Household Stock Pruner” (removes low-likelihood items like detergents when recently bought).
  - Worker: “Delivery Slot Scout” (collects best slot options given your preference).
  - Delegator: assigns tasks and retries/fallbacks if a worker hits UI friction.

Interface and user experience (keep it simple)
- One small “Agent Control Panel” UI where you:
  - Start a run
  - Provide 2–3 inputs (delivery-slot preference for this run, any special needs, budget guardrails if desired)
  - Review a single consolidated output (“Review Pack”)
- You can optionally paste/attach your Google Keep list into the agent UI.
  - To keep complexity low, the agent’s own “shopping memory” becomes the source of truth, and Keep stays optional.

Automation / tool layer
- Website automation: Playwright (preferred) for robust browser control on Auchan.pt.
- “Tool calling” inside the agent:
  - Tools like: open_site, login, load_last_orders, merge_cart, scan_cart, check_item_availability, search_substitute, set_quantity, capture_screenshot, list_delivery_slots.
  - Strong error handling + retries + safe fallbacks (e.g., take screenshot and ask you to decide when UI is ambiguous).
- No purchasing action: the flow stops at a ready-to-review cart + delivery slot shortlist.

Memory + personalization (key to real time savings)
- Working memory (per session): what changed today (out-of-stock items, substitutions proposed, delivery slot options).
- Long-term memory (persistent): your household preferences:
  - usual items + quantities
  - acceptable substitutes per item (brand/size constraints)
  - “restock cadence” for non-food items (detergent/shower gel, etc.)
  - your typical basket patterns (every 15 days baseline)
- Episodic memory: what happened in previous runs (what you approved/rejected, substitution choices that worked).

Reflection / quality improvement loop
- After each order, a short “What did we get wrong?” capture:
  - 1–2 clicks: “good”, “remove next time”, “substitution unacceptable”, “we ran out of X earlier than expected”
- The agent uses this to adjust heuristics (time-saver focus with bounded risk).

Trust & safety (important even in assistant mode)
- Transparency by design:
  - The Review Pack explicitly lists: “Removed”, “Added”, “Changed quantity”, “Substitutions proposed”, “Unavailable with no good substitute”, “Slot candidates”.
- Conservative boundaries where it matters:
  - Never places the order.
  - Never silently substitutes without showing it.
  - Clear uncertainty communication (“I’m not sure, pick A/B”) when it can’t infer preference.

Delivery slot handling
- The agent asks for your preference each run (since it varies), then:
  - Pulls top slots matching that preference
  - If none match, presents the next-best options with tradeoffs

Implementation plan (thin-to-thick)
Phase 1 (fast win)
- Playwright automation to: login → load/merge past orders → produce a cart diff report + screenshots.
- Manual removal/substitution still mostly done by you, but with the agent highlighting what changed.

Phase 2 (time saver)
- Add substitution search + “restock cadence” pruning + quantity suggestions.
- Add a simple UI for your joint review.

Phase 3 (polish)
- Better long-term memory + preference learning + faster run times + resilience to site UI changes.

What I still need later (but not now) to finalize details
- A few example orders (exported / screenshots) to learn patterns and map UI selectors safely.
- Your top 20 “must-have” items + 5 common substitution rules (to jump-start memory).

This architecture keeps stakeholder effort low (you answer only a few human-relatable inputs per run), uses an agentic CWD workflow with tool use and reflection, and optimizes for maximum time saved while keeping you in control of final purchase.
