# HA Pangolin Access

A proposed Home Assistant Supervisor app for managing device certificates and remote access through Pangolin mTLS.

**Status: Phase 2 certificate prototype, October 23, 2026.** Version `0.1.0-dev.6` adds expiry tracking, optional Home Assistant reminders, guided device-certificate replacement and iPhone ZIP downloads alongside read-only Pangolin inspection and default-off certificate management. It cannot configure Pangolin. No prebuilt image or production release has been published.

The source, lockfile, app manifest and Dockerfile are in [pangolin_access](pangolin_access/README.md). Native amd64/aarch64 container builds and runtime checks passed on GitHub Actions. Selected HA ingress and initial iOS Companion checks passed as owner-reported results; broader compatibility remains unverified. See [local development](docs/development.md) and [prototype validation results](docs/phase-2-results.md).

Add `https://github.com/partytimeexcellent/ha-pangolin-mtls` to Home Assistant's app repositories. Follow the [installation tutorial](docs/installation.md) for the simplified first-install path, including Pangolin API setup, then use [iOS enrollment](docs/ios-enrollment.md) for additional devices. The [app documentation](pangolin_access/DOCS.md) provides a short checklist. Upgrading alone does not create a CA or device identity.

The intended deployment is one Supervisor-managed container containing the dashboard, API, PKI, enrollment, database, and diagnostics. An existing Pangolin server and a connected site that can reach Home Assistant are prerequisites. No additional certificate service or Compose deployment is required.

## Approved direction

1. Use TypeScript, Fastify, Zod, React/Vite, SQLite, and OpenSSL inside one container.
2. Use an organization-scoped Pangolin integration API key and an explicitly supplied organization ID. Server-wide organization discovery requires root privileges and is excluded from the default workflow.
3. Start with a dedicated shared CA. Pangolin's inspected mTLS implementation verifies CA trust but exposes no individual certificate revocation mechanism. Retiring a database record does not block a device. A lost device can require replacing the CA and re-enrolling every remaining device. The current prototype does not implement retirement or revocation controls.
4. Enroll locally through authenticated Home Assistant ingress, then import the password-protected `.p12` into Companion itself. No public provisioning service in the first release.
5. Prototype Apple clients and real Pangolin handshakes before implementing the full product. Source support is evidence, not a device compatibility certification.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [research evidence](docs/research.md), and [ROADMAP.md](ROADMAP.md). The [experiment plan](docs/validation-plan.md) defines the evidence required to proceed.

## Important limitations

- Removing Pangolin's final trusted CA disables mTLS. It must never be offered as a way to block all devices.
- A CA change does not prove that existing WebSockets or resumed TLS sessions have stopped working.
- Certificate import through iOS Settings/Safari does not automatically provision Companion.
- Home Assistant login remains required. mTLS adds another control at the edge.
- The app will not automatically edit Home Assistant configuration or unrelated Pangolin resources.

## Setup and user guides

- [Installation](docs/installation.md)
- [iOS and iPadOS enrollment](docs/ios-enrollment.md)
- [macOS enrollment](docs/macos-enrollment.md)
- [Certificate management](docs/certificate-management.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Optional advanced checks](docs/manual-checks.md)

The iOS guide includes the scoped working import path; iPadOS and macOS acceptance and broader Apple features remain separate checks. Maintainer contact, license selection, and security reporting channel remain release decisions; this repository does not yet grant an open-source license. Separate encrypted CA recovery export and rotation remain release gates; use a protected Supervisor backup for the current prototype.
