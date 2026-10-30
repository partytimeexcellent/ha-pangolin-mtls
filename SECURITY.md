# Security design and threat model

Status: security requirements with an initial ingress prototype, October 22, 2026. No implementation has been independently audited or released. This document defines requirements and residual risks; it is not a security certification. See [actual prototype checks](docs/phase-2-results.md); unimplemented requirements below remain release gates.

## Assets and boundaries

Critical assets are CA signing keys, Pangolin bearer credentials, device private keys and export passwords, recovery archives, administrative authorization, and the integrity of the resource's mTLS policy. Device names, IP addresses and enrollment history are privacy-sensitive metadata.

Boundaries: browser to HA authentication; HA/Supervisor ingress to app; app to private `/data`; app to remote Pangolin API; client to Pangolin edge; connector to Core; and live state to backup/restore. The app is not the user's data proxy. HA login remains enabled after the mTLS handshake.

Trust assumptions: HA OS/Supervisor, configured administrators, the local host, and Pangolin administrators are trusted. Attackers may control the internet, an ordinary HA account, another app, a malicious webpage, an enrollment link, or a lost client identity. A compromised host or Pangolin administrator can defeat relevant controls. An authorized HA administrator can change app options and ultimately obtain signing access; the app does not defend against its own host administrator.

## Threats and required controls

| Threat | Required control | Residual risk / verification |
| --- | --- | --- |
| Internet credential endpoint access | Ingress-only, no host ports, reject non-Supervisor peers | Test direct access from another app and LAN |
| Ordinary HA user issues credentials | Explicit HA-user allowlist, trusted identity headers, deny missing identity | Identity propagation is a Phase 2 blocking experiment |
| Forged ingress/forwarding headers | Socket peer check before trusting headers; no blanket proxy trust | Supervisor/network compromise remains trusted infrastructure |
| CSRF / link prefetch causes issuance | CSRF token, origin checks, JSON mutations, no mutating GETs | Test iframe/download behavior through real ingress |
| XSS steals exports or triggers signing | React escaping, no raw HTML, strict CSP, local assets, safe filenames | Administrator browser compromise remains in scope for hardening, not fully preventable |
| SSRF via server/diagnostic URL | HTTPS Pangolin origin allowlist, bounded known API paths, no redirects; resolve and validate all IPs at connection time | Reject loopback, link-local, metadata, multicast, Supervisor/internal service addresses; explicitly approve a specific private API origin if needed |
| DNS rebinding / credential forwarding | Pin validated address per request while preserving hostname/SNI verification; never forward bearer credentials to another origin | Prototype IPv4/IPv6 and DNS changes; reject URL userinfo/fragments |
| Diagnostic network scanning | Probe only saved resource host/port and selected target within administrator-approved scope; no arbitrary fetch endpoint | Remote target address is interpreted from site's perspective |
| OpenSSL injection or resource exhaustion | Fixed binary/argument arrays, validated inputs, private scratch directories, quotas/timeouts | No shell interpolation or arbitrary config uploads |
| Package theft / replay | Strong password delivered separately, token hash, short expiry, atomic one-use redemption, no-store | Downloaded file remains copyable by its holder |
| Request/log leakage | Structured allowlisted logging; redact auth, cookies, tokens, passwords and bodies | Test reverse-proxy and browser history leakage too |
| CA/private key theft | Restricted UID, 0700/0600, umask 077, AppArmor; optional encryption policy below | Permissions are not encryption |
| API compromise changes unrelated resources | Org-scoped least-privilege key, saved IDs, field-level diffs, shared-policy refusal | Upstream APIs lack assumed multi-step transactions/CAS |
| Provisioning interrupted or retried | Durable operation journal, bounded reconciliation, ambiguous-create recovery | Never duplicate resources or attach target before trust configured |
| Trust removal opens service | Never delete final CA; read effective policies and verify negative handshakes | External Pangolin admin changes cannot be fully prevented |
| “Revoked” device still connects | Honest independent management/enforcement states | Shared CA cannot enforce individual leaf revocation |
| Old backup resurrects credentials | Restore staging, session invalidation, compare live edge trust, no automatic publication | Old signatures/keys remain sensitive even if records were deleted |
| Dependency or image compromise | Lockfile, pinned image digests, SBOM, vulnerability/license scans, signed releases | Scan findings require triage; no “zero vulnerabilities” claim |

Apply request size limits, bounded names and lifetime values, serialized sensitive jobs, and sensible retention. Database constraints must enforce token and serial uniqueness. Sanitize upstream errors rather than relaying raw bodies. CORS is not an authorization mechanism.

## At-rest encryption and startup

