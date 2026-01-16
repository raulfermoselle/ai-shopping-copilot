---
name: speckit
description: |
  Specification-driven development workflow following GitHub's Spec-Kit methodology.
  Automatically triggers when:
  - Discussing new features or requirements
  - User mentions "specify", "spec", "plan", "design", "implement feature"
  - Creating or reviewing specifications
  - User asks about "requirements", "acceptance criteria", "user stories"
  - Following the specification pipeline
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Spec-Kit Integration Skill

Specification-driven development following GitHub's Spec-Kit methodology, integrated with the Sprint Management Framework.

## When This Skill Activates

This skill automatically triggers when you:
- Discuss new features or requirements
- Mention "specify", "spec", "specification", "requirements"
- Ask about "acceptance criteria", "user stories", "design"
- Need to plan implementation approach
- Create or review specifications
- Generate task breakdowns from specs

## Pipeline Overview

```
SPECIFY → CLARIFY → PLAN → TASKS → IMPLEMENT → ANALYZE → CHECKLIST
   │         │        │       │         │          │          │
   ▼         ▼        ▼       ▼         ▼          ▼          ▼
 spec.md  Questions  plan.md tasks.md  Execute   Validate   Verify
          Resolved           Generated  Sprint   Consistency Complete
```

## Pipeline Stages

| Stage | Trigger | Output | Description |
|-------|---------|--------|-------------|
| **Specify** | "specify feature", "create spec" | spec.md | Define feature requirements |
| **Clarify** | "clarify", "questions about" | Updated spec.md | Resolve ambiguities |
| **Plan** | "plan implementation", "design" | plan.md | Design implementation approach |
| **Tasks** | "create tasks", "break down" | tasks.md | Generate task breakdown |
| **Implement** | "implement", "execute" | Code changes | Execute via sprint-executor |
| **Analyze** | "analyze", "validate spec" | Analysis report | Check consistency |
| **Checklist** | "checklist", "verify" | checklists/*.md | Generate verification checklists |

## Quick Reference

### Start New Feature
```
"I want to specify a new feature for user authentication"
→ Creates Sprints/Specs/001-user-authentication/spec.md
```

### Check Current Stage
```
"What stage is the user-auth feature at?"
→ Analyzes existing artifacts, reports current stage
```

### Continue Pipeline
```
"Continue with the user-auth feature"
→ Detects current stage, proceeds to next
```

## Automatic Stage Detection

Claude automatically detects current stage based on:

| Artifacts Present | Current Stage | Next Stage |
|-------------------|---------------|------------|
| None | - | Specify |
| spec.md only | Specify | Clarify/Plan |
| spec.md + plan.md | Plan | Tasks |
| spec.md + plan.md + tasks.md | Tasks | Implement |
| All + code changes | Implement | Analyze |
| All + analysis | Analyze | Checklist |
| All + checklists complete | Complete | - |

## Directory Structure

```
Sprints/Specs/
└── {feature-id}/
    ├── spec.md              # Feature specification
    ├── plan.md              # Implementation plan
    ├── tasks.md             # Task breakdown
    ├── data-model.md        # Data structures (optional)
    ├── api-contract.md      # API definitions (optional)
    └── checklists/
        ├── requirements.md  # Requirements checklist
        ├── design.md        # Design checklist
        └── implementation.md # Implementation checklist
```

## Integration with Sprint Management

When reaching **Implement** stage:
1. Spec-Kit generates task breakdown
2. Sprint-management skill creates sprint from tasks
3. Sprint-executor agent executes tasks
4. Return to Spec-Kit for analysis and checklists

## Supporting Files

- [PIPELINE.md](PIPELINE.md) - Detailed pipeline stages and workflows
- [TEMPLATES.md](TEMPLATES.md) - Specification and artifact templates
- [CHECKLISTS.md](CHECKLISTS.md) - Checklist templates and validation

## Delegation

- **Code Review**: Delegates to code-reviewer agent for quality analysis
- **Implementation**: Delegates to sprint-management skill
- **Test Verification**: Delegates to test-runner agent

## Constitution Compliance

This skill enforces:
- **Article II**: Specifications drive implementation, not reverse
- **Article III**: Test-first development (tests in task breakdown)
- **Article VI**: Simplicity over abstraction (minimal viable spec)
