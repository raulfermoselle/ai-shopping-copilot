# Speckit Templates

This directory contains templates for the Speckit framework, which is integrated with the Sprint Management system.

## Overview

Templates provide standardized structures for feature development artifacts. They ensure consistency, completeness, and make it easier for agents to generate high-quality documentation autonomously.

## Available Templates

| Template | Purpose | Used By | Output Location |
|----------|---------|---------|-----------------|
| `plan-template.md` | Implementation plan structure | `/speckit-plan` | `Sprints/Specs/{id}/plan.md` |
| `research-template.md` | Research documentation | `/speckit-plan` | `Sprints/Specs/{id}/research.md` |
| `data-model-template.md` | Data model definitions | `/speckit-plan` | `Sprints/Specs/{id}/data-model.md` |
| `contracts-template.yaml` | API contract specifications | `/speckit-plan` | `Sprints/Specs/{id}/contracts/api.yaml` |

## Template Usage

### How Templates Work

1. **Agent reads template** to understand the expected structure
2. **Agent copies template content** to the target location
3. **Agent replaces placeholders** with actual content
4. **Agent fills all sections** - no placeholder text should remain

### Placeholder Format

Templates use `{PLACEHOLDER}` format for values that need to be filled:

- `{FEATURE_NAME}` → Feature ID and title (e.g., "002-cart-merge")
- `{BRANCH_NAME}` → Git branch name (e.g., "feature/002-cart-merge")
- `{DATE}` → Current date in ISO 8601 format (e.g., "2026-01-19")
- `{SPEC_PATH}` → Path to specification file
- `{Other placeholders}` → Context-specific values

### Customization Guidelines

**When to use as-is**:
- Standard features that fit the template structure
- Common CRUD operations
- Typical REST API implementations

**When to customize**:
- Feature has unique requirements not covered by template
- Complex state machines or workflows
- Special relationships or constraints
- Domain-specific sections needed

**How to customize**:
1. Copy template to target location
2. Replace all placeholders
3. Add new sections if needed for feature-specific context
4. Remove inapplicable sections (use "N/A" if unsure)
5. Maintain overall structure and format

## Template Descriptions

### plan-template.md

**Purpose**: Complete implementation plan for a feature

**Key sections**:
- Summary - High-level feature overview
- Technical Context - 9 key specifications (Language, Dependencies, Storage, Testing, Platform, Type, Performance, Constraints, Scale)
- Constitution Check - Compliance verification
- Project Structure - Directory layout
- Research Outcomes - Key technical decisions
- Data Model - Entity overview
- API Contracts - Endpoint summary
- Complexity Tracking - Story point estimation
- Sprint Mapping - Sprint allocation
- Quickstart - Developer setup guide
- Risks & Mitigations - Potential blockers
- Success Criteria - Measurable outcomes

**Integration with Sprint Management**:
- Sprint Mapping section filled by sprint allocation algorithm
- Complexity Tracking feeds into sprint planning
- Constitution Check enforces project constitution compliance

### research-template.md

**Purpose**: Document technical unknowns and decisions

**Key sections**:
- Research Questions - For each unknown/clarification
  - Context - Why question matters
  - Research Approach - How investigated
  - Decision Made - Chosen approach
  - Rationale - Why this choice
  - Alternatives Considered - Other options and why rejected
  - References/Sources - Documentation, files examined
  - Impact on Design - Downstream effects
- Summary of Key Decisions - High-level table
- Assumptions Made - Documented assumptions and risk levels
- Open Questions - Remaining non-blocking questions

**When to create**:
- Specification has `[NEEDS CLARIFICATION]` markers
- Technical unknowns need investigation
- Multiple implementation approaches possible
- Decisions need documentation for future reference

### data-model-template.md

**Purpose**: Complete data model specification

