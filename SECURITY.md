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

Implemented POC (`0.1.0-dev.3`): the CA key uses standard encrypted PKCS#8, and a random 0600 local unlock secret enables automatic startup. SQLite metadata remains unencrypted. The paired files are protected by a 0700 directory, but a full backup/host compromise yields both. There is no manual-unlock or separate recovery-archive feature yet. The POC's default-off certificate option additionally requires HTTPS and explicit authenticated creation/download actions. These are implementation facts, not a completed independent review.

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
