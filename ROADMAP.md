# Incremental delivery plan

Status: Phase 2 approved by the owner; certificate issuance, read-only integration inspection and initial client/edge tests implemented, October 23, 2026. Phase 3 remains gated on successful POC validation and owner review.

## Phase 1 — research and architecture

Completed: official documentation review; Pangolin 1.25.1 public API/handler/source inspection; Apple Companion development-source review; capability classification; threat model; deployment, PKI, enrollment and recovery proposal; repository layout and experiment plan.

At the end of Phase 1, live integration, installed Apple client validation, Supervisor authorization behavior, container builds and production readiness were not completed or claimed. Later scoped results are recorded under Phase 2.

Owner decisions before Phase 2:

- Approve the proposed stack and single-container management architecture with an existing connected site.
- Accept shared-CA limitations for the POC. Individual device revocation is unavailable; per-device independent CAs remain an optional prototype, not a product promise.
- Approve local authenticated enrollment with manual app import; defer public QR redemption and silent provisioning.
- Accept automatic startup's at-rest limitations, with encrypted recovery export required before release.
- Select an isolated HA/Pangolin test environment and Apple devices for acceptance; do not test destructive trust changes against a household's only working remote path.

Phase 1 approval was provided by the owner with “proceed.” The architecture's experiments remain acceptance gates rather than claims of completed validation.

## Phase 2 — minimal proof of concept

Current progress: version `0.1.0-dev.5` includes default-off CA/leaf issuance and single-use encrypted PKCS#12 downloads, plus read-only Pangolin connection and selected-resource inspection. Local typecheck/build, 40 automated tests and both native container build/runtime jobs pass. Sanitized owner-reported PASS results cover selected ingress cases, initial client import/basic operation/cellular checks and app restart persistence. Fresh-connection missing-certificate and unrelated-CA rejection tests passed. See [recorded results](docs/phase-2-results.md) for scope and evidence. Manual Pangolin dashboard configuration was used for the separate test resource; the app has no remote write/activation workflow. Broader E1–E6 coverage, isolated backup restoration, rotation/session behavior and full release acceptance remain pending.

Deliver in small reviewable commits:

1. Add reproducible local toolchain, lockfile, minimal CI and HA packaging; build/run on amd64 and aarch64. Keep external services mocked by default.
2. Establish ingress UI, subpath-safe API/downloads, peer validation and explicit administrator authorization. Block signing until negative authorization tests pass.
3. Implement CA generation, one leaf, password-protected PKCS#12 export, cleanup and restart persistence with tests.
4. Add a read-only capability adapter and a minimal reviewed mTLS configuration path, using only verified integration routes. A manual Pangolin dashboard setup is an acceptable fallback if instance capabilities differ; document it without private endpoints.
5. Run the real iOS/iPadOS enrollment and Pangolin handshake experiments. Test macOS separately. Capture versioned results and limitations.

Exit: experiments E1–E6 in [validation-plan.md](docs/validation-plan.md) pass for the claimed baseline, no final-CA deletion path, no unintended exposure during interruption, and successful iOS Companion login plus WebSocket usage. Any failing critical assumption changes the architecture before Phase 3. Phase 3 requires a successful POC and owner review.

## Phase 3 — application implementation

Implement in independent increments: durable operation journal/reconciliation; inventory and history; renewal/replacement; CA rotation; enrollment token state machine; encrypted backup/restore; dashboard pages; diagnostics and audit retention. Each increment includes appropriate tests and updated user instructions. Keep edge enforcement separate from administrative state everywhere.

Do not add “revoke device” wording unless a tested enforcement mechanism exists. Consider per-device independent CA mode only after E7 passes and its 20-entry capacity/rotation tradeoffs are accepted. Do not trust a common parent root in such a mode.

## Phase 4 — release preparation

- Run security review and the complete acceptance matrix, including restore and long-running WebSocket/session tests.
- Build native amd64/aarch64 images, scan dependencies/images, produce SBOMs, verify provenance and sign release images. CI must never publish on untrusted pull requests with secrets.
- Add GitHub Actions tests, schema checks, container builds and vulnerability scans. Pin actions to reviewed commits; use least-privilege workflow permissions.
- Add final `repository.yaml`, app manifest, Dockerfile/build metadata, AppArmor, documentation tab, translations and changelog; test installation from the actual custom repository.
- Select SPDX license and include license/third-party notices, including for any bundled upstream binary. Choose repository owner, stable URL, image registry, maintainer and private security channel.
- Publish an experimental beta with a tested-version matrix. Document known limits and migration/rollback paths. Never label this security-sensitive software production-ready from unit tests alone.

Deferred: public enrollment service, automatic installation into clients, MDM/SCEP/ACME, external PKI, Core integration, server-wide organization discovery, and embedded Newt. None may introduce another required production container.
