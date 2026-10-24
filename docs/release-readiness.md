# Release readiness

Updated October 23, 2026. Current working version: 0.1.0-dev.11, early access.

The daily interface now uses finished product language. That does not change the release status: a polished interface is one part of a production release. The [validation plan](validation-plan.md) defines the checks; [recorded results](phase-2-results.md) distinguishes local fixtures from actual HA/device/edge observations.

## What works today

The app can create a dedicated certificate authority, issue encrypted device installers, track expiry, guide replacement and perform optional read-only Pangolin checks. Opt-in first setup can retrieve the signed-in HA administrator's ID and save a selection without copying it. Selected ingress, Companion and fresh TLS rejection checks have recorded results. Certificate creation is default-off; installation and Pangolin trust setup require explicit manual actions.

## Still pending before a production release

| Area | Remaining work and evidence |
| --- | --- |
| HA setup and access | Verify the current no-ID setup, Core directory permissions, automatic URL discovery, administrator changes, denial/recovery and configuration labels through actual Supervisor ingress. Run the broader authorization matrix. |
| Recovery | Test a protected cold backup restored into an isolated installation, signing-key/metadata consistency and invalidation of old exports. Implement and validate separate encrypted recovery export and the recovery procedure. |
| Certificate lifecycle | Implement and validate CA rotation with overlapping trust; test old/new certificates, interrupted operations and existing/resumed sessions. Individual shared-CA certificate revocation remains unavailable. |
| Clients and TLS | Validate Safari profile installation, iPadOS/macOS and the claimed Companion features. Complete expired/not-yet-valid/wrong-purpose rejection and alternate edge/path coverage. Test real reminder delivery and replacement. |
| Current build | Run the final changes on the pinned Node 24 runtime and both native container architectures. Existing CI results apply to their recorded commits, not automatically to this working tree. |
| Security and distribution | Complete source/dependency/container review, release packaging and provenance, a supported-version policy, license decision, private security reporting and release documentation. |

Phase 3 continues to require successful POC validation and owner review. This refinement does not enable remote Pangolin writes, live infrastructure changes or deployment. Publishing a production release requires evidence for its claimed baseline; relabeling the build does not satisfy these gates.

## Interface organization

- **Set up app access** guides account verification and explicit administrator selection. After confirmation it becomes the collapsed **App access · Set up** section.
- **Device certificates** is the daily workspace: expiry overview, certificate cards, replacement and **Add a device**. Certificate authority details, reminder guidance and certificate identifiers expand on demand.
- **Install on your device** appears after certificate creation, with a separately displayed password, one-use download and installation steps.
- **Pangolin connection checks** is optional and closed by default. Expanding it does not contact Pangolin. Collapsing clears its form state.

Configuration labels describe the action or decision. Existing option keys/defaults remain compatible; **Recovery administrator IDs (optional)** is an escape hatch rather than an ordinary setup prerequisite. The UI retains relevant limits (for example, replacement does not revoke an old identity) beside the affected workflow.
