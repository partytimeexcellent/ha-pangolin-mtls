# Contributor and coding-agent instructions

## Current scope

The project owner has approved Phase 2. The first ingress-only prototype is implemented; real Supervisor authorization acceptance is pending. Read README.md, ARCHITECTURE.md, SECURITY.md, ROADMAP.md, docs/research.md and docs/phase-2-results.md before changes. Continue Phase 2 in small increments. Keep signing disabled until ingress authorization is validated on the actual test installation. Phase 3 still requires a successful POC and owner review. Keep research conclusions distinct from real integration results.

## Non-negotiable design constraints

- Production is one Home Assistant Supervisor-managed app. No required extra container, Compose stack, CA service, privileged mode, host network or Docker socket.
- Use only supported Pangolin integration APIs. Verify route method, schema and permissions against a pinned upstream source and the target instance. Do not use dashboard session endpoints or modify its database.
- Never transmit CA private keys to Pangolin, commit credentials, log secrets, or invent client installation behavior.
- HA authentication stays enabled. Ingress identity must be authorized explicitly before issuance/export/restore/API changes. Reject missing identity and non-ingress peers.
- Administrative retirement is not TLS revocation. Never claim a blocked device without scoped, recorded enforcement evidence. Never delete the final trusted CA to block access: Pangolin disables mTLS in that case.
- Preserve unrelated resources, targets, auth methods, CA entries and shared policies. Ambiguous writes require reconciliation, not blind retries.
- Persist state only under /data. Use restrictive ownership and permissions; do not call them encryption. Document automatic-unlock and backup threats honestly.
- Temporary exports expire and are single-use; downloads do not prove installation. Keep local enrollment and mTLS bootstrap distinct.

## Workflow and verification

Work in small focused changes with meaningful tests and docs. Do not implement an entire phase in one pass. No live Pangolin mutation, trust change or deployment is authorized merely by writing a test plan. Use isolated fixtures/mocks by default and obtain the project owner's specific test-environment authorization before changing remote infrastructure.

After approval, lock runtime/dependencies, use structured input validation, migration safety, OpenSSL argument arrays, and bounded network/process operations. Test both architectures and real ingress paths before making compatibility claims. Follow docs/validation-plan.md; record actual versions, date, outcome and sanitized evidence. Do not include real keys, tokens, passwords, recovery archives or identities in fixtures. Do not weaken verification to make a test pass.

Update evidence when upstream behavior changes. Keep phase gates intact, and report untested assumptions explicitly. Prefer supported manual setup over undocumented automation when capabilities are missing. No delegation or subagents are required by these instructions.
