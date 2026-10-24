# Certificate management and enforcement limits

The current prototype implements CA creation, device certificate issuance, public certificate history and short-lived PKCS#12 delivery. Expiry tracking, optional reminders and guided replacement are available in dev.6; automatic renewal installation, retirement controls, CA rotation and standalone encrypted recovery export remain proposed. Start with the [installation tutorial](installation.md) for the current workflow.

Current issuance records include name/platform, serial, SHA-256 fingerprint, dates and package export status. Replacement records link the new identity to its older certificate and record an explicit owner test confirmation. A device may have multiple valid certificates after renewal. “Retired” means no further issuance/export is intended; it does not mean Pangolin rejects the existing certificate. Deleting a retired inventory entry cannot revoke a copied private key.

## Can a certificate be revoked through the UI?

No. The current app does not offer a revoke control because the inspected Pangolin shared-CA interface cannot deny one issued leaf by serial/fingerprint or enforce a CRL/OCSP check. Replacement, deleting a local record or removing an identity from a phone does not invalidate a copy elsewhere. This limitation is also shown beside the certificate inventory.

For a lost/compromised identity, manually disabling the affected Pangolin resource is broad containment and interrupts every user of that resource. Recovering under a new shared CA requires re-enrolling legitimate devices, verifying new trust, then removing old trust while a valid CA remains. Existing connections/session behavior requires separate checks. This app does not automate that migration. Never remove the last trusted CA to block access: Pangolin turns mTLS off. [Pangolin mTLS documentation](https://docs.pangolin.net/manage/access-control/mtls), [inspected enforcement evidence](research.md#enforcement-details-and-consequences).

## Revocation choices

| Approach | Effect and cost | Recommendation |
| --- | --- | --- |
| Shared CA, local retired flag | No change at the edge | Default inventory behavior; clearly disclose continued access |
| Short leaf lifetime | Old certificate eventually expires; existing connections may persist | Useful risk reduction, not immediate revocation |
| CRL / OCSP / serial denylist | No supported mechanism found in inspected public mTLS API/path | Do not offer or assume enforcement |
| Replace shared CA | After old trust removal, old-chain fresh handshakes should fail | POC strategy; re-enroll every legitimate device and test propagation |
| Independent CA per device | Remove one trust anchor to isolate that identity family | Optional prototype; 20 total CA entries, rotation headroom, final-entry hazard |
| Disable resource | Broad outage rather than selective revocation | Candidate emergency containment; test its actual edge/session effect |

Per-device CAs must be independent trust anchors. If a shared parent remains trusted, removing one intermediate from the trust list may not block a leaf that supplies its chain. A user-facing limit must account for all CA entries and overlapping generations. A CA for each device adds keys, backup complexity and a hard capacity limit; it is not the initial default.

Pangolin's inspected implementation turns mTLS off when the final CA is deleted. Never remove all trust entries to block clients. For shared-CA rotation: generate B, upload B alongside A, verify B, import B identities on legitimate clients, remove A while B remains, and test rejection of A identities. Maintain the legitimate B test throughout. The operation must pause on capacity limits or policy ambiguity. [Source evidence](research.md#enforcement-details-and-consequences).

Fresh-handshake rejection is narrower than immediate loss of access. Test TLS session resumption, active keepalive connections and WebSockets. Record “fresh handshake rejected at [time]” separately from “all existing sessions terminated”; the latter cannot be claimed without evidence and a supported termination method.

## Renewal, backup and recovery

The implemented leaf default is 90 days. Use the replacement workflow below before expiry to create a fresh key/certificate and import its new package. There is no automatic Apple installation. Old and new leaves can both remain valid until expiry or issuer trust removal. Device inventory calculates expiry from the issued certificate, independently of client UI.

Make a protected Supervisor backup including this app’s data and verify restoration in isolation. A separate encrypted CA recovery export with a user-held password is planned but is not available in this prototype. The current CA key is retained in app data and its backups; Pangolin receives public certificates only. Protect backups as access-granting credentials. Automatic-unlock storage and its limitations are explained in [SECURITY.md](../SECURITY.md#at-rest-encryption-and-startup).

Restore must check issuer/key consistency, metadata version and live Pangolin trust, invalidate outstanding enrollment tokens, and avoid automatically republishing trust. A restored old certificate record is not evidence that a device is authorized or blocked at the edge. Losing the CA without a usable backup requires a new CA and re-enrollment; it does not justify disabling mTLS.

## Expiry reminders

Expiry dates and days remaining are always visible in the certificate inventory, including the CA. To enable HA persistent notifications, turn on **Enable Home Assistant Notifications** (`enable_home_assistant_notifications: true` in YAML) in app Configuration and restart. Certificate management must also be enabled. The app checks at startup and hourly while running, at 30, 14, 7 and 1 day before expiry and after expiry. If several thresholds passed while stopped, only the most urgent is sent. Delivery state survives restarts; a stable notification ID updates the existing notice. Failed delivery retries hourly and shows a dashboard warning. Dismissed notices are not recreated until a more urgent threshold is reached.

These appear in the Home Assistant notification panel, not as phone push notifications. Disabling the option stops future delivery; it does not dismiss existing notices. Device names appear in notifications; avoid private information in labels. The app must remain running for checks. Keep **Start on boot** enabled if you want reminders after host restarts; this experimental app's default boot setting is manual. Persistent notifications are not an independent monitoring service or automatic renewal.

The app now requests Core API permission for this feature, even when the option is off. The grant is broader than notification-only access, although notification code calls only the fixed notification service. Since dev.9, automatic external-URL selection can also read Core configuration at startup; an explicit URL override avoids that read. It does not request auth or broad Supervisor access. [HA app communication](https://contributors.home-assistant.io/apps/guides/communication/), [persistent notifications](https://www.home-assistant.io/integrations/persistent_notification/).

## Replace a device certificate

1. In the inventory, choose **Replace certificate** beside the intended device. Review its name, platform and lifetime, then choose **Issue replacement**. A fresh key and password are generated under the existing CA.
2. Save the password separately and choose **Download mTLS installer ZIP** within five minutes. For iOS/iPadOS this is the only offered format: **iOS mTLS installer.zip** includes Home Assistant identity.p12 and Install for Safari.mobileconfig for the same identity. Import the new package inside the intended app; on iPhone use the [Companion import guide](ios-enrollment.md).
3. If the same identity is installed in Safari and Companion on one iPhone, import the replacement into both places using their separate installation paths. Close/reopen each intended client and test the protected external hostname over cellular or another external network, avoiding a local fallback or existing connection. Normal Home Assistant login remains required.
4. Under the replacement's inventory row, check **I imported this replacement and tested access**, then choose **Confirm replacement tested**. This records your observation and suppresses future reminders for the older record. It does not revoke the old identity or dismiss previously delivered notifications; dismiss those in HA.

If import or testing fails, preserve the old working identity and leave confirmation unchecked. A lost/expired package requires fresh issuance. No CA upload or Pangolin change is needed for a leaf replacement under the same already trusted CA. CA replacement itself is not automated; a CA expiry notice requires planning a separate trust migration and re-enrollment.

## Upgrade from dev.5

Take a protected Supervisor backup including this app before updating to dev.6. Its transaction migrates metadata from version 1 to 2 while preserving CA and certificate history. Pending downloads are invalidated on restart as before. Earlier builds refuse version 2 storage; to downgrade, restore the pre-update backup rather than editing the database. Keep the existing working client and Pangolin trust unchanged during the upgrade.
