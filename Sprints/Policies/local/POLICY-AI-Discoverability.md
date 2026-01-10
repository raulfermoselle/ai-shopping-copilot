# AI Discoverability Policy

<!-- LOCK_STATUS: UNLOCKED -->
<!-- LOCK_REASON: Feature policy - user customizable -->

## Overview

This policy defines how the Sprint Management Framework generates and maintains AI discoverability artifacts, enabling AI systems to discover, understand, and interact with your project.

---

## Purpose

AI Discoverability ensures your project is:

1. **Findable**: AI crawlers and agents can discover your API/application
2. **Understandable**: Structured metadata describes your project capabilities
3. **Interactable**: AI systems can integrate via standardized protocols (MCP, OpenAPI)

---

## Configuration

### Enabling AI Discoverability

In `sprint.config.yaml`, set:

```yaml
ai_discoverability:
  enabled: true
```

**Default**: Disabled (opt-in only)

### Required Metadata

When enabled, the following metadata must be configured:

| Field | Required | Description |
|-------|----------|-------------|
| `metadata.base_url` | Yes | Project's base URL (e.g., https://example.com) |
| `metadata.description` | Yes | Human-readable project description |
| `metadata.contact_email` | Recommended | Support/contact email |

---

## Project Type Detection

### Auto-Detection Rules

When `project_type: auto`, the framework detects project type by scanning for indicators:

#### API Detection

Project is classified as **API** if ANY of these exist:
- `controllers/` directory
- `routes/` directory
- `endpoints/` directory
- `api/` directory
- `openapi.yaml` or `swagger.yaml` file

#### Web Detection

Project is classified as **Web** if ANY of these exist:
- `pages/` directory
- `views/` directory
- `components/` directory
- `index.html` file
- `public/` or `static/` directory

#### Hybrid Detection

Project is classified as **Hybrid** if BOTH API and Web indicators are found.

### Manual Override

Override auto-detection by setting explicit type:

```yaml
ai_discoverability:
  project_type: "api"    # or "web" or "hybrid"
```

---

## Artifact Specifications

### Web Application Artifacts

#### robots.txt

| Property | Value |
|----------|-------|
| **Location** | `{output.web_root}/robots.txt` |
| **Purpose** | Control AI crawler access |
| **Update Trigger** | Page structure changes |
| **Template** | `templates/ai-discoverability/robots-txt-template.md` |

**Default Rules**:
- Allow all public paths
- Disallow `/admin/`, `/api/internal/`, `/private/`
- Include AI-specific crawler rules (GPTBot, Claude-Web, etc.)
- Reference sitemap location

#### sitemap.xml

| Property | Value |
|----------|-------|
| **Location** | `{output.web_root}/sitemap.xml` |
| **Purpose** | List all discoverable pages |
| **Update Trigger** | New pages added, routes modified |
| **Template** | `templates/ai-discoverability/sitemap-xml-template.md` |

**Generation Rules**:
- Scan page directories for discoverable URLs
- Calculate priority based on page depth (1.0 for root, decreasing)
- Estimate change frequency from git history or defaults
- Include API documentation pages if available

#### Schema.org JSON-LD

| Property | Value |
|----------|-------|
| **Location** | `{output.web_root}/schema.jsonld` or embedded in HTML |
| **Purpose** | Structured data for AI understanding |
| **Update Trigger** | Content/metadata changes |
| **Template** | `templates/ai-discoverability/schema-org-template.md` |

**Schema Types**:
- `WebApplication` for web apps
- `SoftwareApplication` for APIs
- `Organization` for company info

### API Artifacts

#### ai-plugin.json

| Property | Value |
|----------|-------|
| **Location** | `{output.well_known}/ai-plugin.json` |
| **Purpose** | AI plugin manifest (ChatGPT plugins, etc.) |
| **Update Trigger** | API endpoint changes, auth changes |
| **Template** | `templates/ai-discoverability/ai-plugin-json-template.md` |

**Required Fields**:
- `name_for_human`: Human-readable name
- `name_for_model`: Snake_case identifier
- `description_for_human`: Marketing description
- `description_for_model`: Technical capabilities
- `auth.type`: Authentication method
- `api.url`: OpenAPI spec location

#### OpenAPI Specification

| Property | Value |
|----------|-------|
| **Location** | `{output.api_docs}/openapi.yaml` |
| **Purpose** | API documentation for AI consumption |
| **Update Trigger** | Endpoint additions/modifications |
| **Template** | `templates/ai-discoverability/openapi-spec-template.md` |

**Generation Rules**:
- Detect endpoints from route files
- Extract schemas from TypeScript types
- Merge with existing spec if present
- Validate against OpenAPI 3.0+ schema

### MCP Server

#### MCP Server Scaffold

| Property | Value |
|----------|-------|
| **Location** | `{output.mcp_server}/` |
| **Purpose** | Model Context Protocol server for direct AI integration |
| **Update Trigger** | Tool definitions change |
| **Template** | `templates/ai-discoverability/mcp-server-template.md` |

