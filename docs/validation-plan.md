# Validation and experiment plan

This document defines the experiment plan; actual scoped results are recorded in [phase-2-results.md](phase-2-results.md). Phase 1 did documentation and source inspection only. Prefer an approved isolated environment for live tests; the owner has authorized limited manual checks using a separate test resource in their production environment. Broader coverage remains pending. Public owner-reported results are restricted to sanitized pass/fail under the owner’s publication preference; keep detailed versions and environment information in the private conversation unless separately authorized.

## Phase 2 blocking experiments

### E1 — Supervisor ingress and authorization

Run the minimal app on HA OS. Observe socket peer, ingress prefix, origin and trusted user-identity headers without logging cookies/tokens. Test administrator allowlist match, ordinary HA user, absent identity, forged identity header, wrong peer, and another app calling directly. All credential actions must reject unauthorized cases. If the trusted user identifier is not reliably available, stop and design a supported authorization mechanism; do not use a first-visitor setup claim.

Exercise nested ingress paths, reloads, CSS/JS assets, APIs, file downloads and CSRF/origin handling in the real HA iframe. No request may escape to root `/api` or accept arbitrary external prefixes. Verify a local health check can work without opening a general authorization bypass. Repeat on the claimed Supervisor baseline.

### E2 — PKI and Apple package format

Generate only disposable test credentials. Inspect CA/leaf extensions, dates, RSA key size, signature, random serial uniqueness, issuer bounds, private/public key match and SHA-256 fingerprint. Verify chain and clientAuth purpose; reject unrelated CA, wrong EKU, malformed chain, expired/not-yet-valid identities and wrong export passwords. Exercise current encrypted PKCS#12 profile on real iPhone, iPad and Mac. Record OpenSSL algorithms and iteration count. Do not automatically enable legacy crypto if import fails; investigate and review the smallest compatible alternative.

Acceptance: correct identities import without trust-bypass settings, incorrect password fails, package contains no CA private key, and raw leaf key/temp packages disappear at intended lifecycle points. Verify persistence and permissions after app restart.

### E3 — Supported Pangolin API contract

Use Pangolin 1.25.1 plus each later claimed release. Enable its integration API, capture a sanitized OpenAPI contract, and create a least-privilege organization key. Prove reads and writes with minimal grants; root-only org discovery must fail with the organization key and the app must remain usable through supplied org ID. Verify mTLS upload/list/delete and enable fields against the instance. Missing routes or grants must have actionable diagnostics without token leakage.

Use a disposable hostname/site/resource. Confirm uploads are public PEM only, CA fingerprint deduplication, effective inline policy behavior and refusal of shared-policy automation. Inventory conflicting hostnames/redirects. Do not assume a 200 response means the edge applied the configuration.

### E4 — Safe provisioning and recovery

Interrupt at every boundary: before create, after server commit but before response, after CA upload, before mTLS enable, before target attach and during activation. Restart the app and Pangolin. Repeat the setup action concurrently. Assert one intended resource/target/CA binding, no unknown-object deletion, and no target exposed before mTLS is confirmed. Ambiguous ownership must stop instead of duplicating or adopting silently.

Verify `enabled: false`/other containment controls actually prevent backend access on the deployed edge. Inject 401, 403, 404, 429, 5xx, malformed success responses, DNS failures, timeouts and inconsistent reads. Preserve unrelated fields and detect concurrent external changes. Confirm cancellation never removes the last CA or silently turns mTLS off.

### E5 — Actual TLS and application behavior

Use fresh TLS 1.2 and 1.3 connections with correct SNI against the public resource: no certificate, valid enrolled leaf, unrelated issuer, invalid purpose, expired leaf and not-yet-valid leaf. Negative cases must fail before reaching Core. Positive case must still require normal HA login. Verify alternate paths, redirects, IPv4/IPv6 and all active edge nodes. Probe after configuration propagation and record timestamps.

