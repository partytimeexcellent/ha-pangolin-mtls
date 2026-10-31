# Enroll an iPhone or iPad in Companion or Safari

Use this page after [preparing the CA and protected Pangolin resource](installation.md). Initial iOS Companion import/basic/cellular checks have owner-reported PASS results; broader feature and iPadOS compatibility remains separate. Safari installation below follows Apple documentation and has not yet been verified with this project. Other iOS browsers and Home Screen web apps need separate checks. Installed app labels can vary. See [recorded results](phase-2-results.md).

## Issue one identity per device

Open the HA app through an already working local/management connection as an authorized app administrator. Under **Device certificates → Add a device**, enter the device name, choose **iPhone or iPad** and a lifetime, then select **Create device certificate**. Both devices use the same selector and ZIP format.

Save the separately displayed password and select **Download certificate package (.zip)** before its five-minute expiry. Use a new identity for each device. Do not recreate the installation's CA or reconfigure Pangolin for each enrollment.

The package contains the device private key, its certificate and the public issuer certificate. It is not the public `.pem` that Pangolin trusts. Keep the package/password private and separate during transfer. A downloaded package is not proof of installation.

## Choose where to install the identity

| Intended client | Installation path |
| --- | --- |
| Companion | Import the `.p12` inside Companion, using its Files picker. ZIP transfer avoids the unwanted Settings handoff. |
| Safari | Download the certificate package ZIP and use Install for Safari.mobileconfig to complete installation in iOS Settings. |
| Both on the same iPhone | Download the certificate package ZIP: import Home Assistant identity.p12 inside Companion, then install Install for Safari.mobileconfig in Settings. Both contain the same encrypted identity and use the same password. |

