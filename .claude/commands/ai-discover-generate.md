---
description: Generate or update AI discoverability artifacts
---

# /ai-discover-generate - Generate AI Discoverability Artifacts

Generates or regenerates AI discoverability artifacts based on configuration and current project state.

## Usage

```
/ai-discover-generate [--artifact NAME] [--force] [--dry-run]
```

**Parameters:**
- `--artifact`: Generate only specific artifact (robots, sitemap, schema, plugin, openapi, mcp)
- `--force`: Regenerate even if no changes detected
- `--dry-run`: Preview changes without writing files

## Prerequisites

- AI Discoverability initialized (`ai_discoverability.enabled: true`)
- Required metadata configured (base_url, description)

## When to Use

- After `/ai-discover-init` (automatically called)
- When project structure changes (new routes, pages)
- During sprint completion (if maintenance.on_sprint_complete)
- Manually when artifacts need updating

---

## Execution Steps

### Step 1: Load and Validate Configuration

```python
config = load_config("Sprints/sprint.config.yaml")

if not config.ai_discoverability.enabled:
    error("AI Discoverability not enabled. Run /ai-discover-init first.")
    return

# Validate required fields
required = ["metadata.base_url", "metadata.description"]
missing = [f for f in required if not get_nested(config, f)]
if missing:
    error(f"Missing required fields: {missing}")
    return
```

---

### Step 2: Determine Artifacts to Generate

```python
project_type = config.ai_discoverability.project_type
artifacts = config.ai_discoverability.artifacts

to_generate = []

# Web artifacts
if project_type in ["web", "hybrid"]:
    if artifacts.robots_txt:
        to_generate.append("robots_txt")
    if artifacts.sitemap_xml:
        to_generate.append("sitemap_xml")
    if artifacts.schema_org:
        to_generate.append("schema_org")

# API artifacts
if project_type in ["api", "hybrid"]:
    if artifacts.ai_plugin_json:
        to_generate.append("ai_plugin_json")
    if artifacts.openapi_spec:
        to_generate.append("openapi_spec")

# MCP server
if config.ai_discoverability.mcp.enabled and artifacts.mcp_server:
    to_generate.append("mcp_server")

# Filter if specific artifact requested
if artifact_arg:
    to_generate = [a for a in to_generate if artifact_arg in a]
```

---

### Step 3: Backup Existing Artifacts

```python
backups = {}

for artifact in to_generate:
    path = get_artifact_path(artifact, config)
    if path.exists():
        backup_path = path.with_suffix(path.suffix + ".backup")
        copy_file(path, backup_path)
        backups[artifact] = backup_path
        log(f"Backed up: {path} -> {backup_path}")
```

---

### Step 4: Generate Each Artifact

#### robots.txt (Web/Hybrid)

```python
def generate_robots_txt():
    template = load_template("ai-discoverability/robots-txt-template.md")

    # Detect sensitive paths
    sensitive = detect_sensitive_paths(project_root)

    # Preserve custom section from existing file
    custom_section = ""
    if existing_file.exists():
        custom_section = extract_between_markers(
            existing_file.read_text(),
            "<!-- CUSTOM_START -->",
            "<!-- CUSTOM_END -->"
        )

    content = render_robots_txt(
        project_name=config.project.name,
        base_url=config.ai_discoverability.metadata.base_url,
        sensitive_paths=sensitive,
        custom_section=custom_section
    )

    output_path = project_root / config.ai_discoverability.output.web_root / "robots.txt"
    write_file(output_path, content)

    return {"path": output_path, "status": "generated"}
```

#### sitemap.xml (Web/Hybrid)

