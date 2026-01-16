# AI Discoverability Artifacts

Detailed documentation for each AI discoverability artifact.

## robots.txt

**Purpose**: Guide search engine and AI crawlers on what to index.

**Location**: /robots.txt (root of web-accessible directory)

**When to Use**: All web-accessible projects

**Structure**:
```
User-agent: *
Allow: /
Disallow: /private/
Disallow: /admin/
Disallow: /api/internal/

# AI-specific guidance
User-agent: GPTBot
Allow: /docs/
Allow: /api/

User-agent: Claude-Web
Allow: /

# Sitemap location
Sitemap: https://example.com/sitemap.xml
```

**Best Practices**:
- Allow documentation and public APIs
- Disallow sensitive paths
- Include sitemap reference
- Consider AI-specific user agents

---

## sitemap.xml

**Purpose**: Help search engines discover and index content.

**Location**: /sitemap.xml or /public/sitemap.xml

**When to Use**: Web applications with multiple pages

**Structure**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/docs/</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

**Best Practices**:
- Include all public pages
- Set accurate lastmod dates
- Prioritize important pages
- Keep under 50MB / 50,000 URLs

---

## schema.org Markup

**Purpose**: Provide semantic context for search engines and AI.

**Location**: Embedded in HTML or as JSON-LD

**When to Use**: Web pages, documentation sites

**Common Types**:

### SoftwareApplication
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Project Name",
  "description": "Project description",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cross-platform",
  "url": "https://example.com",
  "author": {
    "@type": "Organization",
    "name": "Organization Name"
  }
}
```

### APIReference
```json
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "API Name",
  "description": "API description",
  "documentation": "https://example.com/docs",
  "provider": {
    "@type": "Organization",
    "name": "Provider Name"
  }
}
```

### TechArticle (for docs)
```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Article Title",
  "description": "Article description",
  "author": {"@type": "Person", "name": "Author"},
  "datePublished": "2024-01-15"
}
```

---

## ai-plugin.json

**Purpose**: Configure AI plugin protocol for ChatGPT and similar.

**Location**: /.well-known/ai-plugin.json

**When to Use**: APIs that want AI assistant integration

**Structure**:
```json
{
  "schema_version": "v1",
  "name_for_human": "Project Name",
  "name_for_model": "project_name",
  "description_for_human": "Human-readable description",
  "description_for_model": "Detailed description for AI model",
  "auth": {
    "type": "none"
  },
  "api": {
    "type": "openapi",
    "url": "https://example.com/openapi.yaml"
  },
  "logo_url": "https://example.com/logo.png",
  "contact_email": "support@example.com",
  "legal_info_url": "https://example.com/legal"
}
```

**Auth Types**:
- `none`: No authentication
- `user_http`: User provides API key
- `service_http`: Service-level auth
- `oauth`: OAuth flow

---

## openapi.yaml

**Purpose**: Document API for AI tools and developers.

**Location**: /openapi.yaml or /docs/openapi.yaml

**When to Use**: REST APIs, backend services

**Structure**:
```yaml
openapi: 3.0.3
info:
  title: API Name
  description: API description for AI and developers
  version: 1.0.0
  contact:
    email: api@example.com

servers:
  - url: https://api.example.com/v1
    description: Production

paths:
  /resource:
    get:
      summary: Get resources
      description: Detailed description for AI understanding
      operationId: getResources
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ResourceList'

components:
  schemas:
    ResourceList:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: '#/components/schemas/Resource'
    Resource:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
```

**Best Practices**:
- Use clear, descriptive summaries
- Include detailed descriptions for AI
- Document all parameters
- Provide example values

---

## MCP Server

**Purpose**: Enable direct AI assistant integration via Model Context Protocol.

**Location**: /mcp-server/ directory

**When to Use**: Projects wanting deep Claude/AI integration

**Components**:

### Server Entry Point
```typescript
// mcp-server/index.ts
import { Server } from "@modelcontextprotocol/sdk/server";

const server = new Server({
  name: "project-name",
  version: "1.0.0"
});

// Register tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "get_data",
      description: "Retrieve data from the system",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" }
        }
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler("tools/call", async (request) => {
  // Implementation
});

server.connect();
```

### Configuration
```json
// .mcp.json
{
  "mcp_servers": {
    "project-name": {
      "command": "node",
      "args": ["mcp-server/index.js"],
      "env": {}
    }
  }
}
```

**MCP Capabilities**:
- **Tools**: Actions the AI can perform
- **Resources**: Data the AI can access
- **Prompts**: Pre-defined prompt templates

---

## Generation Priority

When generating artifacts, follow this priority:

1. **Always Generate**:
   - robots.txt (all projects)

2. **Web Apps**:
   - sitemap.xml
   - schema.org markup

3. **APIs**:
   - openapi.yaml
   - ai-plugin.json

4. **Advanced Integration**:
   - MCP server scaffold

---

## Maintenance

### Update Frequency

| Artifact | Update When |
|----------|-------------|
| robots.txt | Route changes, new sections |
| sitemap.xml | New pages added |
| schema.org | Content changes |
| openapi.yaml | API changes |
| ai-plugin.json | Rarely (config changes) |
| MCP Server | Feature additions |

### Validation

- robots.txt: Google Search Console
- sitemap.xml: XML validators, Search Console
- schema.org: Google Rich Results Test
- openapi.yaml: Swagger Editor, Spectral
- ai-plugin.json: Manual testing with AI
