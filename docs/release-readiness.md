# Release readiness

Updated October 30, 2026. Current working version: 0.1.0-dev.13, early access.

The daily interface now uses finished product language. That does not change the release status: a polished interface is one part of a production release. The [validation plan](validation-plan.md) defines the checks; [recorded results](phase-2-results.md) distinguishes local fixtures from actual HA/device/edge observations.

## What works today

The app can create a dedicated certificate authority, issue encrypted device installers, track expiry, guide replacement and list Pangolin public resources and install its public CA on an explicitly selected resource. First setup can retrieve the signed-in HA administrator's ID and save a selection without copying it. Selected ingress, Companion and fresh TLS rejection checks have recorded results. Certificate creation requires verified administrator setup, an HTTPS Home Assistant URL and an explicit create action. Pangolin CA installation requires an explicit resource selection. mTLS enablement and live enforcement testing remain manual actions.

## Still pending before a production release

| Area | Remaining work and evidence |
| --- | --- |
| HA setup and access | Verify the current no-ID setup, Core directory permissions, automatic URL discovery, administrator changes, denial/recovery and configuration labels through actual Supervisor ingress. Run the broader authorization matrix. |
| Recovery | Test a protected cold backup restored into an isolated installation, signing-key/metadata consistency and invalidation of old exports. Implement and validate separate encrypted recovery export and the recovery procedure. |
| Certificate lifecycle | Implement and validate CA rotation with overlapping trust; test old/new certificates, interrupted operations and existing/resumed sessions. Individual shared-CA certificate revocation remains unavailable. |
| Clients and TLS | Validate Safari profile installation, iPadOS/macOS and the claimed Companion features. Complete expired/not-yet-valid/wrong-purpose rejection and alternate edge/path coverage. Test real reminder delivery and replacement. |
| Current build | Dev.11 code commit `4d0041c` passed pinned Node 24 checks and native amd64/aarch64 container/runtime checks in [CI run 40061038749](https://github.com/partytimeexcellent/ha-pangolin-mtls/actions/runs/40061038749). Installation and actual HA acceptance remain pending; later code changes need their own checks. |
| Security and distribution | Complete source/dependency/container review, release packaging and provenance, a supported-version policy, license decision, private security reporting and release documentation. |

Phase 3 continues to require successful POC validation and owner review. Live infrastructure changes and deployment remain outside this release-readiness assessment. Publishing a production release requires evidence for its claimed baseline; relabeling the build does not satisfy these gates.

## Interface organization

- **Home Assistant setup** shows URL, administrator selection and access check, then collapses when complete. **Pangolin setup** shows exact API-key permissions, API URL, Organization ID, key, resources and CA installation; it collapses after installation.
- **Device certificates** is the daily workspace: expiry overview, certificate cards, replacement and **Add a device**. Certificate authority details, reminder guidance and certificate identifiers expand on demand.
- **Install on your device** appears after certificate creation, with a separately displayed password, one-use download and installation steps.

Configuration labels describe the action or decision. Existing option keys/defaults remain compatible; **Recovery administrator IDs (optional)** is an escape hatch rather than an ordinary setup prerequisite. The UI retains relevant limits (for example, replacement does not revoke an old identity) beside the affected workflow.