Using one identity for Safari and Companion on your own physical device is a reasonable default when both should have the same access. iOS stores the identity separately for Apple apps and for Companion; installing it in one place does not automatically install it in the other. [Apple explains keychain access](https://developer.apple.com/library/archive/qa/qa1745/_index.html).

Both installations contain the same private key. Compromise of either copy compromises that identity, and the certificate alone cannot distinguish Safari traffic from Companion traffic. The package is not hardware-bound: anyone with the file and password could install it elsewhere. Use a fresh identity for each additional physical device. Separate app identities are an option when you need distinct certificate records, but the current shared-CA setup still does not offer individual certificate revocation.

Download once and keep the encrypted package available only until both intended imports and connection checks succeed. The certificate package ZIP has one single-use download permission; you do not need a second download to install the same file twice. If you already deleted the downloaded file after importing into Companion, issue a replacement and update both installations; the app cannot recover that earlier package or password.

## Transfer a ZIP to avoid the iOS Settings handoff

AirDropping a bare `.p12` may open iOS Settings for system-wide identity installation. Use an archive when transferring from a Mac:

1. Choose **Download certificate package (.zip)**. For iOS/iPadOS the app offers only this download, named **iPhone or iPad certificate package.zip**.
2. AirDrop the resulting `.zip` to the iPhone/iPad and save/open it in **Files**.
3. Tap the ZIP in Files to extract it. It contains **Home Assistant identity.p12** for Companion and **Install for Safari.mobileconfig** for Safari. Both wrap the same identity. Install only the file for the client you use, or both for both clients.
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
2. Download **iPhone or iPad certificate package.zip** and extract it. Open or AirDrop **Install for Safari.mobileconfig** to start the Settings installation flow. If you also use Companion, import **Home Assistant identity.p12** through its picker. If your installed iOS version does not hand the extracted profile to Settings, transfer that same profile separately from your Mac; do not issue another identity just to retry transfer. A bare `.p12` can still be installed, but iOS may title it generically as “Identity Certificate.”
3. Open **Settings → Profile Downloaded**, or **Settings → General → VPN & Device Management**, and select the pending identity/profile. Review its contents, choose **Install**, and enter the device passcode and package password when requested. This installs a certificate identity; it does not enroll the phone in a device management service. Installation requires your approval, rather than happening silently. [Apple's certificate distribution guide](https://support.apple.com/en-ca/guide/deployment/depcdc9a6a3f/web), [profile installation instructions](https://support.apple.com/en-gb/102400).
4. With the prepared resource active and mTLS enabled, open the protected HA HTTPS hostname in Safari. Select or approve the identity if Safari prompts, then complete normal HA login.
5. Test Safari separately over cellular: open a dashboard and check a harmless control. A successful Companion connection does not establish Safari success. Record the Safari result separately; this project's Safari workflow remains unverified until tested.

For client authentication to a website with a normally trusted public HTTPS certificate, you do not need to enable **full trust for root certificates** for this client CA. Client identity installation and trusting a CA to authenticate websites serve different purposes. Keep normal server-certificate verification enabled.

## Meaningful names in Settings (dev.7)

The named Safari profile uses **Home Assistant mTLS - [device name] - expires [month year]**, using the device name you enter and the certificate's actual UTC expiry month. The temporary download panel previews the title. Use a recognizable device label without sensitive information; it will appear in Settings and the unencrypted profile metadata. The certificate's internal opaque identifier is unchanged.

The `.mobileconfig` contains one encrypted PKCS#12 identity, with no password, MDM enrollment, restrictions or separate root-trust payload. Enter the separately displayed package password during installation. The profile itself is unsigned, so iOS may show **Not Signed** or **Unverified**. Review its expected name and single identity payload before approving it; the profile makes no claim of verified publisher identity. These properties follow [Apple's profile schema](https://github.com/apple/device-management/blob/release/mdm/profiles/TopLevel.yaml) and [PKCS#12 payload schema](https://github.com/apple/device-management/blob/release/mdm/profiles/com.apple.security.pkcs12.yaml). Profile display and installation with this project still require a real iOS check.

For iOS/iPadOS, the ZIP is the only offered format. It contains both files under one five-minute, single-use download permission and adds no encryption. Older builds and API clients may still support individual file formats. Already installed profiles are not renamed by an app update. If you no longer have the original package, issue a replacement, install and test it in each intended client, and only then remove the obsolete Settings profile. A new certificate's profile has a distinct identifier and does not silently overwrite or remove older profiles. Nothing changes in Pangolin for a replacement under the existing trusted CA.

## Why does iOS say “Not Signed”?

This refers to the configuration-profile wrapper, not the client certificate inside it. The current app deliberately exports an unsigned `.mobileconfig`; the enclosed client certificate is signed by your CA and its private key remains inside a password-encrypted P12. The profile contains no P12 password. A profile signature would authenticate the wrapper's origin and integrity; it would not add encryption or make an otherwise untrusted issuer trusted automatically.

An Apple Developer Program account is not inherently required to sign a configuration profile. Apple Configurator supports **File → Sign Profile** with a suitable certificate/private-key identity. For iOS to trust the signer, its certificate chain must also be trusted and suitable for profile signing. A self-signed signature alone does not guarantee a **Verified** label. [Apple Configurator signing instructions](https://support.apple.com/en-hk/guide/apple-configurator-mac/pmd85719196/mac).

Automatic profile signing is not implemented. Adding it would require a separate signing identity, protected key storage, a defined trust/distribution approach and real-device validation. The current app does not reuse a public web-server private key or embed a signing key in a download. Review the expected profile name and single identity payload before manual installation; signing and encrypted identity protection are different controls.

## Confirm the intended connection

After resource activation, connect through Companion to the protected hostname. Normal HA authentication remains in place; an already logged-in app can reuse its existing HA session. Open a dashboard and use a harmless control to check live updates.

Turn off Wi-Fi and repeat over cellular, then background and reopen the app. Check that the configured server is using the protected external URL: an internal URL, cloud URL, VPN path or another server entry can otherwise make the app appear successful without exercising the intended mTLS edge. Safari is a separate client; its success does not establish Companion success.

Use [troubleshooting](troubleshooting.md) if import or connection fails. The Mac `.p12` curl test is optional diagnosis, documented in [advanced checks](manual-checks.md), not a requirement for every phone.

## Cleanup, replacement and recovery

If the identity is used in both Safari and Companion, complete both imports and test both clients before cleanup. After import and connection verification, remove unnecessary `.p12`/`.mobileconfig`/ZIP copies and unwanted synced copies according to your backup policy. Retain the protected HA app backup containing CA state.

If the temporary download expired, was consumed or was lost after restart, issue a fresh identity. The app does not retain a permanent downloadable package or recover its password. Replacing or reissuing an identity does not revoke the old leaf under the shared CA. Before expiry, use **Replace certificate** and follow the [guided replacement steps](certificate-management.md#replace-a-device-certificate); automatic installation is not implemented. When sharing an identity between Safari and Companion, install and test its replacement in both places before selecting **Confirm replacement tested**. Removing a Settings profile does not remove Companion’s separate identity, or vice versa.

New devices need an existing management/local enrollment route. Do not add an unauthenticated provisioning exception to the protected hostname. For another person's device, transfer its encrypted package through a trusted method rather than sharing administrator access.
