# Enroll an iPhone or iPad in Companion

Use this page after [preparing the CA and protected Pangolin resource](installation.md). Initial iOS Companion import/basic/cellular checks have owner-reported PASS results; broader feature and iPadOS compatibility remains separate. Installed app labels can vary. See [recorded results](phase-2-results.md).

## Issue one identity per device

Open the HA app through an already working local/management connection as an allowlisted administrator. Under **Certificate authority and devices → Issue a device identity**, enter the device name, choose iOS/iPadOS and a lifetime, then select **Issue certificate**.

Save the separately displayed password and select **Download .p12 once** before its five-minute expiry. Use a new identity for each device. Do not recreate the installation's CA or reconfigure Pangolin for each enrollment.

The package contains the device private key, its certificate and the public issuer certificate. It is not the public `.pem` that Pangolin trusts. Keep the package/password private and separate during transfer. A downloaded package is not proof of installation.

## Transfer a ZIP to avoid the iOS Settings handoff

AirDropping a bare `.p12` may open iOS Settings for system-wide identity installation. Use an archive when transferring from a Mac:

1. In Finder, right-click the device `.p12` and choose **Compress**.
2. AirDrop the resulting `.zip` to the iPhone/iPad and save/open it in **Files**.
3. Tap the ZIP in Files to extract it. The `.p12` is now available in the extracted folder.
4. Leave the `.p12` in Files; select it from **inside Companion's file importer** rather than tapping it in Files.

[Apple explains ZIP extraction in Files](https://support.apple.com/en-us/102532). The ZIP is a transfer wrapper, not extra encryption; the `.p12` already has its own password protection.

If iOS has a pending Settings installation from an earlier transfer, cancel it when using this app-local workflow. Installing a `.p12` in Settings/Safari does not automatically provision Companion's identity because apps have separate keychain access boundaries. [Apple's keychain explanation](https://developer.apple.com/library/archive/qa/qa1745/_index.html)

## Import inside Companion

The inspected Companion source supports client-certificate selection during onboarding and through an existing server's **Connection / Client Certificate** settings. Choose its import action, select the extracted `.p12` through the Files picker, and enter the password issued with that package.

If the installed build offers no certificate importer, confirm its version/support before proceeding. Do not assume system-wide certificate installation is a substitute.

Preserve your existing working HA connection and record its original URL privately before editing server settings. Configure the protected HTTPS hostname for the intended server. If onboarding requires a working connection before you can reach certificate settings, use the existing local/management connection to access that server's certificate importer first. The exact onboarding flow depends on the installed build; do not remove your only working server entry to experiment.

No global “Always Trust” setting for the client CA is needed. The server's public HTTPS certificate should remain normally trusted. The CA private key is never transferred to the phone or Pangolin.

## Confirm the intended connection

After resource activation, connect through Companion to the protected hostname. Normal HA authentication remains in place; an already logged-in app can reuse its existing HA session. Open a dashboard and use a harmless control to check live updates.

Turn off Wi-Fi and repeat over cellular, then background and reopen the app. Check that the configured server is using the protected external URL: an internal URL, cloud URL, VPN path or another server entry can otherwise make the app appear successful without exercising the intended mTLS edge. Safari is a separate client; its success does not establish Companion success.

Use [troubleshooting](troubleshooting.md) if import or connection fails. The Mac `.p12` curl test is optional diagnosis, documented in [advanced checks](manual-checks.md), not a requirement for every phone.

## Cleanup, replacement and recovery

After import and connection verification, remove unnecessary `.p12`/ZIP copies and unwanted synced copies according to your backup policy. Retain the protected HA app backup containing CA state.

If the temporary download expired, was consumed or was lost after restart, issue a fresh identity. The app does not retain a permanent downloadable package or recover its password. Replacing or reissuing an identity does not revoke the old leaf under the shared CA. Before expiry, issue and manually import a replacement; automatic renewal installation is not implemented.

New devices need an existing management/local enrollment route. Do not add an unauthenticated provisioning exception to the protected hostname. For another person's device, transfer its encrypted package through a trusted method rather than sharing administrator access.
