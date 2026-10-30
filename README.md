# HA Pangolin Access

A Home Assistant Supervisor app for managing device certificates and remote access through Pangolin mTLS.

**Status: Early access, October 30, 2026.** Version `0.1.0-dev.17` adds `/v1` to the entered Pangolin integration API address, shows CA installation results beside each resource, and can enable mTLS on a disabled resource after verifying its CA trust. See [release readiness](docs/release-readiness.md) for the remaining production-release gates. Certificate creation is available after verified administrator setup and an HTTPS Home Assistant URL are configured. No prebuilt image or production release has been published.

The source, lockfile, app manifest and Dockerfile are in [pangolin_access](pangolin_access/README.md). Native amd64/aarch64 container builds and runtime checks passed on GitHub Actions. Selected HA ingress and initial iOS Companion checks passed as owner-reported results; broader compatibility remains unverified. See [local development](docs/development.md) and [prototype validation results](docs/phase-2-results.md).

## Install on a new Home Assistant instance

This is a **Home Assistant app** (formerly called an add-on), so install it through the **Home Assistant App Store**, not HACS. [HACS does not handle apps/add-ons](https://hacs.dev/docs/faq/addons/). Use Home Assistant OS or a Supervised installation with the App Store.

1. In Home Assistant, open **Settings → Apps → Install app**.
2. Open the **⋮** menu in the upper right and select **Repositories**.
3. Add `https://github.com/partytimeexcellent/ha-pangolin-mtls`, then refresh the App Store if the repository does not appear immediately.
4. Open **HA Pangolin Access** from the new repository and select **Install**. This development version builds locally, so the first install may take a while.
5. In the app’s **Configuration**, leave recovery administrator IDs empty for the initial setup. Set Home Assistant’s external URL to the HTTPS address you will use to open the app, or enter that address as the app’s **Home Assistant URL override**. Save and start the app.
6. Select **Open Web UI**. In **Home Assistant setup**, review the URL, choose and save administrators, then select **Check access**. Create the CA in **Device certificates**, set expiry reminders there if desired, and take a protected Home Assistant backup.
7. To install the public CA into Pangolin, [enable its integration API and configure Traefik](docs/installation.md#3-enable-pangolins-integration-api) if self-hosted, then create an organization API key with the [eight permissions](docs/installation.md#4-create-one-organization-api-key). In **Pangolin setup**, enter the API address: `https://` plus the hostname in your `int-api-router` `Host(...)` rule. The app adds `/v1`; for Cloud, enter `https://api.pangolin.net`. Enter the Organization ID and key, select **Find public resources**, then choose **Install CA cert** on the intended Home Assistant resource. Any error appears beside that resource.
8. Optionally select **Enable mTLS after installing the CA** for a disabled resource. Otherwise enable **Client Certificate (mTLS)** in Pangolin. Enroll a device, then test both rejection without a certificate and access with the enrolled device before enabling the resource.

Follow the [full installation tutorial](docs/installation.md) for Pangolin API routing, resource preparation and device enrollment. The [app documentation](pangolin_access/DOCS.md) provides a shorter checklist. Upgrading alone does not create a CA or device identity.

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
- [Short Pangolin connection-check routine](docs/pangolin-connection-check.md)
- [iOS and iPadOS enrollment](docs/ios-enrollment.md)
- [macOS enrollment](docs/macos-enrollment.md)
- [Certificate management](docs/certificate-management.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Optional advanced checks](docs/manual-checks.md)

The iOS guide includes the scoped working import path; iPadOS and macOS acceptance and broader Apple features remain separate checks. Maintainer contact, license selection, and security reporting channel remain release decisions; this repository does not yet grant an open-source license. Separate encrypted CA recovery export and rotation remain release gates; use a protected Supervisor backup for the current prototype.
