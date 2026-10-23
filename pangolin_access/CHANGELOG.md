# Changelog

## 0.1.0-dev.6

- Show certificate/CA expiry and guide device replacement with a fresh identity, import instructions and explicit owner test confirmation. Keep older certificates valid and suppress only their reminders after confirmation.
- Add a one-use ZIP download containing the encrypted `.p12` for iPhone transfer. ZIP and bare P12 share one five-minute, actor-bound download capability; neither includes the password.
- Add optional HA persistent expiry notifications at 30/14/7/1 days and expiry, with restart-safe deduplication and hourly retry. Off by default; no mobile push or automatic issuance/import.
- Request Core API access for the fixed persistent-notification service. Retain the Supervisor token only in the notification sender when enabled; remove it from the process environment before child processes start.
- Migrate storage to version 2. Take a protected backup before updating; earlier builds cannot open the migrated database. Pangolin configuration remains manual.

## 0.1.0-dev.5

- Add read-only selected-resource inspection by exact organization, identifier and expected hostname.
- Read resource settings, inline/shared policies, bounded targets and policy CA trust; flag shared policies, existing targets/trust, authentication/rules and hostname matches for review.
- Require Get Resource, Get Resource Policy and List Targets read permissions in addition to the connection-check permissions. No write permission or remote mutation.
- Show fixed failing-operation labels for API errors. Register error redaction before route/plugin setup so early routes use the intended handler.
- Keep credentials request-scoped, network destinations pinned and all checks explicit. No automatic adoption, certificate upload, activation or TLS-enforcement claim.

## 0.1.0-dev.4

- Add an explicit read-only Pangolin integration API check: deployed OpenAPI, organization, and first-page sites/domains/resources.
- Keep the API URL in Supervisor options; accept the organization key through an HTTPS, ingress/session/CSRF-protected form for one check only, without persistence.
- Verify HTTPS certificates, pin a public DNS address, block private/reserved destinations and redirects, bound responses/deadlines, and redact upstream errors.
- Report advertised mTLS routes separately from permissions and actual enforcement. No Pangolin writes or automatic background checks.

## 0.1.0-dev.3

- Add default-off, HTTPS-only CA creation and device certificate issuance, protected by the existing ingress/user/session/CSRF checks.
- Generate RSA-3072/SHA-256 identities with clientAuth EKU and encrypted PKCS#12 packages; retain public issuance history in SQLite.
- Store the CA signing key as encrypted PKCS#8 with a local automatic-unlock secret; disclose the limits of colocated key storage.
- Add actor-bound hashed download capabilities, single-use POST redemption, five-minute in-memory retention and restart invalidation.
- Add CA public-certificate download and responsive issuance UI; no private-key or permanent package-download endpoint.
- Add disposable cryptographic, API, restart/restore and native runtime tests. Pangolin configuration, Apple import validation, renewal, rotation and separate recovery export remain pending.

## 0.1.0-dev.2

- Show the specific failed stage and a fixed diagnostic code instead of replacing all access failures with a generic message.
- Distinguish mismatched, missing and opaque browser origins while retaining strict origin, session, CSRF and ingress authorization checks.
- Log only fixed access-denial codes; never request URLs, identities, headers, bodies or tokens.
- Display the installed build version and add tests for safe diagnostic rendering.

## 0.1.0-dev.1

- Add an ingress-only administrator access prototype with explicit user allowlisting, session expiry, CSRF/origin checks, rate limits and relative UI assets.
- Add local HA packaging and automated negative authorization tests.
- Certificate issuance and Pangolin configuration are intentionally unavailable pending live ingress acceptance.
