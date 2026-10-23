# Security review

**Date:** 2026-10-23  
**Scope:** Read-only review of application source, authentication, database access, and deployment guidance. The database dump `database/quem.sql` was excluded. No security fixes were applied.

## Findings

### 1. Passwords are stored in plaintext and legacy weak hashes are accepted

- **Severity:** Medium
- **Confidence:** 10/10
- **Files:** `backend/src/controllers/authController.js` (lines 13-34, 190-194); `backend/src/cron/syncRobot.js` (lines 12-36)
- **Evidence:** Password verification accepts direct plaintext comparisons as well as MD5 and SHA-1. Password changes store the submitted password directly in the `senha` column, and the synchronization robot inserts the configured initial password directly into the login table.
- **Impact:** A read-only database compromise can expose reusable plaintext passwords. MD5 and SHA-1 password hashes are also unsuitable for protecting passwords against offline guessing.
- **Recommendation:** Use a dedicated password-hashing function with a modern adaptive algorithm such as Argon2id or bcrypt for new passwords, and plan a safe migration for existing plaintext and legacy hashes.

### 2. Intranet access uses unencrypted HTTP

- **Severity:** Medium
- **Confidence:** 9/10
- **Files:** `README.md` (line 140); `backend/src/server.js` (line 68)
- **Evidence:** The deployment guide instructs intranet clients to use `http://`, and the Express application listens on `0.0.0.0` without TLS configuration.
- **Impact:** A party able to observe or manipulate traffic on the network path could capture login credentials or bearer tokens and potentially reuse an active session.
- **Recommendation:** Serve remote access over HTTPS, for example by terminating TLS at an approved reverse proxy, and restrict or redirect unencrypted HTTP according to the organization's network policy.

## Validation performed

- No automated test files or test runner are configured in `backend/package.json`.
- JavaScript syntax checks passed for 11 application files.
- Smoke checks returned HTTP 200 for `/api/health` and `/SQD`.
- No application code was changed as part of this review.
