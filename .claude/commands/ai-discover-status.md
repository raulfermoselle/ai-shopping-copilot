---
description: Show AI discoverability status
---

# /ai-discover-status - AI Discoverability Status

Displays the current state of AI discoverability configuration, artifacts, and identifies any needed updates.

## Usage

```
/ai-discover-status [--verbose] [--check-urls]
```

**Parameters:**
- `--verbose`: Show detailed information for each artifact
- `--check-urls`: Verify URLs are accessible (slower)

## Prerequisites

- Project has `Sprints/sprint.config.yaml`

## When to Use

- After `/ai-discover-init` to verify setup
- Before deployments to check artifact status
- When troubleshooting AI integration issues
- During sprint review to assess AI readiness

---

## Execution Steps

### Step 1: Load Configuration

```python
config = load_config("Sprints/sprint.config.yaml")
ai_config = config.get("ai_discoverability", {})

enabled = ai_config.get("enabled", False)
project_type = ai_config.get("project_type", "not configured")
```

---

### Step 2: Check Enablement Status

```python
status = {
    "enabled": enabled,
    "project_type": project_type,
    "metadata_complete": check_metadata_complete(ai_config),
    "policy_enabled": check_policy_enabled()
}
```

---

### Step 3: Scan Artifact Status

```python
artifacts = {
    "robots_txt": {
        "name": "robots.txt",
        "path": f"{ai_config.output.web_root}/robots.txt",
        "types": ["web", "hybrid"],
        "exists": False,
        "valid": None,
        "last_modified": None,
        "needs_update": False,
        "update_reason": None
    },
    # ... similar for other artifacts
}

for name, artifact in artifacts.items():
    # Check if applicable to project type
    if project_type not in artifact["types"]:
        artifact["applicable"] = False
        continue

    path = project_root / artifact["path"]
    artifact["exists"] = path.exists()

    if artifact["exists"]:
        artifact["last_modified"] = get_file_mtime(path)
        artifact["valid"] = validate_artifact_quick(path, name)
        artifact["size"] = path.stat().st_size
```

---

### Step 4: Detect Needed Updates

```python
def check_needs_update(artifact_name, artifact_info, project_root):
    """Determine if artifact needs regeneration."""

    if not artifact_info["exists"]:
        return True, "File does not exist"

    artifact_mtime = artifact_info["last_modified"]

    # Check if source files changed
    if artifact_name == "sitemap_xml":
        pages_mtime = get_latest_mtime(project_root / "pages")
        if pages_mtime and pages_mtime > artifact_mtime:
            return True, "Pages changed since last generation"

    if artifact_name == "openapi_spec":
        routes_mtime = get_latest_mtime(project_root / "routes")
        controllers_mtime = get_latest_mtime(project_root / "controllers")
        latest = max(filter(None, [routes_mtime, controllers_mtime]))
        if latest and latest > artifact_mtime:
            return True, "API routes changed since last generation"

    if artifact_name == "ai_plugin_json":
        openapi_mtime = get_file_mtime(project_root / ".well-known/openapi.yaml")
        if openapi_mtime and openapi_mtime > artifact_mtime:
            return True, "OpenAPI spec updated"

    return False, None

# Check each artifact
for name, artifact in artifacts.items():
    if artifact.get("applicable", True) and artifact["exists"]:
        needs_update, reason = check_needs_update(name, artifact, project_root)
        artifact["needs_update"] = needs_update
        artifact["update_reason"] = reason
```

---

### Step 5: Check MCP Status

```python
mcp_status = {
    "enabled": ai_config.get("mcp", {}).get("enabled", False),
    "path": ai_config.get("output", {}).get("mcp_server", "mcp-server/"),
    "scaffolded": False,
    "built": False,
    "tools_count": 0
}

if mcp_status["enabled"]:
    mcp_path = project_root / mcp_status["path"]
    mcp_status["scaffolded"] = (mcp_path / "package.json").exists()
    mcp_status["built"] = (mcp_path / "dist" / "index.js").exists()

    tools_file = mcp_path / "src" / "tools" / "index.ts"
    if tools_file.exists():
        mcp_status["tools_count"] = count_tools_in_file(tools_file)
```

---

### Step 6: Generate Recommendations

```python
recommendations = []

if not enabled:
    recommendations.append({
        "priority": "high",
        "action": "Run /ai-discover-init to enable AI discoverability"
    })

for name, artifact in artifacts.items():
    if artifact.get("applicable", True):
        if not artifact["exists"]:
            recommendations.append({
                "priority": "high",
                "action": f"Run /ai-discover-generate --artifact {name}"
            })
        elif artifact["needs_update"]:
            recommendations.append({
                "priority": "medium",
                "action": f"Update {artifact['name']}: {artifact['update_reason']}"
            })
        elif not artifact["valid"]:
            recommendations.append({
                "priority": "high",
                "action": f"Fix validation errors in {artifact['name']}"
            })

if mcp_status["enabled"] and not mcp_status["built"]:
    recommendations.append({
        "priority": "medium",
        "action": "Build MCP server: cd mcp-server && npm install && npm run build"
    })
```

