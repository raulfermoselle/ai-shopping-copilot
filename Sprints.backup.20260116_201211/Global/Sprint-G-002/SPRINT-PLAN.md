# Sprint-G-002: Auchan.pt Login Automation

**Module:** Global
**Type:** Implementation
**Status:** In Progress
**Started:** 2026-01-11
**Dependencies:** Sprint-G-001 (Complete)

---

## Sprint Goal

Implement secure, resilient login automation for Auchan.pt with:
- Credential handling via environment variables
- Session persistence for reuse across runs
- Error recovery for common login failures
- Screenshot capture at key steps

---

## Success Criteria

- [ ] Login tool successfully authenticates on Auchan.pt
- [ ] Credentials loaded securely from environment variables
- [ ] Session state can be saved and restored
- [ ] Login failures produce clear, actionable errors
- [ ] E2E test validates login flow structure

---

## Task Breakdown

### T001: Extend Configuration for Credentials
**Estimate:** Small
**Description:** Add environment variable support for Auchan credentials (AUCHAN_EMAIL, AUCHAN_PASSWORD). Credentials must never be logged or committed.

**Acceptance:**
- Config system reads AUCHAN_EMAIL and AUCHAN_PASSWORD from env
- Credentials are redacted in logging
- Missing credentials produce clear error message

### T002: Create LoginTool Class
**Estimate:** Medium
**Description:** Create `src/tools/login.ts` extending BaseTool with the login automation logic.

**Acceptance:**
- LoginTool extends BaseTool<LoginInput, LoginResult>
- Input: email, password (optional, defaults to env)
- Output: success status, user info if available
- Proper error classification (AUTH_ERROR for invalid creds)

### T003: Implement Login Flow
**Estimate:** Medium
**Description:** Implement the Playwright automation for Auchan.pt login form.

**Acceptance:**
- Navigate to login page
- Accept cookie consent if present
- Fill email and password fields
- Submit form
- Verify successful login (check for user menu/account indicator)
- Capture screenshot after login

### T004: Implement Session Persistence
**Estimate:** Medium
**Description:** Save and restore browser storage state for session reuse.

**Acceptance:**
- Save cookies and localStorage after successful login
- Restore session state on browser launch
- Detect expired sessions and re-login
- Session file stored in configurable location

### T005: Create Login E2E Test
**Estimate:** Small
**Description:** Create E2E test that validates login flow structure without real credentials.

**Acceptance:**
- Test file: tests/login.spec.ts
- Tests login page navigation
- Tests form element presence
- Mocked login flow for CI (no real creds)

### T006: Update Documentation
**Estimate:** Small
**Description:** Update README with credential setup instructions.

**Acceptance:**
- README explains AUCHAN_EMAIL, AUCHAN_PASSWORD setup
- Security notes about credential handling
- Example .env.example file (without real values)

---

## Technical Notes

### Auchan.pt Login Flow (Expected)
1. Navigate to https://www.auchan.pt
2. Click "Entrar" or account icon
3. Fill email field
4. Fill password field
5. Click login button
6. Verify logged-in state (user name visible, or account menu accessible)

### Selectors (To Be Discovered)
These will be identified during implementation:
- Login button/link selector
- Email input selector
- Password input selector
- Submit button selector
- Logged-in indicator selector

### Cookie Consent
Auchan.pt likely has a cookie consent banner. Handle this before attempting login.

### Session Storage
Use Playwright's `storageState` feature:
- `context.storageState({ path: 'session.json' })`
- `browser.newContext({ storageState: 'session.json' })`

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Selectors change over time | Use resilient selectors (data-testid, roles, text) |
| CAPTCHA on login | Document as limitation, may need manual intervention |
| Rate limiting | Add delays between attempts, respect robot.txt |
| 2FA requirement | Document as unsupported, fail gracefully |

---

## Definition of Done

- [ ] All tasks completed
- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code reviewed (self-review minimum)
- [ ] Sprint log updated
- [ ] Committed to repository

---

*Created: 2026-01-11*
