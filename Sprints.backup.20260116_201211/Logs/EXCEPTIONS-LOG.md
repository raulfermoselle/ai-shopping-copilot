# Exceptions Log - Deadlock & Error Tracking

> **Documents blockers, deadlocks, and exceptions requiring human intervention**

---

## Exception Summary

| Code | Category | Count | Status |
|------|----------|-------|--------|
| DL001 | Task Deadlock | 0 | OK |
| DL002 | Sprint Deadlock | 0 | OK |
| CTX001 | Context Exhausted | 0 | OK |
| API001 | API Unavailable | 0 | OK |
| AUTH001 | Auth Failure | 0 | OK |
| NET001 | Network Error | 0 | OK |

---

## Active Exceptions

*No active exceptions*

---

## Exception Categories

| Code | Category | Auto-Action | Human Required |
|------|----------|-------------|----------------|
| DL001 | Task deadlock (3+ attempts) | Skip task, log | Review needed |
| DL002 | Sprint deadlock (3+ tasks blocked) | Skip sprint, log | Review needed |
| CTX001 | Context exhausted (3x resets on same task) | Reset, retry | If persistent |
| API001 | API unavailable | Retry later | If persistent |
| AUTH001 | Auth failure | Skip platform | Credentials needed |
| NET001 | Network error | Retry 3x | If persistent |

---

## Exception Entry Template

```markdown
### EXC-XXXX: [Title]

**Code**: [DL001/DL002/CTX001/API001/AUTH001/NET001]
**Detected**: YYYY-MM-DD HH:MM
**Sprint**: [Sprint ID]
**Task**: [Task ID]
**Status**: OPEN | RESOLVED | ESCALATED

**Symptoms**:
- [ ] Same error repeated
- [ ] No file changes
- [ ] Context exhausted
- [ ] Other: [describe]

**AI Analysis**:
[AI's assessment of why progress cannot be made]

**Recommended Human Action**:
1. [Suggested action 1]
2. [Suggested action 2]

**Resolution**:
[How it was resolved, if resolved]
```

---

## Resolved Exceptions

*No resolved exceptions yet*

---

## Deadlock Prevention Tips

### For AI:
1. Break complex tasks into smaller steps
2. Document decisions as you make them
3. Follow existing code patterns
4. If stuck, try a different approach before giving up

### For Humans:
1. Review blocked tasks in sprint logs
2. Provide clearer requirements if ambiguous
3. Update policies if patterns emerge
4. Consider splitting complex sprints

---

*Last Updated: 2026-01-10*
