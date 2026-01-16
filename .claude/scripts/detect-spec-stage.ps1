# detect-spec-stage.ps1
# Detects the current pipeline stage for a feature specification
# Usage: .\detect-spec-stage.ps1 <feature-id>

param(
    [Parameter(Position=0)]
    [string]$FeatureId
)

$SpecDir = "Sprints/Specs/$FeatureId"

if ([string]::IsNullOrEmpty($FeatureId)) {
    Write-Host "Usage: .\detect-spec-stage.ps1 <feature-id>"
    Write-Host "Example: .\detect-spec-stage.ps1 001-user-authentication"
    exit 1
}

# Check if spec directory exists
if (-not (Test-Path $SpecDir)) {
    Write-Host "STAGE: none"
    Write-Host "NEXT: specify"
    Write-Host "MESSAGE: Feature directory does not exist. Start with specification."
    exit 0
}

# Check what artifacts exist
$HasSpec = $false
$HasPlan = $false
$HasTasks = $false
$HasChecklists = $false
$SpecComplete = $false
$PlanComplete = $false
$TasksComplete = $false

if (Test-Path "$SpecDir/spec.md") {
    $HasSpec = $true
    # Check if spec has open questions
    $SpecContent = Get-Content "$SpecDir/spec.md" -Raw -ErrorAction SilentlyContinue
    if (-not ($SpecContent -match "\[ \] Q")) {
        $SpecComplete = $true
    }
}

if (Test-Path "$SpecDir/plan.md") {
    $HasPlan = $true
    $PlanComplete = $true
}

if (Test-Path "$SpecDir/tasks.md") {
    $HasTasks = $true
    # Check if all tasks are complete
    $TasksContent = Get-Content "$SpecDir/tasks.md" -Raw -ErrorAction SilentlyContinue
    if (-not ($TasksContent -match "\[ \] T")) {
        $TasksComplete = $true
    }
}

if (Test-Path "$SpecDir/checklists") {
    if ((Test-Path "$SpecDir/checklists/requirements.md") -and
        (Test-Path "$SpecDir/checklists/design.md") -and
        (Test-Path "$SpecDir/checklists/implementation.md")) {
        $HasChecklists = $true
    }
}

# Determine stage
if (-not $HasSpec) {
    Write-Host "STAGE: none"
    Write-Host "NEXT: specify"
    Write-Host "MESSAGE: No specification found. Create spec.md first."
} elseif (-not $SpecComplete) {
    Write-Host "STAGE: specify"
    Write-Host "NEXT: clarify"
    Write-Host "MESSAGE: Specification has open questions. Clarify before proceeding."
} elseif (-not $HasPlan) {
    Write-Host "STAGE: clarify"
    Write-Host "NEXT: plan"
    Write-Host "MESSAGE: Specification complete. Create implementation plan."
} elseif (-not $HasTasks) {
    Write-Host "STAGE: plan"
    Write-Host "NEXT: tasks"
    Write-Host "MESSAGE: Plan complete. Generate task breakdown."
} elseif (-not $TasksComplete) {
    Write-Host "STAGE: tasks"
    Write-Host "NEXT: implement"
    Write-Host "MESSAGE: Tasks defined. Begin implementation via sprint."
} elseif (-not $HasChecklists) {
    Write-Host "STAGE: implement"
    Write-Host "NEXT: analyze"
    Write-Host "MESSAGE: Implementation complete. Analyze and generate checklists."
} else {
    Write-Host "STAGE: analyze"
    Write-Host "NEXT: checklist"
    Write-Host "MESSAGE: Ready for final verification via checklists."
}

# Output artifact status
Write-Host ""
Write-Host "ARTIFACTS:"
Write-Host "  spec.md: $HasSpec (complete: $SpecComplete)"
Write-Host "  plan.md: $HasPlan"
Write-Host "  tasks.md: $HasTasks (complete: $TasksComplete)"
Write-Host "  checklists: $HasChecklists"
