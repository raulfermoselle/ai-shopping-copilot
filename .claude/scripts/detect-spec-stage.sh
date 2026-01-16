#!/bin/bash
# detect-spec-stage.sh
# Detects the current pipeline stage for a feature specification
# Usage: ./detect-spec-stage.sh <feature-id>

FEATURE_ID=$1
SPEC_DIR="Sprints/Specs/${FEATURE_ID}"

if [ -z "$FEATURE_ID" ]; then
    echo "Usage: $0 <feature-id>"
    echo "Example: $0 001-user-authentication"
    exit 1
fi

# Check if spec directory exists
if [ ! -d "$SPEC_DIR" ]; then
    echo "STAGE: none"
    echo "NEXT: specify"
    echo "MESSAGE: Feature directory does not exist. Start with specification."
    exit 0
fi

# Check what artifacts exist
HAS_SPEC=false
HAS_PLAN=false
HAS_TASKS=false
HAS_CHECKLISTS=false
SPEC_COMPLETE=false
PLAN_COMPLETE=false
TASKS_COMPLETE=false

if [ -f "${SPEC_DIR}/spec.md" ]; then
    HAS_SPEC=true
    # Check if spec has open questions
    if ! grep -q "\[ \] Q" "${SPEC_DIR}/spec.md" 2>/dev/null; then
        SPEC_COMPLETE=true
    fi
fi

if [ -f "${SPEC_DIR}/plan.md" ]; then
    HAS_PLAN=true
    PLAN_COMPLETE=true
fi

if [ -f "${SPEC_DIR}/tasks.md" ]; then
    HAS_TASKS=true
    # Check if all tasks are complete
    if ! grep -q "\[ \] T" "${SPEC_DIR}/tasks.md" 2>/dev/null; then
        TASKS_COMPLETE=true
    fi
fi

if [ -d "${SPEC_DIR}/checklists" ]; then
    if [ -f "${SPEC_DIR}/checklists/requirements.md" ] && \
       [ -f "${SPEC_DIR}/checklists/design.md" ] && \
       [ -f "${SPEC_DIR}/checklists/implementation.md" ]; then
        HAS_CHECKLISTS=true
    fi
fi

# Determine stage
if [ "$HAS_SPEC" = false ]; then
    echo "STAGE: none"
    echo "NEXT: specify"
    echo "MESSAGE: No specification found. Create spec.md first."
elif [ "$SPEC_COMPLETE" = false ]; then
    echo "STAGE: specify"
    echo "NEXT: clarify"
    echo "MESSAGE: Specification has open questions. Clarify before proceeding."
elif [ "$HAS_PLAN" = false ]; then
    echo "STAGE: clarify"
    echo "NEXT: plan"
    echo "MESSAGE: Specification complete. Create implementation plan."
elif [ "$HAS_TASKS" = false ]; then
    echo "STAGE: plan"
    echo "NEXT: tasks"
    echo "MESSAGE: Plan complete. Generate task breakdown."
elif [ "$TASKS_COMPLETE" = false ]; then
    echo "STAGE: tasks"
    echo "NEXT: implement"
    echo "MESSAGE: Tasks defined. Begin implementation via sprint."
elif [ "$HAS_CHECKLISTS" = false ]; then
    echo "STAGE: implement"
    echo "NEXT: analyze"
    echo "MESSAGE: Implementation complete. Analyze and generate checklists."
else
    echo "STAGE: analyze"
    echo "NEXT: checklist"
    echo "MESSAGE: Ready for final verification via checklists."
fi

# Output artifact status
echo ""
echo "ARTIFACTS:"
echo "  spec.md: $HAS_SPEC (complete: $SPEC_COMPLETE)"
echo "  plan.md: $HAS_PLAN"
echo "  tasks.md: $HAS_TASKS (complete: $TASKS_COMPLETE)"
echo "  checklists: $HAS_CHECKLISTS"
