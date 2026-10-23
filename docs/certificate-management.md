# Certificate management and enforcement limits

The current prototype implements CA creation, device certificate issuance, public certificate history and short-lived PKCS#12 delivery. Renewal automation, retirement controls, rotation and standalone encrypted recovery export remain proposed. Start with the [installation tutorial](installation.md) for the current workflow.

Current issuance records include name/platform, serial, SHA-256 fingerprint, dates and package export status. Renewal links and administrative lifecycle controls are future work. A device may have multiple valid certificates after renewal. “Retired” means no further issuance/export is intended; it does not mean Pangolin rejects the existing certificate. Deleting a retired inventory entry cannot revoke a copied private key.

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

The implemented leaf default is 90 days. Expiry reminders are future work. Renew before expiry by creating a new key/certificate and importing its new package. There is no automatic Apple installation. Old and new leaves can both remain valid until expiry or issuer trust removal. Device inventory calculates expiry from the issued certificate, independently of client UI.

Make a protected Supervisor backup including this app’s data and verify restoration in isolation. A separate encrypted CA recovery export with a user-held password is planned but is not available in this prototype. The current CA key is retained in app data and its backups; Pangolin receives public certificates only. Protect backups as access-granting credentials. Automatic-unlock storage and its limitations are explained in [SECURITY.md](../SECURITY.md#at-rest-encryption-and-startup).

Restore must check issuer/key consistency, metadata version and live Pangolin trust, invalidate outstanding enrollment tokens, and avoid automatically republishing trust. A restored old certificate record is not evidence that a device is authorized or blocked at the edge. Losing the CA without a usable backup requires a new CA and re-enrollment; it does not justify disabling mTLS.
