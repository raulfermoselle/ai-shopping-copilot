# MCP Server Setup Guide

Guide for setting up Model Context Protocol (MCP) servers for AI integration.

## What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI assistants to external tools and data sources. It enables:

- **Tools**: Actions the AI can perform
- **Resources**: Data the AI can access
- **Prompts**: Pre-defined prompt templates

## When to Use MCP

Consider MCP when:
- You want Claude to interact with your application
- You need AI access to real-time data
- You want to expose actions to AI assistants
- You need secure, controlled AI integration

## Basic MCP Server Structure

```
mcp-server/
  package.json
  tsconfig.json
  src/
    index.ts        # Server entry point
    tools/          # Tool implementations
    resources/      # Resource handlers
    prompts/        # Prompt templates
  README.md
```

## Quick Start

### 1. Initialize Project

```bash
mkdir mcp-server && cd mcp-server
npm init -y
npm install @modelcontextprotocol/sdk typescript
npm install -D @types/node ts-node
```

### 2. Configure Claude Code

Create or update .mcp.json in your project root:

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "npx",
      "args": ["ts-node", "mcp-server/src/index.ts"],
      "env": {}
    }
  }
}
```

## Key Concepts

### Tools

Tools are actions the AI can perform. Define them with:
- name: Unique identifier
- description: What the tool does
- inputSchema: JSON Schema for parameters

### Resources

Resources are data the AI can access:
- URI-based addressing
- MIME type specification
- Read-only by default

### Prompts

Prompts are pre-defined templates:
- Reusable conversation starters
- Parameterized with arguments
- Consistent AI interactions

## Security Best Practices

1. **Input Validation**: Always validate and sanitize inputs
2. **Rate Limiting**: Limit expensive operations
3. **Least Privilege**: Only expose necessary capabilities
4. **Environment Variables**: Use env vars for secrets
5. **Logging**: Log all operations for audit

## Common Patterns

### Read-Only Database Access

```typescript
// Only allow SELECT queries
function validateQuery(query) {
  if (!query.toUpperCase().startsWith("SELECT")) {
    throw new Error("Only SELECT queries allowed");
  }
}
```

### File System Access

```typescript
// Restrict to specific directories
function validatePath(path) {
  const allowed = ["/docs", "/public"];
  if (!allowed.some(dir => path.startsWith(dir))) {
    throw new Error("Path not allowed");
  }
}
```

### API Proxy

```typescript
// Proxy requests with rate limiting
const rateLimit = new Map();
function checkLimit(endpoint) {
  // Implementation
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server not starting | Check command path in .mcp.json |
| Tool not found | Verify tool is in tools/list response |
| Permission denied | Check file permissions |
| Timeout | Increase timeout or optimize operation |

## Resources

- MCP Documentation: https://modelcontextprotocol.io/
- MCP SDK: https://github.com/modelcontextprotocol/sdk
- Example Servers: https://github.com/modelcontextprotocol/servers
