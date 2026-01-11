---
description: Begin work on a sprint with full context recovery
---

# Sprint Start

**Usage**: `/sprint-start [sprint-id]`

**Examples**:
```
/sprint-start Sprint-CB-A-001
/sprint-start              # Uses active sprint from MASTER-SPRINT.md
```

## Execution

**Use the `sprint-manager` agent to execute this command.**

Pass the sprint ID (if provided) to the agent with the operation type "start".

The agent will:
1. Load the sprint's SPRINT-PLAN.md and SPRINT-LOG.md
2. Recover context (goals, completed tasks, decisions made)
3. Identify the next pending task
4. Update MASTER-SPRINT.md to mark sprint as active
5. Return a summary ready for autonomous execution

## Context Recovery

The agent reads these files in order:
1. `SPRINT-PLAN.md` - Goals, task breakdown, dependencies
2. `SPRINT-LOG.md` - Progress, decisions, files modified
3. `MASTER-SPRINT.md` - Global state, blockers

## Autonomous Execution Mode

After context recovery, you should:
- Execute tasks without stopping to ask questions
- Make autonomous decisions and document them
- Update SPRINT-LOG.md as tasks complete
- Follow existing patterns in the codebase

## Sprint Locations

| Module | Path |
|--------|------|
| Global | `Sprints/Global/Sprint-G-*/` |
| CartBuilder | `Sprints/Modules/CartBuilder/Sprint-CB-*/` |
| Substitution | `Sprints/Modules/Substitution/Sprint-SU-*/` |
| SlotScout | `Sprints/Modules/SlotScout/Sprint-SS-*/` |
| StockPruner | `Sprints/Modules/StockPruner/Sprint-SP-*/` |
| Coordinator | `Sprints/Modules/Coordinator/Sprint-CO-*/` |
| ControlPanel | `Sprints/Modules/ControlPanel/Sprint-CP-*/` |