Implemented POC (`0.1.0-dev.3`): the CA key uses standard encrypted PKCS#8, and a random 0600 local unlock secret enables automatic startup. SQLite metadata remains unencrypted. The paired files are protected by a 0700 directory, but a full backup/host compromise yields both. There is no manual-unlock or separate recovery-archive feature yet. The current app enables certificate service at startup and requires HTTPS, verified administrator setup and explicit authenticated creation/download actions. Earlier POC builds used a default-off option. These are implementation facts, not a completed independent review.

Three different protections must be explained accurately:

1. Filesystem permissions constrain processes but do not encrypt storage or backups.
2. Automatic unlock can use a random local wrapping key with established authenticated encryption, for example AES-256-GCM through Node crypto with unique nonces. If both wrapping key and ciphertext are in `/data`, this protects some accidental disclosure but not full host/backup theft or a running-app compromise. Do not present it as independently secured storage.
3. A manual-unlock mode can use a user-held passphrase and established KDF/encryption library, with parameters measured on supported hardware. The key remains in memory after unlocking. After restart, issuance, enrollment exports, and API writes remain locked until an administrator unlocks it; existing Pangolin remote access can continue. No hidden plaintext fallback or password recovery.

Recommend automatic startup mode with explicit limitations for the initial POC, and require separately encrypted user-held recovery exports before release. Manual-unlock mode is a later tested option, not a prerequisite for installation. Choose a maintained archive/encryption implementation, document its format and KDF, and test wrong passwords and tampering before shipping backup/restore. Never use unauthenticated `openssl enc` as an archive security design.

Do not persist raw leaf keys after packaging. Volatile temporary files reduce backup exposure but do not guarantee forensic erasure from RAM, swap or flash. Cleanup is logical deletion, not a secure-erasure promise. Production diagnostics must not dump memory or private key directories.

## Compromise response

Lost client: mark it retired, explain that it may still connect, and follow CA replacement or tested per-device trust removal. For immediate broad containment, disable the affected resource through supported controls or the Pangolin dashboard and verify it is unavailable; closing existing connections may need additional edge/operator action. Never remove the final CA as containment.

CA compromise: stop signing, generate a new CA, migrate legitimate clients, remove old trust without an empty-trust interval, and verify rejection. Pangolin key compromise: revoke/replace the API key in Pangolin and inspect changed resources. Host compromise: rebuild on trusted infrastructure and rotate all signing/API credentials; restoring the same compromised keys is insufficient.

Audit records include actor, action, object ID, result, operation ID, timestamp, and configuration fingerprints, never secret contents. They are useful local history, not tamper-proof evidence against a host administrator. Default planned retention is 90 days with bounded storage, pending product review.

## Reporting and release gate

No private reporting address is configured yet. Before publishing, establish a private reporting channel (for example GitHub private vulnerability reporting), a supported-version policy, and an incident owner. Do not post keys, `.p12` files, tokens or unsanitized backups in public issues.

The [validation plan](docs/validation-plan.md) is mandatory before claims of safe enrollment, enforcement, or recovery. Security review must include source, dependency/container scans, real ingress authorization tests and actual edge handshakes. Production release is blocked until these requirements have evidence.

## Read-only integration check

Build dev.4 accepts an API key only through an HTTPS-origin ingress/session/CSRF-protected POST. The destination URL is configured separately in Supervisor options, never accepted from that POST. All outbound operations are fixed GET routes on that same HTTPS origin; no redirects or upstream URLs from response fields are followed. DNS must resolve only to public addresses; the connection pins one validated answer and retains normal TLS hostname/CA verification. Private and reserved IPv4 addresses, IPv4-mapped IPv6 and non-global/documentation/transition IPv6 destinations are blocked. Private integration endpoints are unsupported in this increment.

The key is not persisted, logged or returned. It necessarily exists in browser/server memory and during verified HTTPS transport; memory erasure is not guaranteed. OpenAPI is requested without credentials. Scoped reads use the bearer key, with fixed error codes and bounded bodies/deadlines. Only allowlisted display fields return to the browser. Read results remain browser memory until navigation or a new check. A successful check is not evidence of mTLS enforcement or authorization to mutate remote infrastructure.

The dev.5 resource inspection requires exact organization/identifier/hostname agreement before reading policies, targets and CA metadata. It does not follow target addresses or probe the selected hostname. Policy user/email/rule values, upstream headers and CA PEM are excluded from returned summaries. Shared policies, incomplete results and existing access configuration are flagged for review. Reads cannot form an atomic remote snapshot; resource reread and hostname searching are limited diagnostics, not configuration locking, a complete router inventory or proof of TLS enforcement. API errors expose only fixed operation labels and fixed codes. Error redaction is registered before all routes/plugins.