```python
def generate_sitemap_xml():
    # Scan for pages
    pages = scan_project_pages(project_root, config)

    # Calculate metadata
    for page in pages:
        page["priority"] = calculate_priority(page["depth"])
        page["changefreq"] = estimate_changefreq(page)
        page["lastmod"] = get_file_mtime(page["file"])

    # Preserve custom URLs
    custom_urls = ""
    if existing_file.exists():
        custom_urls = extract_between_markers(
            existing_file.read_text(),
            "<!-- CUSTOM_URLS_START -->",
            "<!-- CUSTOM_URLS_END -->"
        )

    content = render_sitemap_xml(
        base_url=config.ai_discoverability.metadata.base_url,
        pages=pages,
        custom_urls=custom_urls
    )

    # Validate XML
    validate_xml(content)

    output_path = project_root / config.ai_discoverability.output.web_root / "sitemap.xml"
    write_file(output_path, content)

    return {"path": output_path, "pages": len(pages)}
```

#### Schema.org JSON-LD (Web/Hybrid)

```python
def generate_schema_org():
    project_type = config.ai_discoverability.project_type

    schema = build_schema_org(
        project_name=config.project.name,
        description=config.ai_discoverability.metadata.description,
        base_url=config.ai_discoverability.metadata.base_url,
        project_type=project_type,
        version=get_project_version()
    )

    # Validate JSON-LD
    validate_jsonld(schema)

    output_path = project_root / config.ai_discoverability.output.web_root / "schema.jsonld"
    write_file(output_path, json.dumps(schema, indent=2))

    return {"path": output_path, "type": schema["@type"]}
```

#### ai-plugin.json (API/Hybrid)

```python
def generate_ai_plugin_json():
    metadata = config.ai_discoverability.metadata

    plugin = {
        "schema_version": "v1",
        "name_for_human": config.project.name[:20],
        "name_for_model": to_snake_case(config.project.name)[:50],
        "description_for_human": metadata.description[:100],
        "description_for_model": metadata.description_ai or generate_ai_description(),
        "auth": build_auth_config(metadata.auth_type),
        "api": {
            "type": "openapi",
            "url": f"{metadata.base_url}/.well-known/openapi.yaml"
        },
        "logo_url": f"{metadata.base_url}/logo.png",
        "contact_email": metadata.contact_email,
        "legal_info_url": f"{metadata.base_url}/legal"
    }

    # Validate JSON
    validate_json(json.dumps(plugin))

    output_path = project_root / config.ai_discoverability.output.well_known / "ai-plugin.json"
    write_file(output_path, json.dumps(plugin, indent=2))

    return {"path": output_path}
```

#### OpenAPI Spec (API/Hybrid)

```python
def generate_openapi_spec():
    # Detect endpoints from project
    endpoints = detect_api_endpoints(project_root)

    # Extract schemas from types
    schemas = extract_type_schemas(project_root, config)

    # Load existing spec for merging
    existing_spec = None
    openapi_path = project_root / config.ai_discoverability.output.api_docs / "openapi.yaml"
    if openapi_path.exists():
        existing_spec = yaml.safe_load(openapi_path.read_text())

    # Merge with existing (preserve docs)
    if existing_spec:
        endpoints = merge_endpoints(endpoints, existing_spec)
        schemas = merge_schemas(schemas, existing_spec.get("components", {}).get("schemas", {}))

    spec = build_openapi_spec(
        project_name=config.project.name,
        description=config.ai_discoverability.metadata.description,
        version=config.ai_discoverability.metadata.api_version,
        base_url=config.ai_discoverability.metadata.base_url,
        endpoints=endpoints,
        schemas=schemas
    )

    # Validate OpenAPI
    validate_openapi(spec)

    # Write to api_docs and well_known
    write_file(openapi_path, yaml.dump(spec))
    well_known_path = project_root / config.ai_discoverability.output.well_known / "openapi.yaml"
    write_file(well_known_path, yaml.dump(spec))

    return {"path": openapi_path, "endpoints": len(endpoints)}
```

#### MCP Server (when enabled)

