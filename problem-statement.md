Problem statement + context (for an agentic coding assistant)

Core problem
A recurring, high-friction household workflow—online grocery shopping—consumes ~2 hours every ~15 days (typically on weekends). The process is repetitive and largely deterministic, but still requires frequent human judgment (availability changes, replacements, quantity decisions, budget/value tradeoffs, and “did we forget something?” checks). The user wants an AI-driven solution that meaningfully reduces time-to-checkout by pre-building a high-quality cart draft that is already ~80% correct before human review.

Current workflow (as-is)
The user repeatedly performs the following steps on a specific grocer’s web platform:

1. Load and merge the last three past orders into the cart (platform feature).
2. Prune obvious non-needed items that were previously purchased but are not yet consumed (e.g., detergents, shower gel).
3. Resolve out-of-stock/unavailable items by selecting acceptable replacements.
4. Select a delivery slot early (platform locks it for ~2 hours while shopping continues).
5. Collaboratively review the cart with their wife to validate necessities and quantities.
6. Consult a shared notes-app list:
   - Add items recently noted over the last ~15 days (unticked items).
   - Re-scan the historical list (ticked items over years) to catch reminders/forgotten needs.
7. Final cart review and payment.

This workflow mixes:
- Routine actions (reloading prior orders, removing predictable items, adding recurring staples)
- Semi-routine decisions (quantity estimation based on time since last purchase)
- Dynamic constraints (stock availability, promotions, substitutions)
- Collaborative input (wife confirms needs/quantities; list reflects household intent over time)
- Value heuristics (prefer store brand or next-cheapest option; optimize “capacity/cost” ratio)

Desired outcome (to-be)
Provide an AI “shopping copilot” that, before the user starts manual shopping:
- Produces a draft cart that is already ≥80% correct (items + roughly correct quantities).
- Minimizes the user’s time to reach “pay/confirm order” while keeping user control.
- Handles common exceptions (unavailable items, likely-to-be-unneeded replenishment items).
- Uses historical behavior + lightweight interaction to resolve ambiguity.

Key intent for the solution
Build an agentic system that learns from:
- Past orders (and their cadence)
- Item consumption patterns / replenishment cycles
- The household notes list (recent needs + long-tail reminders)
- Store constraints (availability, substitutions, product hierarchy, price/value)

…and converts that into:
- A high-confidence baseline cart
- A short set of targeted questions for low-confidence decisions
- A fast path to delivery slot selection + checkout

Constraints and realities (implicit)
- The grocer platform likely has no public API (automation may require browser automation/RPA).
- The agent must operate reliably on a consumer ecommerce UI that can change over time.
- The system must respect the user’s preference for low-end pricing and strong value ratio.
- Collaboration matters: the cart is finalized with spouse input, so the agent should support a “review together” step rather than remove it.
- Unavailability/substitution is common enough that the agent must treat it as a first-class workflow, not an edge case.

Success definition (what “good” looks like)
- The user reaches a checkout-ready state substantially faster than today (target: “pay stage” with only review/confirm remaining).
- The prebuilt cart hits ≥80% correctness consistently across cycles.
- The agent reduces cognitive load by asking few, high-leverage questions instead of requiring full manual shopping.
- The experience remains trustable: the user can see why items were added/removed and adjust quickly.

Agent design direction (non-functional framing, not implementation)
This is a decision-support + automation problem, not just “recommendations”:
- It needs a persistent memory/knowledge base of household purchasing behavior.
- It needs reasoning over time (reorder frequency, last purchased date, household cycle).
- It needs a “draft → review → finalize” interaction loop.
- It needs resilience to UI/stock changes and safe execution boundaries (never place an order without explicit confirmation).

What the coding assistant should plan for
- How to acquire historical order data (export/scrape/manual import) and keep it updated.
- How to represent items robustly despite naming/packaging changes (identity matching).
- How to generate a baseline cart and rank confidence.
- How to handle substitutions/value optimization.
- How to integrate household notes input into the prediction and prompting loop.
- How to automate or assist the actual cart-building and checkout navigation on the grocer site.

This problem statement is intentionally focused on intent, context, and success criteria, leaving implementation and feature specifics to planning and architecture work.
