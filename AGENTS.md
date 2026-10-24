# Contributor and coding-agent instructions

## Current scope

The project owner has approved Phase 2 and the standalone CA/PKCS#12 increment after reporting successful authorized access, empty-allowlist denial and restored access. Read README.md, ARCHITECTURE.md, SECURITY.md, ROADMAP.md, docs/research.md and docs/phase-2-results.md before changes. Continue Phase 2 in small increments. An explicit request-scoped, read-only Pangolin connectivity check is implemented in dev.4, with selected-resource read-only inspection in dev.5; keep remote writes gated. The owner has also approved the dev.6 local expiry/reminder, guided replacement and ZIP-delivery increment. Core API permission supports opt-in persistent expiry notifications and, since dev.9, startup external-URL discovery when no override is configured; remote Pangolin writes remain gated. The owner has approved dev.7 named Safari profile downloads with actual expiry labels, password omission and the same one-use export controls. The owner has approved dev.8 enrollment/filename simplification, configuration labels and setup/testing guidance; the owner subsequently authorized verified current-HA-administrator setup without ID copying and a combined collapsible administration flow in dev.10. This setup is opt-in, HTTPS-only, limited to an empty installation and requires Core-verified human administrator status plus an explicit selection save. Preserve existing configured/recovery authorization; never allow an unverified first visitor to claim access. The owner has approved dev.9 external-URL naming/discovery with a manual override and hidden-by-default read-only diagnostics. No remote CA-trust automation is implemented by that scope. Certificate management stays default-off and requires an HTTPS origin plus explicit creation actions. Broader E1 checks remain tracked; do not claim full acceptance from these three results. No live Pangolin trust or remote-access changes are authorized by standalone certificate testing. Phase 3 still requires a successful POC and owner review. Keep research conclusions distinct from real integration results.

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
