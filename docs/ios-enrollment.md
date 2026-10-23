# iOS and iPadOS enrollment proposal

Status: source-supported workflow, not yet tested against real Pangolin and an installed Companion release. See [Apple client evidence](research.md#apple-client-evidence).

Use Companion's own certificate importer. Installing a `.p12` in iOS Settings or Safari does not automatically make that identity available to Companion because of Apple's keychain access boundaries. [Apple explanation](https://developer.apple.com/library/archive/qa/qa1745/_index.html).

1. While on your home network, open the local Home Assistant UI as an authorized administrator and enter this app's dashboard. If provisioning another person's device, use a trusted local transfer of the encrypted package instead of giving them administrator credentials.
2. Choose Add Device, enter a name and select iOS or iPadOS. Generate its identity and save the password-protected `.p12` to Files using local device storage where available. View its password separately; do not place both in a shared message or QR code.
3. In Companion, configure the protected Home Assistant HTTPS URL. During onboarding, select the `.p12` when asked for a client certificate and enter its password. For an existing server, use that server's Connection settings and Client Certificate import page if available in the installed build. Exact labels and path must be confirmed in the POC; the inspected development source includes both flows.
4. Log in using normal HA credentials. Test dashboard updates and a persistent connection, then restart Companion and test away from home Wi-Fi. Record app/OS versions and any feature-specific failures.
5. Delete the temporary downloaded package and unwanted synced copies after successful import. Mark the result as user-confirmed; the manager cannot infer installation from a download.

Keep the public hostname protected throughout. A new unenrolled device cannot open a provisioning page behind that hostname; use local HA access. Renewal requires another import. Replacing a certificate does not automatically invalidate the old one under the shared CA.

Do not turn on global trust for the client CA to fix import errors: client identity import and trust in the server's HTTPS certificate are separate. The public resource should present a normally trusted server certificate. A QR code can eventually help open local enrollment, but it cannot silently install an identity into Companion.
