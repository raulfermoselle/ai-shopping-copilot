---
description: Initialize AI discoverability for project
---

# /ai-discover-init - Initialize AI Discoverability

Initializes AI discoverability configuration and generates initial artifacts based on detected or specified project type.

## Usage

```
/ai-discover-init [--type api|web|hybrid] [--base-url URL]
```

**Parameters:**
- `--type`: Force project type (optional, default: auto-detect)
- `--base-url`: Project base URL (optional, will prompt if not provided)

## Prerequisites

- Project has `Sprints/sprint.config.yaml`
- Project structure exists (for auto-detection)

## When to Use

- First time setting up AI discoverability for a project
- After major project restructuring
- When switching project type (e.g., adding API to web app)

---

## Execution Steps

### Step 1: Load Configuration

```python
# Load existing sprint config
config = load_config("Sprints/sprint.config.yaml")

# Check if already initialized
if config.ai_discoverability.enabled:
    warn("AI Discoverability already enabled")
    if not prompt_reinit():
        return "Cancelled - already initialized"
```

**Actions:**
1. Read `Sprints/sprint.config.yaml`
2. Check `ai_discoverability.enabled` status
3. If enabled, confirm reinitialize or exit

---

### Step 2: Detect Project Type

```python
def detect_project_type(project_root, config):
    """Detect project type from directory structure."""

    api_indicators = config.ai_discoverability.detection.api_indicators
    web_indicators = config.ai_discoverability.detection.web_indicators

    has_api = any(
        (project_root / indicator.rstrip('/')).exists()
        for indicator in api_indicators
    )

    has_web = any(
        (project_root / indicator.rstrip('/')).exists()
        for indicator in web_indicators
    )

    if has_api and has_web:
        return "hybrid"
    elif has_api:
        return "api"
    elif has_web:
        return "web"
    else:
        return "web"  # Default to web if nothing detected
```

**Actions:**
1. If `--type` provided, use specified type
2. Otherwise, scan for API indicators: `controllers/`, `routes/`, `api/`, `openapi.yaml`
3. Scan for Web indicators: `pages/`, `views/`, `components/`, `index.html`
4. Determine type: hybrid (both), api (only API), web (only Web or default)

**Output:**
```
Detecting project type...
  API indicators found: controllers/, routes/
  Web indicators found: pages/, components/
  Detected type: hybrid
```

---

### Step 3: Gather Required Metadata

Collect required information for artifact generation:

**For All Types:**
| Field | Required | Prompt |
|-------|----------|--------|
| `base_url` | Yes | "Enter your project's base URL (e.g., https://example.com):" |
| `description` | Yes | "Enter a short description of your project (max 100 chars):" |
| `contact_email` | Recommended | "Enter contact email for support:" |

**For API/Hybrid:**
| Field | Required | Prompt |
|-------|----------|--------|
| `api_version` | Yes | "Enter API version (e.g., 1.0.0):" |
| `auth_type` | Yes | "Select authentication type: none / bearer / api-key / oauth" |
| `description_ai` | Recommended | "Enter technical description for AI models:" |

**For MCP (if enabled):**
| Field | Required | Prompt |
|-------|----------|--------|
| `mcp.name` | Yes | Default: `{project_name}-mcp` |
| `mcp.tools` | Optional | Auto-detect from API or prompt |

---

### Step 4: Update Configuration

Update `Sprints/sprint.config.yaml`:

```yaml
ai_discoverability:
  enabled: true
  project_type: "{{DETECTED_TYPE}}"

  metadata:
    base_url: "{{BASE_URL}}"
    description: "{{DESCRIPTION}}"
    description_ai: "{{DESCRIPTION_AI}}"
    contact_email: "{{CONTACT_EMAIL}}"
    api_version: "{{API_VERSION}}"
    auth_type: "{{AUTH_TYPE}}"

  mcp:
    enabled: {{MCP_ENABLED}}
    name: "{{MCP_NAME}}"
```

**Actions:**
1. Merge new values into existing config
2. Preserve any custom settings
3. Write updated config

---

### Step 5: Create Output Directories

```python
directories = [
    config.ai_discoverability.output.web_root,      # public/
    config.ai_discoverability.output.well_known,    # .well-known/
    config.ai_discoverability.output.api_docs,      # docs/api/
]

if config.ai_discoverability.mcp.enabled:
    directories.append(config.ai_discoverability.output.mcp_server)

for directory in directories:
    ensure_directory(project_root / directory)
```

---

### Step 6: Update Policy Manifest

Add AI Discoverability policy to manifest:

```yaml
# In Sprints/Policies/policy-manifest.yaml
policies:
  local:
    POLICY-AI-Discoverability: enabled
```

---

### Step 7: Generate Initial Artifacts

Call `/ai-discover-generate` to create all enabled artifacts.

```python
# Trigger artifact generation
run_command("/ai-discover-generate")
```

---

### Step 8: Generate Report

Output initialization summary.

---

## Output Example

```
======================================================
  AI Discoverability Initialized
======================================================

Project Type: hybrid (auto-detected)

Detection Summary:
  API Indicators: controllers/, routes/, openapi.yaml
  Web Indicators: pages/, components/, public/

Configuration:
  Base URL:      https://example.com
  Description:   A full-stack application with REST API
  Auth Type:     bearer
  API Version:   1.0.0
  MCP Server:    Enabled

Directories Created:
  [x] public/
  [x] .well-known/
  [x] docs/api/
  [x] mcp-server/

Artifacts Generated:
  Web:
    [x] public/robots.txt
    [x] public/sitemap.xml
    [x] public/schema.jsonld

  API:
    [x] .well-known/ai-plugin.json
    [x] docs/api/openapi.yaml
    [x] .well-known/openapi.yaml (copy)

  MCP:
    [x] mcp-server/ (scaffold)

Configuration Updated:
  [x] Sprints/sprint.config.yaml
  [x] Sprints/Policies/policy-manifest.yaml

------------------------------------------------------
Next Steps:
------------------------------------------------------
1. Review generated artifacts in their directories
2. Customize robots.txt rules if needed
3. Add endpoint documentation to openapi.yaml
4. Implement MCP tool logic in mcp-server/src/tools/
5. Run /ai-discover-status to verify setup
6. Test ai-plugin.json at /.well-known/ai-plugin.json

======================================================
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Config not found | Error: "Sprint config not found. Run sprint initialization first." |
| Base URL not valid | Prompt again with validation |
| No indicators found | Warn user, default to "web" type |
| Directory creation failed | Report error, suggest permissions fix |
| Already initialized | Confirm reinitialize or cancel |

---

## Integration Points

- **Before**: Project must have sprint management initialized
- **After**: Use `/ai-discover-status` to verify
- **Triggers**: `/ai-discover-generate` for artifact creation

---

## Autonomous Execution Rules

When running autonomously (during sprint execution):

1. **Use reasonable defaults** for optional fields
2. **Skip prompts** - use auto-detection
3. **Log decisions** in SPRINT-LOG.md
4. **Continue on warnings** - don't block execution

```python
if autonomous_mode:
    base_url = detect_base_url_from_config() or "http://localhost:3000"
    description = config.project.name
    # Don't prompt, use defaults
```