**Key sections**:
- Entity Definitions - All entities with fields, types, validation
- Relationships - One-to-many, many-to-many, one-to-one mappings
- State Transitions - State machines for stateful entities
- Business Rules - Validation rules, computed fields, invariants
- Storage & Indexing - Database strategy, indexes, performance
- Migration Strategy - Schema changes and backfill
- Security & Privacy - Sensitive data handling, PII management
- Example Usage - Real-world scenarios

**When to create**:
- Feature involves data persistence
- New entities or entity changes
- Complex relationships between data
- State machines needed

### contracts-template.yaml

**Purpose**: API contract definitions in OpenAPI-inspired format

**Key sections**:
- Info - API metadata
- Security - Authentication and authorization
- Rate Limits - Request throttling
- Versioning - API version strategy
- Endpoints - All operations with:
  - Path and method
  - Parameters (path, query, headers)
  - Request body schema
  - Success response schema
  - Error responses (400, 401, 403, 404, 409, 422, 500)
  - Side effects
  - Idempotency
  - Performance targets
- Webhooks - Event-driven notifications (if applicable)
- Events - Event streams (if applicable)
- Data Models Reference - Link to data-model.md
- Testing Contracts - Mock data and test scenarios

**When to create**:
- Feature adds or modifies API endpoints
- Internal function contracts need documentation
- Request/response schemas need definition
- Error handling needs specification

## Integration with Sprint Management

### Workflow

1. **Specification Phase**: `/speckit-specify` creates spec.md
2. **Planning Phase**: `/speckit-plan` uses templates to create:
   - plan.md (from plan-template.md)
   - research.md (from research-template.md)
   - data-model.md (from data-model-template.md)
   - contracts/api.yaml (from contracts-template.yaml)
3. **Task Generation Phase**: `/speckit-tasks` generates tasks.md
4. **Sprint Creation**: `/sprint-new` creates sprint with tasks
5. **Implementation**: `/sprint-start` begins execution

### Sprint Management Specific Elements

Templates include Sprint Management-specific sections:

- **Constitution Check**: Validates compliance with project constitution
- **Sprint Mapping**: Allocates tasks across sprints based on points
- **Task Traceability**: Links tasks to speckit (Source: speckit:T###)
- **Test-First Ordering**: Ensures tests come before implementation
- **AI Discoverability**: Conditional sections when feature enabled

## Template Evolution

Templates should evolve as the project learns:

**When to update templates**:
- Recurring gaps found in generated artifacts
- New project patterns emerge
- Sprint Management framework updates
- Constitution articles added or modified

**How to update templates**:
1. Identify missing or inadequate sections
2. Propose changes in project documentation
3. Update template with new sections
4. Update this README with changes
5. Notify team of template updates

**Version control**:
- Templates are versioned with the codebase
- Breaking changes should be documented
- Old features can continue using older template structures

## Best Practices

### For Agents Using Templates

1. **Read template fully** before filling
2. **Replace ALL placeholders** - search for `{` to find any missed
3. **Fill every section** - use "N/A" if truly not applicable
4. **Maintain format** - preserve markdown structure, tables, code blocks
5. **Link artifacts** - cross-reference between plan, research, data-model, contracts
6. **Validate completeness** - ensure no placeholder text remains

### For Humans Reviewing Generated Artifacts

1. **Check placeholder replacement** - No `{PLACEHOLDER}` should remain
2. **Verify section completeness** - All sections have content
3. **Validate cross-references** - Links between artifacts are correct
4. **Review technical decisions** - Research rationale makes sense
5. **Confirm constitution compliance** - All checks pass
6. **Assess implementation readiness** - Plan provides enough detail for autonomous execution

## Examples

See completed features in `Sprints/Specs/` for examples of template usage:

- Good examples show complete, well-filled templates
- Bad examples can be learning opportunities (note what was missing)

## Questions or Issues

- Template missing important section? → Document in project issue tracker
- Template structure confusing? → Propose clarification
- Template conflicts with Sprint Management? → Flag for resolution

---

**Last Updated**: 2026-01-19
**Sprint Management Framework**: v2.1.0
