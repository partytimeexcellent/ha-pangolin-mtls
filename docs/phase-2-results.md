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
| 13 automated tests | Passed |
| Locked dependency audit | 0 known vulnerabilities reported at check time; not an independent security review |
| Manifest parsing/basic privilege review | Passed: two declared architectures, empty allowlist, no host ports or elevated API/network grants |
| Docker/container build | Passed on GitHub Actions; Docker remains absent from this Mac |
| Native amd64/aarch64 image/runtime | Passed on native GitHub runners, including privilege drop, private state directory and rejection of direct HTTP |
| Browser/real Supervisor ingress (E1) | Not run; automated injection is narrower evidence |
| Certificate, Pangolin, Apple-client experiments E2–E7 | Not run; functionality not implemented in this increment |

The test suite checks forged peer/forwarded headers, missing/non-allowlisted identity, default denial, path validation, status flags, successful protected POST, CSRF/origin/content-type failures, user/path session binding, deadline/restart invalidation, oversized/unexpected input, rate limiting, and production-asset/API path resolution. An initial test detected the static handler overriding no-store; disabling its cache header generation fixed the failure.

## Next gate

Install this increment on the isolated HA instance using [DOCS.md](../pangolin_access/DOCS.md). Confirm actual trusted identity forwarding, denial for wrong/missing users and non-Supervisor peers, nested assets/POST behavior, non-root operation, health and shutdown. Record versions and sanitized outcomes here. Do not record actual ingress tokens, cookies or user IDs.

Only after E1 acceptance should the next increment enable CA generation and one-device PKCS#12 export. Later increments need no fresh Phase 1 approval, but they must preserve this gate and the prohibition on unapproved remote infrastructure changes. Phase 3 is still gated on a successful full POC and owner review.