Test a real iOS/iPadOS App Store build: manual import at onboarding and per-server settings, HA login, dashboard, persistent WebSocket, media, foreground/background updates, app restart and certificate replacement. Record failures for widgets, extensions, notifications and shortcuts separately; exclude unsupported features from compatibility claims. A curl success is not an iOS acceptance result. Test macOS Safari and Companion independently.

### E6 — Enrollment and shared-CA rotation

Enroll locally with no exception on the public mTLS hostname. Verify token expiry boundary, exactly one winner under concurrent redemption, clock rollback handling, token invalidation after restart/restore, interrupted download behavior and temporary export cleanup. Test CSRF, link scanning/prefetch, browser cache, referrer leakage and sanitized logs. QR codes must contain neither keys nor an HA ingress session secret.

Rotate A to B with overlapping trust; prove B accepted before removing A. Remove A while retaining B, then test an A leaf and B leaf on every edge. Test existing HTTP keepalive, WebSocket, HTTP/2 connections and TLS session tickets/resumption. Record whether old connections survive and how an operator terminates them; do not call a single fresh-handshake rejection “immediate session revocation”. Attempt final-CA deletion only on a disposable fixture to demonstrate Pangolin behavior and verify the app prevents it.

## Optional architecture experiment

### E7 — Independent per-device CAs

Trust two independent roots A and B, each signing one device; do not trust a common parent. Keep an additional tested non-issuing sentinel trust anchor if exploring last-device removal, with no retained signing key. Verify removing A rejects A's fresh/resumed connections while B still works. Check 20-entry capacity, overlapping renewal generations, edge propagation and existing-session survival. A sentinel strategy is not approved until tested; resource disable is the preferred emergency containment candidate.

Compare complexity and capacity with the shared-CA default. If adopted, impose a conservative device cap leaving rotation headroom (for example 8 active devices if each may need two generations), account for every other trust entry, and document that it is trust removal rather than CRL revocation.

## Required automated coverage during implementation

| Layer | Required cases |
| --- | --- |
| PKI | CA/leaf generation; chain/purpose verification; invalid and expired certificates; serial uniqueness; P12 encryption/key match; lifetime validation; renewal with new key; rotation overlap |
| State | Migrations; interrupted jobs; multiple certificate history; restart persistence; permissions; concurrent mutations |
| Enrollment | Expiry; replay; atomic concurrent redemption; failed/interrupted streaming; cleanup; restore/restart invalidation |
| Authorization | No ingress, forged peer/headers, missing/wrong user, non-admin user, CSRF, wrong origin/content type, rate limits |
| Network | SSRF/rebinding and IPv6 edge cases; redirect credential stripping; bounds/timeouts; API response validation and grant failures |
| Provisioning | Timeout after successful upstream write; idempotent reconciliation; duplicate prevention; shared policy refusal; final-CA protection; same-host conflicts |
| Backup | Cold Supervisor backup; standalone encrypted recovery; wrong password; tampering; corrupted schema/keys; issuer/key match; restore staging and rollback |
| Browser | Real ingress prefix; refresh/navigation; download behavior; escaped hostile device names; accessible keyboard flow |
| Security/CI | Dependency and container scans; secret scanning; lockfile; both architectures; untrusted PR workflow permissions |

## Release acceptance and development environment

After Phase 1 approval, create a reproducible harness with a pinned Node toolchain, lockfile, mock API fixtures, disposable certificate fixtures and a development-only real Pangolin stack pinned to the inspected release. A dev Compose stack is acceptable and must never be the production installation method. Use a Supervisor development/test instance for ingress and architecture checks; mocks cannot certify those.

Use cold backup/restore to a second isolated installation, compare database and CA identity, ensure exports/tokens are not resurrected, and verify existing legitimate leaf identities still work only when their issuer remains trusted. Test app downgrade refusal for incompatible schemas and migration rollback from a known backup. Run acceptance on native amd64/aarch64 where practical, with emulated builds as supplemental evidence.

Every result must state what was observed and its limits. No “enrolled”, “revoked”, “blocked”, “encrypted at rest”, “macOS compatible”, or “production ready” claims may outrun that evidence.
