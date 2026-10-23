# Enroll an iPhone or iPad in Companion or Safari

Use this page after [preparing the CA and protected Pangolin resource](installation.md). Initial iOS Companion import/basic/cellular checks have owner-reported PASS results; broader feature and iPadOS compatibility remains separate. Safari installation below follows Apple documentation and has not yet been verified with this project. Other iOS browsers and Home Screen web apps need separate checks. Installed app labels can vary. See [recorded results](phase-2-results.md).

## Issue one identity per device

Open the HA app through an already working local/management connection as an allowlisted administrator. Under **Certificate authority and devices → Issue a device identity**, enter the device name, choose iOS/iPadOS and a lifetime, then select **Issue certificate**.

Save the separately displayed password and select **Download iPhone ZIP once** (or **Download .p12 once** if no archive is needed) before its five-minute expiry. Use a new identity for each device. Do not recreate the installation's CA or reconfigure Pangolin for each enrollment.

The package contains the device private key, its certificate and the public issuer certificate. It is not the public `.pem` that Pangolin trusts. Keep the package/password private and separate during transfer. A downloaded package is not proof of installation.

## Choose where to install the identity

| Intended client | Installation path |
| --- | --- |
| Companion | Import the `.p12` inside Companion, using its Files picker. ZIP transfer avoids the unwanted Settings handoff. |
| Safari | Open the bare `.p12` and complete identity installation in iOS Settings. The Settings handoff is useful for this client. |
| Both on the same iPhone | Use the same `.p12` and password for both installations. Import into Companion first from Files, then open that file for Settings installation. |

Using one identity for Safari and Companion on your own physical device is a reasonable default when both should have the same access. iOS stores the identity separately for Apple apps and for Companion; installing it in one place does not automatically install it in the other. [Apple explains keychain access](https://developer.apple.com/library/archive/qa/qa1745/_index.html).

Both installations contain the same private key. Compromise of either copy compromises that identity, and the certificate alone cannot distinguish Safari traffic from Companion traffic. The package is not hardware-bound: anyone with the file and password could install it elsewhere. Use a fresh identity for each additional physical device. Separate app identities are an option when you need distinct certificate records, but the current shared-CA setup still does not offer individual certificate revocation.

Download once and keep the encrypted package available only until both intended imports and connection checks succeed. The ZIP and P12 buttons share one single-use download permission; you do not need a second download to install the same file twice. If you already deleted the downloaded file after importing into Companion, issue a replacement and update both installations; the app cannot recover that earlier package or password.

## Transfer a ZIP to avoid the iOS Settings handoff

AirDropping a bare `.p12` may open iOS Settings for system-wide identity installation. Use an archive when transferring from a Mac:

1. Download **iPhone ZIP** directly from the app. If you already chose the bare `.p12` instead, right-click it in Finder and choose **Compress**. Both app download buttons share one single-use permission.
2. AirDrop the resulting `.zip` to the iPhone/iPad and save/open it in **Files**.
3. Tap the ZIP in Files to extract it. The `.p12` is now available in the extracted folder.
4. Leave the `.p12` in Files; select it from **inside Companion's file importer** rather than tapping it in Files.

[Apple explains ZIP extraction in Files](https://support.apple.com/en-us/102532). The ZIP is a transfer wrapper, not extra encryption; the `.p12` already has its own password protection.

If you only want Companion access, cancel any unwanted pending Settings installation from an earlier transfer. If you also want Safari access, complete the Settings installation separately as described below. Installing a `.p12` in Settings/Safari does not automatically provision Companion's identity because apps have separate keychain access boundaries. [Apple's keychain explanation](https://developer.apple.com/library/archive/qa/qa1745/_index.html)

## Import inside Companion

The inspected Companion source supports client-certificate selection during onboarding and through an existing server's **Connection / Client Certificate** settings. Choose its import action, select the extracted `.p12` through the Files picker, and enter the password issued with that package.

If the installed build offers no certificate importer, confirm its version/support before proceeding. Do not assume system-wide certificate installation is a substitute.

Preserve your existing working HA connection and record its original URL privately before editing server settings. Configure the protected HTTPS hostname for the intended server. If onboarding requires a working connection before you can reach certificate settings, use the existing local/management connection to access that server's certificate importer first. The exact onboarding flow depends on the installed build; do not remove your only working server entry to experiment.

No global “Always Trust” setting for the client CA is needed. The server's public HTTPS certificate should remain normally trusted. The CA private key is never transferred to the phone or Pangolin.

## Install for Safari through iOS Settings

1. Use an existing working local/management connection to obtain the identity. Do not rely on the protected hostname to download your first certificate before it is installed.
2. Open or AirDrop the bare `.p12`. If it is inside a ZIP, extract it in Files first. For both clients, import it into Companion from its picker before opening the same file for the iOS installation flow.
3. Open **Settings → Profile Downloaded**, or **Settings → General → VPN & Device Management**, and select the pending identity/profile. Review its contents, choose **Install**, and enter the device passcode and package password when requested. This installs a certificate identity; it does not enroll the phone in a device management service. Installation requires your approval, rather than happening silently. [Apple's certificate distribution guide](https://support.apple.com/en-ca/guide/deployment/depcdc9a6a3f/web), [profile installation instructions](https://support.apple.com/en-gb/102400).
4. With the prepared resource active and mTLS enabled, open the protected HA HTTPS hostname in Safari. Select or approve the identity if Safari prompts, then complete normal HA login.
5. Test Safari separately over cellular: open a dashboard and check a harmless control. A successful Companion connection does not establish Safari success. Record the Safari result separately; this project's Safari workflow remains unverified until tested.

For client authentication to a website with a normally trusted public HTTPS certificate, you do not need to enable **full trust for root certificates** for this client CA. Client identity installation and trusting a CA to authenticate websites serve different purposes. Keep normal server-certificate verification enabled.

## Confirm the intended connection

After resource activation, connect through Companion to the protected hostname. Normal HA authentication remains in place; an already logged-in app can reuse its existing HA session. Open a dashboard and use a harmless control to check live updates.

Turn off Wi-Fi and repeat over cellular, then background and reopen the app. Check that the configured server is using the protected external URL: an internal URL, cloud URL, VPN path or another server entry can otherwise make the app appear successful without exercising the intended mTLS edge. Safari is a separate client; its success does not establish Companion success.

Use [troubleshooting](troubleshooting.md) if import or connection fails. The Mac `.p12` curl test is optional diagnosis, documented in [advanced checks](manual-checks.md), not a requirement for every phone.

## Cleanup, replacement and recovery

If the identity is used in both Safari and Companion, complete both imports and test both clients before cleanup. After import and connection verification, remove unnecessary `.p12`/ZIP copies and unwanted synced copies according to your backup policy. Retain the protected HA app backup containing CA state.

If the temporary download expired, was consumed or was lost after restart, issue a fresh identity. The app does not retain a permanent downloadable package or recover its password. Replacing or reissuing an identity does not revoke the old leaf under the shared CA. Before expiry, use **Replace certificate** and follow the [guided replacement steps](certificate-management.md#replace-a-device-certificate); automatic installation is not implemented. When sharing an identity between Safari and Companion, install and test its replacement in both places before selecting **Confirm replacement tested**. Removing a Settings profile does not remove Companion’s separate identity, or vice versa.

New devices need an existing management/local enrollment route. Do not add an unauthenticated provisioning exception to the protected hostname. For another person's device, transfer its encrypted package through a trusted method rather than sharing administrator access.
