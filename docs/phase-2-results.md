# Phase 2 validation record

Date: October 22, 2026. Increment: `0.1.0-dev.1`, ingress authorization only. The owner approved Phase 2 and clarified that only production HA is available. Limited installation of this non-signing prototype is authorized; no Pangolin trust or remote-access changes are authorized by that decision.

Owner-reported target: HA OS 18.3, Core 2026.10.1, Supervisor 2026.10.3, amd64 (`qemux86-64`), supported stable installation, local app folder `/addons`. This information is not a successful installation or ingress acceptance result. A backup is available; local recovery access must be confirmed before installation.

Source is now public in [partytimeexcellent/ha-pangolin-mtls](https://github.com/partytimeexcellent/ha-pangolin-mtls), following explicit owner authorization. GitHub Actions [run 39898052083](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39898052083) passed for implementation commit `acbc20bac6c03e406b9f7fdcd767e922bba4a18b`: test/build/audit plus native amd64 and aarch64 container builds and runtime smoke checks. This is independent of, and narrower than, actual Home Assistant ingress acceptance.

## Implemented

- One Fastify server with explicit user-ID allowlisting, real socket-peer validation and no broad proxy trust.
- Missing identity, wrong ingress path, unauthorized principal and direct peers are denied. No “first user” claim or fallback administrator mode.
- Five-minute in-memory sessions bound to user and ingress path; CSRF, expected-origin and JSON checks on POST requests; rate limits and bounded request/session storage.
- React/Vite page with relative assets/API requests; content security policy, no-store and no-referrer headers; no external scripts or fonts.
- A protected authorization-check operation that performs no external or credential mutation. Signing stays hard-disabled and no signing route exists.
- Local HA manifest, multi-stage Dockerfile, non-root serving after startup, graceful shutdown, and CI definitions for tests/audit/native container builds.

## Observed locally

Environment: macOS arm64, Node 24.22.1, npm 11.19.1. Commands and setup are in [development.md](development.md).

| Check | Result |
| --- | --- |
| TypeScript server/UI/test checks | Passed |
| Backend and production UI build | Passed |
| Automated tests | Initial 13 passed; diagnostic increment expanded coverage to 19 passing tests |
| Locked dependency audit | 0 known vulnerabilities reported at check time; not an independent security review |
| Manifest parsing/basic privilege review | Passed: two declared architectures, empty allowlist, no host ports or elevated API/network grants |
| Docker/container build | Passed on GitHub Actions; Docker remains absent from this Mac |
| Native amd64/aarch64 image/runtime | Passed on native GitHub runners, including privilege drop, private state directory and rejection of direct HTTP |
| Browser/real Supervisor ingress (E1) | Authorized access PASS; empty-allowlist denial PASS; access restoration PASS (owner-reported). Other E1 checks remain separately tracked. |
| Certificate, Pangolin, Apple-client experiments E2–E7 | Not run; functionality not implemented in this increment |

The test suite checks forged peer/forwarded headers, missing/non-allowlisted identity, default denial, path validation, status flags, successful protected POST, CSRF/origin/content-type failures, user/path session binding, deadline/restart invalidation, oversized/unexpected input, rate limiting, and production-asset/API path resolution. An initial test detected the static handler overriding no-store; disabling its cache header generation fixed the failure.

## Next gate

### First production check and diagnostic follow-up

The owner reports that `0.1.0-dev.1` starts without logged errors and the UI loads, but Check my access returns the generic failure message. The owner confirms using the intended public HTTPS origin. This does not establish the cause or a passed E1 result. The old UI discarded response reasons and the server did not log access-denial codes.

Increment `0.1.0-dev.2` adds fixed error codes, stage/status reporting, sanitized denial logging and a visible build version. It preserves the existing authorization boundary and keeps signing disabled. Local typecheck, production build and 19 automated tests passed. An additional isolated Chromium test using synthetic ingress forwarding confirmed a successful check for the matching origin and a visible `ORIGIN_MISMATCH` for a different configured origin. That simulation is not the owner's proxy/Supervisor path. [GitHub Actions run 39907903968](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39907903968) also passed tests/audit and both native container/runtime jobs for commit `89408b2`.

Sanitized owner-reported acceptance results, published with explicit permission:

| Check | Result |
| --- | --- |
| Authorized access | PASS |
| Denial with empty allowlist | PASS |
| Access restored after allowlist restoration | PASS |

These results do not certify the complete E1 test matrix. Certificate signing remains disabled. No environment identifiers, user IDs, credentials, tokens or detailed system information are included in this acceptance update.

Install this increment using [DOCS.md](../pangolin_access/DOCS.md), within the owner's authorized ingress-only scope. Confirm actual trusted identity forwarding, denial for wrong/missing users and non-Supervisor peers, nested assets/POST behavior, non-root operation, health and shutdown. Record versions and sanitized outcomes here. Do not record actual ingress tokens, cookies or user IDs.

Only after E1 acceptance should the next increment enable CA generation and one-device PKCS#12 export. Later increments need no fresh Phase 1 approval, but they must preserve this gate and the prohibition on unapproved remote infrastructure changes. Phase 3 is still gated on a successful full POC and owner review.

## Standalone certificate increment — 0.1.0-dev.3

After the sanitized authorized/denied/restored results above, the owner authorized implementing the standalone CA/PKCS#12 increment. Broader E1 cases remain tracked rather than silently marked complete. This increment is default-off, requires an HTTPS origin, and creates credentials only through explicit authorized dashboard actions. It cannot contact Pangolin or change existing trust/resource configuration.

Implemented: dedicated RSA-3072/SHA-256 CA; encrypted PKCS#8 signing material and automatic local unlock; strict SQLite metadata; clientAuth leaves with fresh keys and random serials; AES-256/PBKDF2/SHA-256-MAC PKCS#12 export; actor-bound hashed capabilities; five-minute memory retention; atomic single-use POST downloads; and no private-key/permanent-package endpoint. Restart/expiry/consumption invalidates exports. Client display names never enter OpenSSL command/config/subject/path values.

Local typecheck, production build and 26 automated tests passed with disposable credentials. Tests cover encrypted CA storage, CA duplicate prevention, public/private key matching, signature chains and clientAuth purpose, wrong package password, inappropriate server purpose, expired verification, distinct serials/keys, raw-input cleanup, failed OpenSSL execution, busy-operation rejection, actor binding, replay and expiry, restart invalidation, cold-copy recovery, missing/wrong unlock material and unsupported schema refusal. API tests preserve ingress/session/CSRF protections and verify default-off and HTTPS requirements. No fixture keys/passwords/tokens are committed or included in this record.

A local Chromium simulation with synthetic ingress forwarding passed explicit CA creation (no startup CA), safe display of a hostile-looking device name, hidden-by-default password, actual browser `.p12` download and mobile-width handling. This is not a real HA/iOS/Safari result. Real Apple package import, backend trust configuration, rotation, dedicated encrypted recovery export and the rest of E2–E7 remain pending.

[GitHub Actions run 39911375224](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39911375224) passed for commit `f5f5dde`: all 26 tests, typecheck/build, dependency audit, and native amd64/aarch64 image builds. Both native runtime smoke checks also passed actual disposable CA/P12 generation after privilege dropping, private state-directory checks, and direct HTTP denial. This validates the container cryptographic toolchain, not real Apple import or Pangolin enforcement.

## Read-only Pangolin increment — 0.1.0-dev.4

Implemented a request-scoped integration-key form and optional Supervisor-configured HTTPS API URL. Explicit checks read the deployed OpenAPI document, organization and the first 20 sites/domains/public resources with reported totals. No remote mutations or persisted API keys exist. The read-only contract was refreshed against pinned 1.25.2 source (see research.md); installed software version is not inferred from OpenAPI’s `v1` value. Shared-policy inspection, target reachability, write privileges and actual client-certificate handshakes remain future gates.

Local typecheck, production build and 31 automated tests passed. Added checks cover URL validation, public-address restrictions, fixed GET routes, pagination limits, response-field redaction, contract mismatch, ingress/session/CSRF gating, rejection of request-selected destinations, pinned DNS lookup, default TLS verification, credential omission on OpenAPI reads, redirects, HTTP error mapping, invalid JSON/media types and response-size limits. Transport fixtures are synthetic; production Pangolin acceptance remains pending.

A local Chromium check with synthetic ingress and disposable API responses passed form submission, hidden/cleared key input, result rendering, mobile width and absence of browser storage. A credential-free request to GitHub also exercised real public DNS pinning and verified HTTPS transport, yielding the expected upstream rejection; it did not contact production Pangolin. Dependency audit reported zero known vulnerabilities at check time.

[GitHub Actions run 39914535653](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39914535653) passed for commit `4fa768d6c69f86ac5656d49c60762affdc9c49fc`: typecheck/build, all 31 tests, dependency audit, and native amd64/aarch64 container builds and runtime smoke checks. Production Pangolin connectivity and Apple import remain unverified.

## Additional sanitized owner-reported result

| Check | Result |
| --- | --- |
| Read-only Pangolin connection check | PASS |

Published under the owner's existing permission for sanitized pass/fail results only. No resource identifier, hostname, key, identity or detailed production configuration is included.

## Selected-resource increment — 0.1.0-dev.5

Added explicit read-only resource selection and configuration inspection. The owner supplied a separate test resource and confirmed adding read permissions; no remote mutation or activation is authorized by this increment. Source/contract details and limitations are in research.md and the app setup guide. All validation below uses disposable fixtures, not the owner's resource.

Added operation-stage error diagnostics and moved Fastify error-handler registration before route/plugin setup after an API regression test showed earlier routes could retain Fastify's default error formatter. The regression verifies unexpected failures are redacted and fixed permission failures preserve the operation stage. No raw upstream text is returned.

Local typecheck/build and all 40 automated tests passed. Resource-specific fixtures cover exact identity matching, ambiguous/incomplete searches, wrong organization/hostname, shared policies, other auth/rules, existing targets/trust, hostname matches, target truncation, changed references/resource state, cross-resource target rejection, failure-stage redaction, and API authorization/HTTPS/default-configuration boundaries. A local Chromium simulation passed protected form submission, cleared/hidden key input, normal findings, shared-policy warning, metadata redaction, mobile width and absence of browser storage. The dependency audit reported zero known vulnerabilities at check time. These are local fixture results; the selected production resource has not been inspected by this agent.

[GitHub Actions run 39925715439](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39925715439) passed for commit `b833696c66cdcf05e0dd9d8215b0ec5ed6937d2b`: all 40 tests, typecheck/build, dependency audit and native amd64/aarch64 container build/runtime checks. No live resource-inspection or TLS-enforcement result is claimed by this CI run.

## Sanitized owner-reported end-to-end results

Published under the existing permission for sanitized pass/fail results only. These are owner-reported observations from a scoped manual test, not independent verification or full Phase 2/release acceptance. Environment versions and identifiers, configuration, fingerprints, credentials and detailed logs are omitted.

| Check | Result |
| --- | --- |
| Public CA certificate fingerprint match | PASS |
| Request without a client certificate denied | PASS |
| Request using issued client identity receives HTTP response | PASS |
| iOS Companion PKCS#12 import | PASS |
| iOS Companion basic connection and control | PASS |
| iOS Companion access over cellular | PASS |
| iOS Companion background/reopen check | PASS |

Remaining validation includes unrelated-issuer rejection, additional invalid/expired identity cases, protocol/path/edge coverage, restart and isolated backup/restore checks, rotation/session behavior, and broader Apple features/platforms. Shared-CA individual revocation remains unsupported by the inspected interface. No complete compatibility, remote automation, recovery or production-readiness claim follows from these results.

## Sanitized directly observed rejection results

Published under the existing sanitized pass/fail permission. These scoped fresh-connection probes were executed by the agent with a disposable client identity whose chain and clientAuth purpose were checked locally. Temporary credentials were removed. No hostname, CA fingerprint, identity, detailed environment information or raw trace is published. Remote configuration and the owner's working credentials were not changed.

| Check | Result |
| --- | --- |
| TLS 1.3 rejection without client certificate | PASS |
| TLS 1.3 rejection of client certificate from unrelated CA | PASS |
| TLS 1.2 rejection without client certificate | PASS |
| TLS 1.2 rejection of client certificate from unrelated CA | PASS |

These results cover the probed fresh connections only. Alternate routes/edges, additional invalid-identity cases, existing sessions, restore/rotation and full release acceptance remain separate gates.

## Sanitized owner-reported restart result

| Check | Result |
| --- | --- |
| App restart persistence and continued client access | PASS |

Published under the existing sanitized pass/fail permission. This owner-reported result does not establish backup restoration, disaster recovery, CA rotation or complete Phase 2 acceptance. No additional environment details are published.

## Expiry and replacement increment — 0.1.0-dev.6

Implemented certificate/CA expiry display, optional HA persistent notifications at 30/14/7/1 days and expiry, guided leaf replacement with explicit owner test confirmation, and single-use ZIP delivery of the encrypted P12. No live Pangolin configuration or production HA service call was made. Core API access is newly declared for notification delivery; notifications default off. Administrator discovery/setup, automatic device installation, CA rotation and mobile push are not included.

Local typecheck/build and all 46 automated tests passed. New fixtures verify transactional v1-to-v2 migration with unchanged CA/history and invalidated exports, expiry thresholds, restart-safe notification deduplication, hourly retry after failure, clock reversal, suppression of older-record reminders only after confirmation, notification opt-in/shutdown ordering, fixed Core service transport, actual ZIP contents and P12 password verification, preserved authorization/CSRF, shared ZIP/P12 single-use redemption, confirmation gating/idempotence and unchanged old issuance records. Runtime dependency audit found zero known vulnerabilities at check time.

A local Chromium simulation through synthetic ingress passed at phone width: explicit CA creation and issuance, hidden-by-default password, actual ZIP and P12 browser downloads, replacement prefill/guidance, checked test confirmation, visible older-identity validity warning, no horizontal page overflow, no browser exceptions and no local storage. These are fixture results, not real iOS replacement or HA notification-delivery acceptance. [GitHub Actions run 39937799442](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39937799442) passed for commit `26241b001fd7b880cdebed523aaf5dd40d4079ef`: all 46 tests, typecheck/build, full dependency audit and native amd64/aarch64 container builds/runtime checks, including disposable encrypted P12 ZIP generation after privilege dropping. This does not establish live HA reminder delivery or device replacement acceptance.

## Named Safari profiles — 0.1.0-dev.7

Added unsigned Apple configuration profiles around the existing encrypted PKCS#12 identity, using a display name derived from the device label and the certificate's actual UTC expiry month/year. The password is omitted. The single payload is `com.apple.security.pkcs12`; there is no MDM enrollment, separate root-trust payload or restriction. The iPhone ZIP contains both P12 and named profile for the same identity. Direct profile, ZIP and P12 choices share one actor-bound, five-minute, single-use export. Existing certificate subjects, CA/trust, storage version and installed profiles are unchanged.

Local typecheck/build and all 48 automated tests passed. New fixtures independently parse the plist, exercise XML escaping/invalid scalar handling, check profile names and distinct identifiers, compare embedded encrypted package bytes, verify the embedded P12 with OpenSSL, and preserve authorization, CSRF, expiry and cross-format replay denial. A phone-width Chromium simulation passed the title preview, hidden password, combined ZIP and direct profile downloads, consumed-download controls, no page overflow, no browser exceptions and no local storage. All identities were disposable fixtures; none of these results establishes actual iOS profile installation, Settings presentation or Safari connectivity. [GitHub Actions run 39939700582](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/39939700582) passed for commit `9ed815d44f6a8baeedec95f6806e765009c3a68c`: all 48 tests, typecheck/build, full dependency audit and native amd64/aarch64 container builds/runtime checks, including disposable combined P12/profile ZIP generation. Actual iOS installation and naming remain a separate acceptance check.

## Enrollment and setup/testing UX — 0.1.0-dev.8

Simplified the issued iOS/iPadOS package panel to one ZIP download, with a readable archive name and readable P12/profile entries. Download choices use the issued package's captured platform, so editing the next issuance form cannot expose the wrong format for a pending iOS package. Protected API formats remain compatible for existing clients. Added English HA configuration labels for every schema option, optional setup/testing API copy and a short connection-check guide distinguishing four basic reads, three optional inspection reads and zero daily permissions. Added visible shared-CA revocation limits, an administrator-picker implementation plan and profile-signing clarification. No remote mutation, user-picker authorization change or signing identity is introduced.

Local typecheck/build and all 48 automated tests passed, including a readable ZIP response-header assertion and updated archive integrity checks. A synthetic-ingress Chromium simulation passed iOS/iPadOS ZIP-only controls and actual ZIP filenames/entries, package-platform retention after form edits, macOS P12 download, revocation guidance, a fixture-backed setup/testing API check with key clearing, mobile width, no browser exceptions and no local storage. Translation/schema coverage and documentation links were checked locally. This does not establish real HA configuration-label rendering or new iOS/Safari compatibility. Native validation is recorded after CI completes.
