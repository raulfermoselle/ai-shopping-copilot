---
description: Create a new sprint with proper structure
---

# Create New Sprint

**Usage**: `/sprint-new [name]` or `/sprint-new [sprint-id]`

**Examples**:
```
/sprint-new cart-builder-tools
/sprint-new Sprint-CB-A-001
```

## Execution

**Use the `sprint-manager` agent to execute this command.**

Pass the sprint name/ID from the user's command to the agent with the operation type "new".

The agent will:
1. Detect current branch and determine sprint location
2. Create SPRINT-PLAN.md and SPRINT-LOG.md templates
3. Update MASTER-SPRINT.md with the new active sprint
4. Report the created sprint structure

## Sprint ID Patterns (This Project)

| Module | Pattern | Example |
|--------|---------|---------|
| Global | Sprint-G-XXX | Sprint-G-003 |
| CartBuilder | Sprint-CB-{R/A/I}-XXX | Sprint-CB-A-001 |
| Substitution | Sprint-SU-{R/A/I}-XXX | Sprint-SU-R-001 |
| SlotScout | Sprint-SS-{R/A/I}-XXX | Sprint-SS-I-001 |
| StockPruner | Sprint-SP-{R/A/I}-XXX | Sprint-SP-A-001 |
| Coordinator | Sprint-CO-{R/A/I}-XXX | Sprint-CO-I-001 |
| ControlPanel | Sprint-CP-{R/A/I}-XXX | Sprint-CP-I-001 |

Where: R=Research, A=Architecture, I=Implementation
