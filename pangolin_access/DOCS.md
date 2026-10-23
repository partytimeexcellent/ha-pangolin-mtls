# Certificate prototype setup

Prefer an isolated Home Assistant OS/Supervisor test installation. This increment supports local CA creation and certificate export after explicitly enabling it. An optional explicit read-only check can contact Pangolin; it cannot change existing remote access. Retain a current protected backup and local access while testing. Updating the app alone creates no CA or client identity.

## Local installation

Copy this entire `pangolin_access` directory (including its lockfile and source, excluding `node_modules` and `dist`) into the Supervisor local app directory using your existing development access. Older installations expose this directory at `/addons`; newer documentation names it `/local_apps`. Refresh the local app store, install HA Pangolin Access, and leave protection mode enabled.

The source repository is [partytimeexcellent/ha-pangolin-mtls](https://github.com/partytimeexcellent/ha-pangolin-mtls). If it is publicly readable, add that URL through the app store's Repositories dialog instead of copying files. If it is private, an unauthenticated Supervisor clone will fail: use the local upload route or separately configure an appropriate supported authentication method. Never embed a GitHub token in a repository URL or paste one into logs.

In Configuration, set:

- `admin_user_ids`: the actual 32-character Home Assistant user ID for each administrator who may use this app. Find a user's ID on their user details page in Home Assistant's user management (Advanced Mode may be needed, depending on version). This is an ID, not a display name or username. An empty list denies everyone.
- `home_assistant_origin`: the exact URL origin you use to open HA, for example `https://ha.example.net` or `http://192.168.1.50:8123`. Include a nonstandard port, but no path. Only this origin may send POST requests. If using multiple HA URLs, use the configured one during this prototype.
- `enable_certificate_management`: off by default. Enable only after the authorized check and allowlist-denial/restoration tests pass. An HTTPS Home Assistant origin is required when this option is enabled; HTTP is permitted only for the non-signing ingress checks.

Start the app and select Open Web UI. Click Check my access. A pass means this request met the configured identity, peer, origin, session and CSRF checks; it does not certify Supervisor or create credentials. Signing availability is controlled separately by the certificate-management option.

From build `0.1.0-dev.2`, failures show the request stage and a diagnostic code. The log records only fixed access-denial codes. `ORIGIN_MISMATCH` means the origin header differs from configuration; `ORIGIN_MISSING` and `ORIGIN_NULL` identify absent and opaque origins respectively. None is accepted as a fallback. `SESSION_OR_CSRF_INVALID` identifies an expired, missing or changed session/CSRF token. A non-JSON response or `NETWORK_ERROR` may mean the request did not reach this app. Share the displayed message or fixed code, not browser headers or a full ingress URL.

After an update, reopen the Web UI and confirm the build number shown at the bottom changed. The Home Assistant repository URL is unchanged; refresh/check for updates in the app store if a new version is not offered yet.

## Create a CA and export a device identity

1. With your allowlist and HTTPS origin already working, set `enable_certificate_management: true` in this app's Configuration, save and restart this app.
2. Reopen the dashboard. Select the dedicated-CA confirmation checkbox, then Create certificate authority. This generates a new local RSA-3072 CA valid for five years; it does not upload anything to Pangolin. The prototype refuses to replace an existing CA.
3. Take a protected Supervisor backup after CA creation. The backup must include this app's private data. It contains both the encrypted signing key and its automatic-unlock secret, so treat it as signing access. Separate password-protected recovery export/CA rotation is not implemented yet.
4. Enter a device name and platform, choose a lifetime (90 days default, 1–365 days maximum), and select Issue certificate. A unique RSA-3072 key and clientAuth certificate are generated; names stay in metadata rather than OpenSSL configuration or filenames.
5. Select Show package password and save it separately. Download the password-protected `.p12` within five minutes. The download can be redeemed once, by the issuing administrator, through a CSRF-protected POST. A canceled/interrupted download may still consume it. No permanent URL or QR code is created.
6. Import manually into the client being tested. Apple import compatibility is not yet verified for this export profile. Do not change Pangolin trust or resource authentication as part of this standalone test. A generated identity cannot grant remote access until a server trusts its CA.

The package/password display expires after five minutes. Restarting the app invalidates all pending exports. After expiry/restart/consumption, there is no redownload or password recovery; another issuance creates a new identity and does not invalidate the earlier one. Inventory says pending/downloaded/expired/unavailable for package handling only. Downloaded does not mean saved, installed or verified at the edge.

This prototype caps issuance history at 100 certificates and concurrent pending packages at five. Renewal, replacement workflow, device retirement, CA rotation and standalone recovery import/export are not implemented. No button claims to revoke a leaf certificate.

## Storage and cryptographic profile

Only `/data/state` persists: `state.sqlite` contains public CA/certificate metadata, audit events and the CA's encrypted PKCS#8 key; `unlock.key` is a random local startup secret. Directories are 0700, files 0600. Metadata is not encrypted. Encryption with a colocated secret does not protect against complete host/backup theft. Do not put this app's private data in a public issue.

Temporary signing files live in Supervisor-managed `/tmp` tmpfs and are removed after each operation; raw client private keys are not retained. Encrypted packages live only in bounded process memory until redemption/expiry. Logical cleanup is not a forensic secure-erasure guarantee.

Exports use OpenSSL AES-256-CBC/PBKDF2 with 100,000 iterations and a SHA-256 MAC. CA/client certificates use RSA-3072 with SHA-256. The package contains one client private key, its leaf certificate and the public CA certificate, never the CA private key. There is no automatic legacy-encryption fallback. Tests verify chain/purpose, key matching, wrong passwords, expiry and replay; real iOS/macOS behavior still needs device acceptance.

## Acceptance checks

1. Confirm the allowlisted administrator can open the UI and complete the check.
2. Remove their ID, restart, and verify access is denied. Restore the intended allowlist through Supervisor options.
3. Verify a different HA account cannot access the app. `panel_admin` is an additional UI restriction; the backend independently enforces the allowlist.
4. Test through a different browser session and verify missing/expired app-session tokens fail.
5. Test attempts to reach port 8099 directly from the LAN or another app: no mapped LAN port, and non-Supervisor peers must be denied even with forged identity headers.
6. Confirm CSS/JS requests and the authorization POST stay under `/api/hassio_ingress/<token>/`, including after refresh and on a phone.
7. Confirm the service runs as UID/GID 1000 after startup, `/data/state` is 0700, and stopping/restarting works cleanly.

Record exact HA OS/Core/Supervisor versions and sanitized outcomes. Never copy actual ingress URLs, session tokens, user IDs, or cookies into public logs/issues. Older Supervisor builds that omit identity headers will be denied rather than given a fallback login.

The image uses a pinned official Node Debian image, packaged OpenSSL and Supervisor's init support. It uses Node 24's built-in SQLite (release-candidate API) to avoid a separate native extension; reevaluate this before production release. There is one server process plus bounded OpenSSL subprocesses. No API grants, additional persistent volumes, capabilities or host networking are requested; `/tmp` uses tmpfs. AppArmor uses Supervisor's default profile. Container health checks only verify a listening TCP socket; real ingress behavior is a separate acceptance check.

## Read-only Pangolin check (0.1.0-dev.4)

1. Refresh the app store repositories and update this app. Reopen its Web UI and confirm build `0.1.0-dev.4`. Existing CA data stays in `/data`; do not uninstall the app or create another CA.
2. Add `pangolin_api_url` to this app’s Configuration, for example `https://api.example.net/v1`. This is the separately enabled integration API, not the dashboard URL. Save and restart. Only public DNS destinations with valid HTTPS certificates are supported in this increment; private IPs, mixed public/private DNS answers, redirects, URL credentials and alternate paths are refused. Use your HTTPS Home Assistant origin.
3. In Pangolin, use an organization-scoped key with `getOrg`, `listSites`, `listOrgDomains` and `listResources` read permissions. This check needs no write permissions or root organization-discovery permission.
4. In the app’s Connect to Pangolin section, enter the organization ID and full API key in the password field. Select Check Pangolin connection. Do not put the key into chat, screenshots or a URL. The app clears the input on submission and uses the key only for that request. It is not saved to SQLite, Supervisor options or browser storage; it is not returned or logged. Memory cannot be promised forensic erasure.
5. A pass means the deployed spec advertises the read routes and all four scoped reads matched the expected response shapes. The dashboard shows only the first 20 entries per list and the reported total; it does not claim a complete inventory. mTLS route advertisement is not proof of write permissions, shared-policy safety, site-to-HA reachability or TLS enforcement.

No certificate upload, resource/target edit, trust change or activation is implemented. No automatic requests run at startup. Checks use a 30-second total deadline, five-second socket inactivity limit, two-megabyte response limit, one active check and two attempts per administrator per minute. Failed checks show fixed codes without upstream response bodies. Share only the displayed result/code. A future step must inspect the selected resource’s effective policies, trust and targets before proposing any changes.