---

### Step 7: Generate Report

---

## Output Format

```
======================================================
  AI Discoverability Status
======================================================

  Enabled:       Yes
  Project Type:  hybrid (auto-detected)
  Base URL:      https://example.com
  Policy:        POLICY-AI-Discoverability (enabled)

------------------------------------------------------
  Configuration Status
------------------------------------------------------

  Required Metadata:
    [x] base_url:      https://example.com
    [x] description:   A full-stack application...
    [x] contact_email: support@example.com

  API Metadata:
    [x] api_version:   1.0.0
    [x] auth_type:     bearer
    [ ] description_ai: Not configured (optional)

------------------------------------------------------
  Web Artifacts
------------------------------------------------------

  robots.txt                    public/robots.txt
    Status:       EXISTS
    Size:         1.2 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    Needs Update: No

  sitemap.xml                   public/sitemap.xml
    Status:       EXISTS
    Size:         4.5 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    URLs:         24 indexed
    Needs Update: YES - Pages changed since last generation

  schema.jsonld                 public/schema.jsonld
    Status:       EXISTS
    Size:         0.8 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    Type:         WebApplication
    Needs Update: No

------------------------------------------------------
  API Artifacts
------------------------------------------------------

  ai-plugin.json                .well-known/ai-plugin.json
    Status:       EXISTS
    Size:         0.5 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    Needs Update: No

  openapi.yaml                  docs/api/openapi.yaml
    Status:       EXISTS
    Size:         12.3 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    Endpoints:    12 documented
    Needs Update: YES - API routes changed

  .well-known/openapi.yaml      (copy)
    Status:       EXISTS
    In Sync:      Yes

------------------------------------------------------
  MCP Server
------------------------------------------------------

  Enabled:        Yes
  Path:           mcp-server/
  Scaffolded:     Yes
  Built:          No
  Tools Defined:  5

  Files:
    [x] package.json
    [x] src/index.ts
    [x] src/server.ts
    [x] src/tools/index.ts
    [ ] dist/index.js (not built)

------------------------------------------------------
  Summary
------------------------------------------------------

  Total Artifacts:    6
  Up to Date:         4
  Need Update:        2
  Missing:            0
  Invalid:            0

------------------------------------------------------
  Recommendations
------------------------------------------------------

  [MEDIUM] Update sitemap.xml:
           Pages changed since last generation
           Run: /ai-discover-generate --artifact sitemap

  [MEDIUM] Update openapi.yaml:
           API routes changed since last generation
           Run: /ai-discover-generate --artifact openapi

  [MEDIUM] Build MCP server:
           Run: cd mcp-server && npm install && npm run build

======================================================
```

---

## Verbose Mode (`--verbose`)

Shows additional details:

```
  sitemap.xml                   public/sitemap.xml
    Status:       EXISTS
    Size:         4.5 KB
    Last Updated: 2025-01-05 10:30:00
    Valid:        Yes
    URLs:         24 indexed
    Needs Update: YES

    Indexed URLs:
      - / (priority: 1.0)
      - /about (priority: 0.8)
      - /docs (priority: 0.8)
      - /docs/api (priority: 0.6)
      ... and 20 more

    Change Detection:
      Last sitemap:  2025-01-05 10:30:00
      Latest page:   2025-01-05 14:22:00 (pages/new-feature.tsx)
      Status:        OUTDATED
```

---

## URL Check Mode (`--check-urls`)

Verifies URLs are accessible:

```
------------------------------------------------------
  URL Accessibility Check
------------------------------------------------------

  ai-plugin.json:
    URL: https://example.com/.well-known/ai-plugin.json
    Status: 200 OK
    Content-Type: application/json

  OpenAPI Spec:
    URL: https://example.com/.well-known/openapi.yaml
    Status: 200 OK
    Content-Type: text/yaml

  Logo:
    URL: https://example.com/logo.png
    Status: 404 NOT FOUND
    WARNING: Logo URL in ai-plugin.json returns 404
```

---

## Quick Actions

Based on status, suggested commands:

| Status | Suggested Action |
|--------|------------------|
| Not enabled | `/ai-discover-init` |
| Missing artifacts | `/ai-discover-generate` |
| Outdated artifacts | `/ai-discover-generate --artifact [name]` |
| All up to date | No action needed |
| Validation errors | Fix errors manually or regenerate |
| MCP not built | `cd mcp-server && npm run build` |

---

## Integration Points

- **After**: `/ai-discover-init` or `/ai-discover-generate`
- **Before**: Deployments to verify AI readiness
- **Called by**: `/sprint-status` when AI discoverability enabled
- **Triggers**: Can suggest `/ai-discover-generate` calls

---

## Exit Codes (for scripting)

| Code | Meaning |
|------|---------|
| 0 | All artifacts up to date |
| 1 | Updates needed |
| 2 | Missing artifacts |
| 3 | Validation errors |
| 4 | Not enabled |
