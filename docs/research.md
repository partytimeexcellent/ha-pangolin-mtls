# Phase 1 evidence and capability matrix

Research date: October 22, 2026 (America/Los_Angeles). No live Pangolin instance, Supervisor installation, or Apple device was tested. “Verified supported” below means documented or confirmed in the inspected source; it does not mean this project has passed an integration test.

## Source baseline and method

- Pangolin release `1.25.1`, commit [`8fbb057626940040b657894f06b69ad6e8b44cb6`](https://github.com/fosrl/pangolin/tree/8fbb057626940040b657894f06b69ad6e8b44cb6), downloaded and inspected locally. The release follows [1.25's mTLS announcement](https://pangolin.net/news/1-25-release).
- Official [client mTLS guide](https://docs.pangolin.net/manage/access-control/mtls), [integration API guide](https://docs.pangolin.net/manage/integration-api), and [common API routes](https://docs.pangolin.net/manage/common-api-routes). Public hosted OpenAPI JSON could not be fetched through the research browser; source registrations and integration router were inspected instead. Do not substitute hosted documentation for the deployed server's schema during implementation.
- Apple Companion source, current development branch commit [`ebd6271231833b29e2b63676fb1d0fc8727c761e`](https://github.com/home-assistant/iOS/tree/ebd6271231833b29e2b63676fb1d0fc8727c761e), committed October 22, 2026. This is not proof that an App Store version includes every inspected behavior.
- Official HA app documentation, including [configuration](https://contributors.home-assistant.io/apps/reference/configuration/), [repository distribution](https://contributors.home-assistant.io/apps/guides/repository/), [container builds](https://contributors.home-assistant.io/apps/guides/dockerfile/), [communication](https://developers.home-assistant.io/docs/apps/communication/), and the indexed [ingress requirements](https://developers.home-assistant.io/docs/apps/presentation/). Documentation is undergoing URL migration; the new dedicated ingress page timed out during research. Revalidate its identity-header contract on real Supervisor.
- Apple [QA1745](https://developer.apple.com/library/archive/qa/qa1745/_index.html), [current developer clarification](https://developer.apple.com/forums/thread/791563), and [Keychain import guide](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac). General Companion networking docs describe Android certificate installation and must not be used as proof of iOS system-keychain access.

Source checkouts are temporary research inputs outside the project; no upstream application code has been copied into this repository.

## Capability classification

| Planned capability | Classification | Evidence / consequence |
| --- | --- | --- |
| HTTPS public-resource client mTLS | Verified supported | Pangolin guide and `applyMtlsConfig` use `RequireAndVerifyClientCert` |
| Add/list/delete trusted CA through public integration API | Verified supported | Authenticated router plus OpenAPI registrations in 1.25.1 |
| Enable resource mTLS through API | Verified supported | `POST /public-resource/{resourceId}`, `mtlsEnabled: true`; requires SSL and a CA |
| API-key connection validation | Verified supported | Bearer auth, authenticated root health route and scoped read routes; verify actual permissions with relevant reads |
| Discover all organizations with an organization key | Currently unsupported | `GET /orgs` explicitly requires a root key; ask for org ID instead |
| List sites/domains/resources/targets; create/update resource and target | Verified supported | Integration routes and schemas below; site must actually reach Core |
| API stability across all 1.25+ releases | Supported with limitations | Official API guide warns of breaking changes; pin and contract-test versions |
| Avoid changing unrelated policy/CA state | Supported with limitations | Scope writes; refuse shared-policy resources in v1; no atomic multi-operation API assumed |
| CRL/OCSP enforcement for public-resource client identities | Currently unsupported in inspected interface | No revocation fields/routes or checks in inspected public-resource mTLS path; not a claim about every possible external Traefik customization |
| Individual leaf serial/fingerprint denylist or allowlist | Currently unsupported in inspected interface | Trust records are CA certificates, not per-leaf enforcement records |
| Shared CA with per-device “revoke now” | Currently unsupported | Local record change cannot change TLS verification |
| Remove one independently trusted per-device CA | Requires prototype/testing | Candidate isolation mechanism; 20-CA limit and final-CA disable behavior matter |
| CA rotation / trust removal | Supported with limitations | API supports overlapping trust; new-handshake propagation, session resumption and existing connections need tests |
| Certificate issuance and encrypted PKCS#12 export | Verified supported by chosen tools | [OpenSSL export documentation](https://docs.openssl.org/3.5/man1/openssl-pkcs12/); concrete profiles still require tests |
| iOS/iPadOS Companion app-local `.p12` import | Supported with limitations | Source has file picker, password prompt and `SecPKCS12Import`; installed release and full networking matrix unverified |
| Install in Safari/Settings and automatically make available to Companion | Currently unsupported for proposed unmanaged workflow | Apple access-group isolation; use Companion's own importer |
| Silent web-to-Companion identity installation | Currently unsupported | No verified supported handoff API; manual user import required |
| macOS Safari identity import through Keychain | Supported with limitations | Apple documents import; selection against this Pangolin chain needs a real-device test |
| macOS Companion mTLS | Requires prototype/testing | Shared Apple source supports client identities, but macOS build/import/runtime behavior not demonstrated |
| Local authenticated enrollment, short-lived single-use tokens | Requires prototype/testing | Proposed app behavior, not an upstream feature already tested |
| Automatic reliable enrollment success detection | Currently unsupported in v1 | Download is not installation; app is outside the user data path |
| Automatic renewal installation on unmanaged Apple devices | Currently unsupported in v1 | New package still needs user import |
| Ingress subpaths / downloads / WebSockets | Requires prototype/testing | HA supports ingress; our implementation does not exist yet |
| Supervisor installation and persistence on both architectures | Requires prototype/testing | Packaging supported by HA; no image has been built |
| Encrypted recovery export and restore | Requires prototype/testing | Required design; archive format and restore drill pending |

## Exact public API inventory

All paths below are relative to the configured integration API base ending in `/v1`. They are **not** Pangolin dashboard `/api/v1` session endpoints. Self-hosters must enable and securely route the integration API. Obtain that URL from the administrator rather than guessing it from the dashboard hostname.

Source: [`server/routers/integration.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/routers/integration.ts), [`integrationApiServer.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/integrationApiServer.ts). The server provides `/v1/docs`, `/v1/openapi.json`, and `/v1/openapi.yaml`. Registrations live alongside route handlers.

| Method and path | Minimum relevant action / note |
| --- | --- |
| `GET /orgs` | `listOrgs`, root key only; excluded by default |
| `GET /org/{orgId}` | `getOrg`; validate manually entered org |
| `GET /org/{orgId}/sites` | `listSites` |
| `GET /org/{orgId}/site/{niceId}` | `getSite` |
| `GET /org/{orgId}/domains` | `listOrgDomains` |
| `GET /org/{orgId}/public-resources` | `listResources` |
| `PUT /org/{orgId}/public-resource` | `createResource`; name, domainId, mode `http`, optional subdomain |
| `GET /public-resource/{resourceId}` | `getResource` |
| `POST /public-resource/{resourceId}` | `updateResource`; optional fields include `ssl`, `mtlsEnabled`, `enabled`, `blockAccess`, `niceId` |
| `GET /public-resource/{resourceId}/policies` | `getResourcePolicy`; detect inherited configuration |
| `GET /public-resource-policy/{resourcePolicyId}` | `getResourcePolicy`; inspect only, no shared policy mutation in v1 |
| `PUT /public-resource/{resourceId}/target` | `createTarget`; siteId, ip, port, optional method and enabled |
| `GET /public-resource/{resourceId}/targets` | `listTargets` |
| `GET /target/{targetId}` | `getTarget` |
| `POST /target/{targetId}` | `updateTarget` |
| `PUT /public-resource/{resourceId}/mtls/certificate` | `createResourceMtlsCertificate`; body `{certificate: publicPem, name?: label}` |
| `GET /public-resource/{resourceId}/mtls/certificates` | `listResourceMtlsCertificates` |
| `DELETE /public-resource/{resourceId}/mtls/certificate/{mtlsCertificateId}` | `deleteResourceMtlsCertificate`; response includes `mtlsDisabled` |

Each route also enforces appropriate organization/resource/target access. Key action names above are code identifiers; confirm their display names and exact grants on the deployed edition. Read-only setup should not require writes; request create/update/CA-delete privileges only for enabled features. Resource/target deletion permissions are unnecessary for the initial workflow. Treat 401 as authentication failure, 403 as missing authorization, 404 as ambiguous object/route absence, and timeouts as unknown outcomes, not proof of unsupported APIs.

Target updates are not arbitrary partial patches: the inspected `updateTarget.ts` schema requires `siteId` and `ip` even when changing `enabled`. Reread and validate these fields, then supply only the required target identity plus intended changes; do not send an entire stale target object.

[`createResource.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/routers/resource/createResource.ts) accepts `mode: "http"`; the old `http`/`protocol` fields are deprecated. It does not accept `enabled`, `mtlsEnabled`, or caller-selected `niceId` on creation. Creation and configuration must be separate journaled steps. [`updateResource.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/routers/resource/updateResource.ts) validates CA presence before enabling mTLS and prevents SSL being disabled while mTLS is enabled. [`createTarget.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/routers/target/createTarget.ts) supports initially disabled targets.

## Enforcement details and consequences

[`server/lib/mtls.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/lib/mtls.ts) implements certificate storage, effective ownership, a maximum of 20 trust entries, duplicate handling, and final-certificate removal that switches mTLS off. Bundled PEM certificates count individually. Resource writes go to its inline policy when appropriate, otherwise resource storage; shared policy trust can win at the edge. A successful write alone is insufficient verification of effective trust.

[`server/lib/traefik/mtls.ts`](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/lib/traefik/mtls.ts) builds CA trust and `RequireAndVerifyClientCert` options and forwards certificate information. The inspected configuration has no serial filter, CRL source, or OCSP lookup. Searching the relevant handlers and helpers found no public-resource revocation mechanism. Do not treat CRL extensions on issued certificates as evidence that the edge checks them. Upstream support may evolve; recheck before release.

That helper also notes TLS options resolve by hostname. Conflicting routers sharing a hostname can cause fallback behavior. Use a dedicated hostname, inventory redirects/router conflicts, and probe every relevant path/entrypoint. The [redirect configuration source](https://github.com/fosrl/pangolin/blob/8fbb057626940040b657894f06b69ad6e8b44cb6/server/lib/traefik/redirect.ts) attempts to preserve resource mTLS on redirects; still test it in the actual deployed configuration.

## Apple client evidence

At the pinned Companion development commit:

- [`ClientCertificateOnboardingView.swift`](https://github.com/home-assistant/iOS/blob/ebd6271231833b29e2b63676fb1d0fc8727c761e/Sources/App/Onboarding/Views/ClientCertificateOnboardingView.swift) accepts p12/pfx files, asks for a password and imports them.
- [`ClientCertificateView.swift`](https://github.com/home-assistant/iOS/blob/ebd6271231833b29e2b63676fb1d0fc8727c761e/Sources/App/Settings/Connection/ClientCertificateView.swift) and `ConnectionSettingsView.swift` expose a per-server certificate settings page.
- [`ClientCertificate.swift`](https://github.com/home-assistant/iOS/blob/ebd6271231833b29e2b63676fb1d0fc8727c761e/Sources/HANetworking/Sources/ClientCertificate.swift) imports identities with Apple's Security framework, stores chain material and creates URL credentials. It also retains transfer material for paired-device behavior; therefore a certificate should not be described as hardware-bound or guaranteed to stay on one physical device. Its expiration extraction currently returns nil, so our inventory must calculate expiry independently.
- [`ClientCertificateSessionDelegate.swift`](https://github.com/home-assistant/iOS/blob/ebd6271231833b29e2b63676fb1d0fc8727c761e/Sources/HANetworking/Sources/ClientCertificateSessionDelegate.swift) handles client-certificate challenges. WebView and onboarding code also reference client identity handling.

No source review proves App Store deployment, WebSocket/background/media coverage, or macOS compatibility. Record actual app/OS versions in Phase 2. Earlier issue reports and beta comments are useful hints but are not the compatibility contract. No automated configuration-profile installation or new client code is proposed.

## Read-only adapter refresh: Pangolin 1.25.2

Reviewed tag `1.25.2`, commit `ed9af13e697f7847f19711417e88aae5ef6935bc`. The diff from 1.25.1 does not alter the integration router, integration OpenAPI server, or the four read handlers used here. Source: [integration router](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/integration.ts), [OpenAPI server](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/integrationApiServer.ts), [organization](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/org/getOrg.ts), [sites](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/site/listSites.ts), [domains](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/domain/listDomains.ts), [resources](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/resource/listResources.ts).

The OpenAPI `info.version` is `v1`, not the installed Pangolin release; the check therefore does not claim to detect its software version. Sites/resources accept `pageSize`/`page`; domains accept `limit`/`offset`. Responses wrap `data` with success/error flags. Resource list `mtls` is an API observation, not a handshake result. Read-only code checks deployed route advertisement and selected response fields; it does not claim full JSON Schema equivalence or authorization for advertised writes.

## Selected-resource inspection contract (1.25.2)

The pinned `ed9af13e697f7847f19711417e88aae5ef6935bc` integration router has numeric public-resource GET routes but no org/niceId resource GET binding, even though the shared handler registers an org/niceId OpenAPI route. Dev.5 resolves an exact identifier through bounded `GET /org/{orgId}/public-resources?query=...&pageSize=20&page=1` and refuses incomplete or ambiguous searches. It verifies the subsequent numeric detail response's resource ID, org ID, identifier and hostname. No advertised-only niceId route is assumed to work.

The [policy read handler](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/resource/getResourcePolicies.ts) returns `data.defaultPolicy` and nullable `data.sharedPolicy`; [resource details](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/resource/getResource.ts) return fields directly in `data`. Targets use `limit`/`offset` pagination. Source diff from 1.25.1 does not change these inspected handlers/router bindings.

The resource certificate-list route requires `listResourceMtlsCertificates`, absent from the pinned UI permission picker. The supported [policy certificate-list route](https://github.com/fosrl/pangolin/blob/ed9af13e697f7847f19711417e88aae5ef6935bc/server/routers/policy/listResourcePolicyMtlsCertificates.ts) instead requires `getResourcePolicy`, with organization access verification. For a non-shared resource with a default policy, this is the inline trust owner in `getResourceMtlsOwner`. Shared-policy trust is read explicitly but marked shared-policy-only; the edge can fall back to legacy resource trust under some settings, so dev.5 flags shared policy assignments for manual review and makes no complete effective-trust claim. No root key or undocumented API/database workaround is required.
