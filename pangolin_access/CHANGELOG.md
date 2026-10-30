# Changelog

## 0.1.0-dev.14

- Correct the Pangolin 1.25.3 API-key instructions: the resource CA action is absent from its checkbox list. Use the visible Resource Policy → Update Resource Policy permission and the policy CA endpoint for a selected resource’s inline policy. Shared policies remain ineligible.
- Advise a temporary organization key because Update Resource Policy permits broader policy changes.
- Move expiry reminders into Device certificates. Store the choice in app data, import a retained Supervisor value, and apply changes without a restart. Keep Home Assistant URL override in Configuration because it is needed before the UI can start.

## 0.1.0-dev.13

- Put Home Assistant URL, administrator selection and access check in one setup section; put API-key instructions, Pangolin API URL, Organization ID, resource discovery and CA installation in a second section. Completed setup sections collapse.
- Remove the administrator setup and certificate creation switches from the app configuration. Both services are available after verified setup and HTTPS configuration; CA creation remains an explicit action.
- Accept the Pangolin API URL from the protected setup form. Preserve the former Supervisor URL option as an upgrade fallback; save only the URL in this browser after successful discovery, never the API key.
- Update the installation and troubleshooting instructions for the simplified setup flow.

## 0.1.0-dev.12

- List Pangolin public resources in Set up app access and upload the local CA public certificate to an explicitly selected HTTPS resource. Verify trust by reading back the CA fingerprint.
- Refuse shared policies, conflicting hostnames, non-HTTPS resources and full trust lists. Avoid duplicate uploads and report uncertain writes for reconciliation.
- Update the setup UI, API permissions and installation documentation. mTLS enablement and live TLS verification remain explicit setup steps.

## 0.1.0-dev.11

- Refine configuration labels, setup, device creation and installation guidance. Remove development-phase headings from everyday screens while retaining an early-access release label.
- Add responsive certificate cards, expiry overview, expandable issuer/details and a quieter returning-use layout in light and dark themes.
- Keep the certificate panel mounted when app access is edited, preserving pending installer state.
- Document remaining release gates separately. Authorization, download expiry/single-use controls and Pangolin write restrictions remain in place.

## 0.1.0-dev.10

- Add opt-in setup using the current Core-verified HA administrator, without copying user IDs. Setup-only access ends after explicit selection save; existing configured IDs retain their boundary.
- Merge access verification and account selection. Finish setup confirms access and persists the collapsed administration view; daily use prioritizes certificates.
- Preserve manual recovery IDs. Live HA/Core/Supervisor acceptance remains pending.

## 0.1.0-dev.9

- Rename the configuration label to Home Assistant External URL while preserving the `home_assistant_origin` key and existing explicit values.
- Default new installations to automatic selection from HA's configured external URL through a fixed, bounded Core configuration read at startup. An explicit override wins; missing/invalid discovery fails closed. Show the effective URL and source in the authorized Web UI.
- Remove the Supervisor token from the environment before discovery/child processes; retain it after startup for the separately requested administrator-directory client and enabled notifications. Core API permission now also serves URL discovery in automatic mode, even when notifications are off.
- Include the separately requested additional-administrator name picker, with configured recovery IDs, explicit saves and fresh eligibility checks. Initial setup still needs one configured ID; live HA permission acceptance remains pending.
- Hide Pangolin API forms by default under Advanced and clear form state on close. Explain supported future CA-trust automation separately from the current read-only app. No remote mutations, trust changes or metadata migration.

## 0.1.0-dev.8

- Offer only the installer ZIP for issued iOS/iPadOS identities, named `iOS mTLS installer.zip`. Use readable internal filenames for the Companion identity and named Safari profile. Preserve the protected one-use API formats for existing clients.
- Mark Pangolin API tools as optional setup/testing checks; explain four basic read permissions, three optional inspection reads and zero for daily operation. Add a short repeatable guide.
- Add Home Assistant English configuration labels/descriptions without renaming stored option keys.
- Explain individual revocation limits beside the inventory and in the guide. Replacement is not revocation; no remote trust/activation controls are added.
- Document the authenticated administrator/user-list/persistence work needed for the future user picker. Keep the explicit ID allowlist unchanged.

## 0.1.0-dev.7

- Add a named Safari `.mobileconfig` download using “Home Assistant mTLS - [device name] - expires [actual UTC month/year]”. Preview the generated title in the temporary package panel.
- Include the same encrypted identity as both `.p12` and named profile in the iPhone ZIP for separate Companion/Safari installation. All three format choices share one expiring, actor-bound, single-use capability.
- Omit passwords, MDM enrollment, separate root-trust payloads and restrictions from the unsigned profile. Preserve certificate subjects, CA state, database version and existing installed identities.
- Add independent plist parsing and cryptographic/API checks; document manual iOS installation and its pending real-device validation.

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
