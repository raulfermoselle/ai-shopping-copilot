# Security Rules

> **TEMPLATE**: Tailor these rules to your project's specific security requirements.

## Credentials & Secrets

- Never hardcode credentials, API keys, or secrets in code
- Use environment variables or secret management services
- Never commit `.env` files or files containing secrets

## Authentication & Authorization

- Validate user permissions before performing sensitive operations
- Implement proper session management
- Use secure token handling (JWT, OAuth, etc.)

## Input Validation

- Validate and sanitize all user inputs
- Use parameterized queries to prevent SQL injection
- Escape output to prevent XSS attacks

## Data Protection

- Implement proper data isolation between users/tenants
- Use encryption for sensitive data at rest and in transit
- Follow principle of least privilege for data access

## Commits & Code

- Use conventional commits without AI markers
- Review code for security vulnerabilities before committing
- Never commit debug code or temporary security bypasses

## Logging

- Never log sensitive information (passwords, tokens, PII)
- Implement audit trails for security-relevant actions

---

## Project-Specific Rules

### Critical Safety Constraint

**THE AGENT MUST NEVER PLACE ORDERS AUTOMATICALLY.**

This is a non-negotiable safety rule. The system prepares carts for user review but stops before checkout. Any code path that could trigger a purchase without explicit user approval is a critical security violation.

### Authentication (Auchan.pt)

- Auchan.pt credentials stored in `.env` file (AUCHAN_EMAIL, AUCHAN_PASSWORD)
- `.env` is gitignored - never commit credentials
- Session cookies are ephemeral (per-browser-context)
- No credential caching beyond the session

### LLM API Keys

- Anthropic API key in `.env` (ANTHROPIC_API_KEY)
- Never log API keys or include in error messages
- LLM failures must gracefully degrade to heuristics

### Browser Automation Safety

- Never interact with payment forms or checkout confirmation buttons
- Always take screenshots before sensitive operations for audit trail
- Selector registry prevents accidental clicks on wrong elements

### Data Protection

- User shopping history stored locally in `memory/` folder
- No cloud sync of personal shopping data
- Household preferences are local JSON files only
- Screenshots may contain PII - handle appropriately

### Logging

- Never log full credentials or session tokens
- Redact email addresses in logs (show only domain)
- Product names and prices are safe to log
- Cart contents can be logged for debugging
