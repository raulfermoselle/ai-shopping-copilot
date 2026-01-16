---
name: ai-discoverability
description: |
  Make projects discoverable and accessible to AI systems. Automatically triggers when:
  - User mentions "AI discoverability", "make discoverable", "AI artifacts"
  - Discussing robots.txt, sitemap, schema.org, OpenAPI
  - Setting up MCP server or AI plugin
  - User asks about "AI integration", "AI accessibility"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# AI Discoverability Skill

Generate artifacts that make your project discoverable and accessible to AI systems, search engines, and automation tools.

## When This Skill Activates

This skill automatically triggers when you:
- Mention "AI discoverability" or "make project discoverable"
- Discuss robots.txt, sitemap, schema.org markup
- Want to set up OpenAPI specifications
- Need MCP (Model Context Protocol) server scaffolding
- Ask about AI plugin configuration

## Artifacts Overview

| Artifact | Purpose | File |
|----------|---------|------|
| **robots.txt** | Search engine crawling guidance | /robots.txt |
| **sitemap.xml** | Content indexing for search engines | /sitemap.xml |
| **schema.org** | Semantic markup for rich results | Various |
| **ai-plugin.json** | AI plugin protocol configuration | /.well-known/ai-plugin.json |
| **openapi.yaml** | API specification for AI tools | /openapi.yaml |
| **MCP Server** | Model Context Protocol integration | /mcp-server/ |

## Quick Actions

| Action | Trigger Phrase |
|--------|----------------|
| Initialize all | "initialize AI discoverability", "setup AI artifacts" |
| Generate specific | "generate robots.txt", "create OpenAPI spec" |
| Check status | "AI discoverability status", "what artifacts exist" |
| Update artifacts | "update sitemap", "refresh OpenAPI" |

## Initialization Workflow

When initializing AI discoverability:

1. **Analyze Project**
   - Detect project type (web app, API, library, CLI)
   - Identify public endpoints
   - Find existing documentation

2. **Generate Core Artifacts**
   - robots.txt (crawling rules)
   - sitemap.xml (if web app)
   - schema.org markup (if applicable)

3. **Generate API Artifacts** (if API project)
   - openapi.yaml specification
   - ai-plugin.json configuration

4. **Scaffold MCP Server** (optional)
   - Basic MCP server structure
   - Tool definitions
   - Resource handlers

## Project Type Detection

| Indicator | Project Type | Artifacts |
|-----------|--------------|-----------|
| package.json + next/react | Web App | robots, sitemap, schema |
| package.json + express/fastify | API | robots, openapi, ai-plugin |
| pyproject.toml + fastapi/flask | API | robots, openapi, ai-plugin |
| go.mod + net/http | API | robots, openapi, ai-plugin |
| README only | Library | schema, basic robots |
| CLI tool | CLI | schema, basic robots |

## Supporting Files

- [ARTIFACTS.md](ARTIFACTS.md) - Detailed artifact documentation
- [TEMPLATES.md](TEMPLATES.md) - Generation templates
- [MCP-GUIDE.md](MCP-GUIDE.md) - MCP server setup guide

## Integration

- Works standalone or with sprint-management
- Can be part of documentation sprint
- Integrates with existing CI/CD pipelines

## Status Check

When checking status, report:

```
## AI Discoverability Status

**Project**: {name}
**Type**: {detected type}

### Artifacts

| Artifact | Status | Path | Last Updated |
|----------|--------|------|--------------|
| robots.txt | Present/Missing | /robots.txt | {date} |
| sitemap.xml | Present/Missing/N/A | /sitemap.xml | {date} |
| schema.org | Present/Missing | varies | {date} |
| openapi.yaml | Present/Missing/N/A | /openapi.yaml | {date} |
| ai-plugin.json | Present/Missing/N/A | /.well-known/ | {date} |
| MCP Server | Present/Missing | /mcp-server/ | {date} |

### Recommendations
- {recommendation 1}
- {recommendation 2}
```
