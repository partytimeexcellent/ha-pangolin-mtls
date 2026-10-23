# HA Pangolin Access

A proposed Home Assistant Supervisor app for managing device certificates and remote access through Pangolin mTLS.

**Status: Phase 1 research and architecture, dated October 22, 2026. There is no installable app yet.** No production code, Docker image, or deployment manifest has been created. Phase 2 requires the project owner's approval.

The intended deployment is one Supervisor-managed container containing the dashboard, API, PKI, enrollment, database, and diagnostics. An existing Pangolin server and a connected site that can reach Home Assistant are prerequisites. No additional certificate service or Compose deployment is required.

## Review these decisions

1. Use TypeScript, Fastify, Zod, React/Vite, SQLite, and OpenSSL inside one container.
2. Use an organization-scoped Pangolin integration API key and an explicitly supplied organization ID. Server-wide organization discovery requires root privileges and is excluded from the default workflow.
3. Start with a dedicated shared CA. Pangolin's inspected mTLS implementation verifies CA trust but exposes no individual certificate revocation mechanism. Retiring a database record does not block a device. A lost device can require replacing the CA and re-enrolling every remaining device.
4. Enroll locally through authenticated Home Assistant ingress, then import the password-protected `.p12` into Companion itself. No public provisioning service in the first release.
5. Prototype Apple clients and real Pangolin handshakes before implementing the full product. Source support is evidence, not a device compatibility certification.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [research evidence](docs/research.md), and [ROADMAP.md](ROADMAP.md). The [experiment plan](docs/validation-plan.md) defines the evidence required to proceed.

## Important limitations

- Removing Pangolin's final trusted CA disables mTLS. It must never be offered as a way to block all devices.
- A CA change does not prove that existing WebSockets or resumed TLS sessions have stopped working.
- Certificate import through iOS Settings/Safari does not automatically provision Companion.
- Home Assistant login remains required. mTLS adds another control at the edge.
- The app will not automatically edit Home Assistant configuration or unrelated Pangolin resources.

## Planned user guides

- [Installation](docs/installation.md)
- [iOS and iPadOS enrollment](docs/ios-enrollment.md)
- [macOS enrollment](docs/macos-enrollment.md)
- [Certificate management](docs/certificate-management.md)
- [Troubleshooting](docs/troubleshooting.md)

These guides describe the proposed workflow and are explicitly untested until Phase 2. Public repository URL, maintainer contact, license selection, and security reporting channel remain release decisions; this planning repository does not yet grant an open-source license.
