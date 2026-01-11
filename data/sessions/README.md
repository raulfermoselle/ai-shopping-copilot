# Session Storage

This directory contains persisted Coordinator agent sessions.

## Structure

Each session is stored as a JSON file:
```
{sessionId}.json
```

## File Format

Sessions are serialized using `serializeSession()` from `src/agents/coordinator/persistence.ts`.

- All Date objects are converted to ISO 8601 strings
- Non-serializable objects (Playwright Page, functions) are excluded
- Worker results and review packs are stored as plain JSON objects

## Retention Policy

Sessions are retained until explicitly deleted or cleaned up:
- Use `cleanupOldSessions(maxAgeMs)` to delete sessions older than a specified age
- Only completed or cancelled sessions are eligible for cleanup
- In-progress sessions are never deleted automatically

## Recovery

Interrupted sessions can be recovered using:
```typescript
import { loadSession, canResume, getResumePoint } from '@/agents/coordinator/persistence';

const session = await loadSession(sessionId);
if (session && canResume(session)) {
  const resumePoint = getResumePoint(session);
  // Resume from resumePoint
}
```

## Privacy

Session files contain sensitive data:
- Auchan username (email)
- Household ID
- Shopping cart contents
- Order history references

**Never commit session files to version control.**

## Maintenance

To clean up old sessions:
```typescript
import { cleanupOldSessions } from '@/agents/coordinator/persistence';

// Delete sessions older than 30 days
const maxAge = 30 * 24 * 60 * 60 * 1000;
const deletedCount = await cleanupOldSessions(maxAge);
console.log(`Deleted ${deletedCount} old sessions`);
```