**Generated Files**:
- `package.json` - Dependencies and scripts
- `src/index.ts` - Server entry point
- `src/server.ts` - MCP implementation
- `src/tools/index.ts` - Tool registry
- `README.md` - Usage documentation

---

## Integration with Sprint Workflow

### During /speckit-plan

When `ai_discoverability.enabled: true`:

1. **Detect project type** (if auto)
2. **Add AI Discoverability phase** to implementation plan
3. **Generate artifact checklist items**

### During /speckit-tasks

When enabled, add tasks in format:

```markdown
## Phase X: AI Discoverability

- [ ] T0XX [P] [AI-DISC] Update robots.txt | {web_root}/robots.txt
- [ ] T0XX [P] [AI-DISC] Regenerate sitemap.xml | {web_root}/sitemap.xml
- [ ] T0XX [P] [AI-DISC] Update Schema.org markup | {web_root}/schema.jsonld
- [ ] T0XX [P] [AI-DISC] Update ai-plugin.json | {well_known}/ai-plugin.json
- [ ] T0XX [AI-DISC] Regenerate OpenAPI spec | {api_docs}/openapi.yaml
- [ ] T0XX [AI-DISC] Validate all artifacts
```

### During /sprint-complete

When `maintenance.on_sprint_complete: true`:

1. **Scan for changes** to routes, pages, API endpoints
2. **Regenerate affected artifacts** if changes detected
3. **Log updates** in SPRINT-LOG.md

---

## Maintenance Triggers

### Automatic Updates

Artifacts should be regenerated when:

| Trigger | Affected Artifacts |
|---------|-------------------|
| New route/endpoint added | sitemap.xml, openapi.yaml, ai-plugin.json |
| Page added/removed | sitemap.xml, robots.txt |
| API schema changed | openapi.yaml, ai-plugin.json |
| MCP tool added/removed | MCP server files |
| Auth configuration changed | ai-plugin.json |

### Manual Updates

Use `/ai-discover-generate` to force regeneration of all artifacts.

---

## Artifact Generation Rules

### Rule 1: No Overwrites Without Backup

Before regenerating an artifact:

1. Check if file exists
2. Create backup: `{filename}.backup`
3. Generate new content
4. Only replace if validation passes

### Rule 2: Preserve User Customizations

For files that support customization (robots.txt, sitemap.xml):

1. Detect user-added sections (marked with `<!-- CUSTOM_START -->` / `<!-- CUSTOM_END -->`)
2. Preserve custom sections during regeneration
3. Log preserved sections in SPRINT-LOG.md

### Rule 3: Validation Before Write

All generated artifacts must pass validation:

| Artifact | Validation |
|----------|------------|
| robots.txt | Syntax check |
| sitemap.xml | Valid XML syntax |
| schema.jsonld | Valid JSON-LD syntax |
| ai-plugin.json | Valid JSON, required fields present |
| openapi.yaml | Valid OpenAPI 3.0+ schema |

### Rule 4: Merge with Existing

For OpenAPI specs:

1. Parse existing spec if present
2. Detect new/removed endpoints
3. Merge schemas intelligently
4. Preserve manually-added documentation

---

## Security Considerations

### robots.txt

- **NEVER** expose sensitive paths (admin, internal APIs)
- Default to restrictive crawling
- Explicitly allow only public, AI-friendly paths

### ai-plugin.json

- Validate auth configuration matches implementation
- **NEVER** include secrets in manifest
- Use environment variables for sensitive URLs
- Verify `api.url` points to valid, public OpenAPI spec

### MCP Server

- Implement authentication for production use
- Rate limit tool calls
- Log all interactions for auditing
- Validate input parameters

### OpenAPI Spec

- Mark sensitive endpoints with appropriate security schemes
- Document authentication requirements
- Never expose internal/admin endpoints

---

## Commands

| Command | Description |
|---------|-------------|
| `/ai-discover-init` | Initialize AI discoverability, detect project type, configure metadata |
| `/ai-discover-generate` | Generate/update all enabled artifacts |
| `/ai-discover-status` | Show current status, detect needed updates |

---

## Checklist Items

When AI Discoverability is enabled, add to implementation checklist:

```markdown
### AI Discoverability Checklist

- [ ] CHK-AI01: Project type detected/configured correctly
- [ ] CHK-AI02: Base URL and metadata configured
- [ ] CHK-AI03: Web artifacts generated (if web/hybrid)
- [ ] CHK-AI04: API artifacts generated (if api/hybrid)
- [ ] CHK-AI05: MCP server scaffolded (if mcp.enabled)
- [ ] CHK-AI06: All artifacts validated
- [ ] CHK-AI07: Sensitive paths excluded
- [ ] CHK-AI08: Maintenance triggers configured
```

---

## Related Policies

- [POLICY-Vibe-Sprint.md](./POLICY-Vibe-Sprint.md) - Sprint execution rules
- [POLICY-Global-Scheduler.md](./POLICY-Global-Scheduler.md) - Scheduler workflow
- [POLICY-AI-Context-Management.md](./POLICY-AI-Context-Management.md) - Context management

---

*Version 1.0 - Part of Sprint Management Framework*