## Expiry notifications and replacement records

Dev.6 requests Core API permission for optional persistent notifications. The platform permission is broader than the single service used by this app; it is present even with notifications off. The option defaults off. Notification code calls only `http://supervisor/core/api/services/persistent_notification/create`, with no redirects, a five-second timeout and no response logging. Supervisor credentials remain in memory only, never browser storage, SQLite, URLs or child-process environments. Notification content includes a sanitized device label and expiry stage, not keys, package passwords or download capabilities. HA front-end access determines who can see persistent notifications; use non-sensitive device names.

Replacement confirmation is a human-reported device test, not remote enforcement evidence or revocation. It suppresses older-certificate reminders while preserving the issuance record. A ZIP is only a transfer wrapper containing the encrypted P12; it provides no extra encryption. ZIP and P12 consume the same single-use capability. Version 2 metadata migrates transactionally; take a protected pre-update backup for downgrade recovery. Restoring that backup never restores a usable pending download.

## Named Safari profiles (dev.7)

A `.mobileconfig` wraps the existing encrypted P12. It contains no package password, MDM enrollment or separate root-trust payload. Both the top-level profile and identity payload have a human-readable display name; it is public metadata, not encrypted. Do not use sensitive device labels. The wrapper is unsigned: names do not establish a verified publisher. Each certificate has a distinct profile identifier so new issuance cannot silently replace another installed profile. The ZIP now contains both P12 and profile with the same identity; they share one single-use export capability and neither includes its password. Actual iOS installation/display remains unverified. Previously installed profiles and Pangolin trust are unchanged.

## External URL discovery (dev.9)

A blank/missing `home_assistant_origin` selects HA's configured `external_url` using a fixed authenticated GET to `http://supervisor/core/api/config`. An explicit app option always wins and avoids this request. No additional platform grant is added: Core access already exists for optional notifications. Automatic mode now uses it even when notifications are off. The token is removed from the process environment before discovery or any child process; the administrator-directory client retains it for fixed read-only user-list requests, and the notification sender retains it so reminders can be enabled in the UI without restarting. Configuration reads refuse redirects, have a five-second deadline and a 256 KiB body limit, validate only HTTP(S) origin URLs without credentials/path/query/fragment, and discard unrelated configuration. HTTPS remains required when signing is enabled. Discovery does not contact the external URL, write any HA/Supervisor settings, or derive trust from incoming headers. Missing/invalid configuration fails startup closed with a fixed error, not an allowed-origin fallback. The resolved address and source are disclosed only through the existing authorized ingress status endpoint. URL changes take effect on restart.

Pangolin setup is inside the authorized app-access screen. The organization key remains only in page memory and request scope. The CA upload route requires the same ingress identity, origin, session and CSRF protections as other writes. It sends only the public CA to one selected HTTPS resource after rechecking its organization, inline policy, hostname and trust; it never removes a CA or enables mTLS. An uncertain write requires trust inspection before retrying.

## Additional administrator selection (combined dev.9 increment)

The administrator picker is included in dev.9. Configured IDs retain their existing recovery authorization without a fresh directory check for ordinary requests; remove obsolete configured IDs explicitly. It retains the configured ID allowlist as initial/recovery access; there is no first-visitor claim. Picker reads/saves require HTTPS, trusted ingress, session/CSRF protections and a fresh Core directory result proving the visitor is an active, non-system HA owner/administrator. Additional selections persist under private app state with atomic replacement, revision checks and explicit save. Managed-only users are rechecked against the directory before each request and fail closed on deletion/demotion/outage. Saving clears existing app sessions. The fixed Core WebSocket client reads only `config/auth/list` after authentication, with a five-second deadline and bounded completed-message/schema checks; its native framing buffer is not an application streaming limit. Core credentials consequently remain in memory for the directory even with notifications off. No Core user-management write is performed. See [picker implementation and recovery](docs/administrator-picker.md). Actual Supervisor/Core permission acceptance remains unverified.

## Verified administrator setup (dev.10)

The owner authorized setup without manual ID copying. The app permits only setup routes on an empty installation with no configured IDs and no saved selection. The backend matches the trusted ingress actor to a current active, non-system Core administrator and requires HTTPS, session/CSRF/origin protections and explicit save retaining that actor. Viewing the page never claims access. Existing installations do not broaden, and a saved empty selection cannot reopen bootstrap. The setup-completion flag controls presentation after explicit administrator selection. See [setup and recovery](docs/administrator-picker.md).