```python
def generate_mcp_server():
    mcp_config = config.ai_discoverability.mcp
    output_dir = project_root / config.ai_discoverability.output.mcp_server

    # Auto-detect tools if not defined
    tools = mcp_config.tools
    if not tools:
        tools = auto_detect_tools(project_root, config)

    # Generate each file from template
    files = [
        "package.json",
        "tsconfig.json",
        "src/index.ts",
        "src/server.ts",
        "src/tools/index.ts",
        "src/types.ts",
        "README.md"
    ]

    for file in files:
        template = load_template(f"ai-discoverability/mcp-server-template.md#{file}")
        content = render_mcp_file(template, mcp_config, tools)
        file_path = output_dir / file
        file_path.parent.mkdir(parents=True, exist_ok=True)
        write_file(file_path, content)

    return {"path": output_dir, "tools": len(tools), "files": len(files)}
```

---

### Step 5: Validate All Artifacts

```python
validation_results = []

for artifact in generated_artifacts:
    result = validate_artifact(artifact)
    validation_results.append({
        "artifact": artifact["name"],
        "valid": result["valid"],
        "errors": result.get("errors", [])
    })

# Report validation failures
failures = [r for r in validation_results if not r["valid"]]
if failures:
    warn(f"Validation failures: {len(failures)}")
    for f in failures:
        warn(f"  {f['artifact']}: {f['errors']}")
```

---

### Step 6: Generate Report

---

## Output Example

```
======================================================
  AI Discoverability Artifacts Generated
======================================================

Project Type: hybrid
Base URL: https://example.com

Generated Artifacts:
------------------------------------------------------

Web Artifacts:
  robots.txt
    Path:    public/robots.txt
    Status:  Generated
    Custom:  Preserved 3 custom rules

  sitemap.xml
    Path:    public/sitemap.xml
    Status:  Generated
    Pages:   24 URLs indexed
    Note:    API docs included

  schema.jsonld
    Path:    public/schema.jsonld
    Status:  Generated
    Type:    WebApplication + WebAPI

API Artifacts:
  ai-plugin.json
    Path:    .well-known/ai-plugin.json
    Status:  Generated

  openapi.yaml
    Path:    docs/api/openapi.yaml
    Also:    .well-known/openapi.yaml
    Status:  Updated (merged with existing)
    Endpoints: 12 documented
    Schemas:   8 defined

MCP Server:
  Path:      mcp-server/
  Status:    Scaffolded
  Tools:     5 tools defined
  Files:     7 files created

------------------------------------------------------
Validation Results:
------------------------------------------------------
  [x] robots.txt:     Valid
  [x] sitemap.xml:    Valid XML
  [x] schema.jsonld:  Valid JSON-LD
  [x] ai-plugin.json: Valid JSON
  [x] openapi.yaml:   Valid OpenAPI 3.0

------------------------------------------------------
Backups Created:
------------------------------------------------------
  - public/robots.txt.backup
  - docs/api/openapi.yaml.backup

======================================================
Next Steps:
======================================================
1. Review generated artifacts
2. Test ai-plugin at: https://example.com/.well-known/ai-plugin.json
3. Validate sitemap at: https://search.google.com/search-console
4. Build MCP server: cd mcp-server && npm install && npm run build
5. Run /ai-discover-status for full verification

======================================================
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Not enabled | Error: "Run /ai-discover-init first" |
| Missing metadata | Error: List missing required fields |
| Template not found | Error: Check templates/ai-discoverability/ |
| Validation failed | Warn, keep backup, report specific errors |
| Write permission denied | Error with path, suggest fix |
| XML/JSON parse error | Keep backup, report line/position |

---

## Dry Run Mode

When `--dry-run` is specified:

```
[DRY RUN] Would generate:
  - public/robots.txt (1.2 KB)
  - public/sitemap.xml (4.5 KB, 24 URLs)
  - public/schema.jsonld (0.8 KB)
  - .well-known/ai-plugin.json (0.5 KB)
  - docs/api/openapi.yaml (12.3 KB, 12 endpoints)

No files were modified.
```

---

## Integration Points

- **Before**: `/ai-discover-init` must be run first
- **After**: `/ai-discover-status` to verify
- **Triggered by**: `/sprint-complete` when maintenance enabled
- **Related**: `/speckit-tasks` adds artifact tasks
