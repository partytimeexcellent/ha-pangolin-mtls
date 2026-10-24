# HA Pangolin Access setup

**Start with the [complete installation tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md).** It covers enabling Pangolin's integration API, DNS/Traefik routing, exact key permissions, certificate trust and iOS Companion import. It also separates routine setup from advanced validation.

This dev.9 prototype issues local client certificates and performs explicit read-only Pangolin checks. Configure Pangolin trust/resources manually through its dashboard. The app does not upload certificates, enable resources or edit HA's configuration.

## First installation: short path

1. Add `https://github.com/partytimeexcellent/ha-pangolin-mtls` to HA's app repositories and install **HA Pangolin Access**. Leave protection mode enabled.
2. Configure your HA administrator user ID. Leave **Home Assistant External URL** blank to use HA’s configured external URL, or enter an HTTPS override matching where you open this app. Start the app and select **Check my access**. Then enable certificate management, save and restart.
3. Optional diagnostics: enable Pangolin’s separate integration API and HTTPS route only if you want API inspection. Otherwise skip to CA creation.
4. Optional diagnostics: configure the integration URL and create an organization API key with the required reads below. Open **Advanced: Pangolin setup and diagnostics** only if you want to run the optional connection/inspection forms.
5. Create the app's CA once and take a protected backup including app data. Download its **public CA certificate**.
6. Prepare a dedicated HTTPS Pangolin resource with its resource and target disabled and no shared policy. Review it in Pangolin’s dashboard, upload this app’s public CA and enable mTLS. If API diagnostics are available, inspect it and compare returned CA fingerprints as an additional check.
7. Issue a device identity, save its password and choose **Download mTLS installer ZIP** within five minutes. AirDrop it, extract in Files, and import the `.p12` from inside Companion. For iOS/iPadOS, this is the only offered download and is named **iOS mTLS installer.zip**.
8. Enable the prepared target/resource with mTLS on. Check rejection without a certificate, Companion access with the identity, and the intended external URL over cellular.

The [tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md) provides the exact configuration examples and expected results. The deeper invalid-certificate, protocol, rotation and restore experiments are not required for each new device.

## Safari and Companion on the same iPhone

One device identity can be used for both: choose **iOS mTLS installer.zip**, import its `.p12` inside Companion, then install its `.mobileconfig` through iOS **Settings → Profile Downloaded** or **General → VPN & Device Management** for Safari. Keep the package until both imports and connection checks succeed; one download can supply both installations. Use a different identity for each additional physical device. The package is not hardware-bound, and sharing it means both copies hold the same private key. Update and test both when replacing it.

For Safari only, install **Install for Safari.mobileconfig** from the ZIP; Companion uses **Home Assistant identity.p12**. The Settings title is **Home Assistant mTLS - [device name] - expires [month year]**, based on the actual expiry. The unsigned profile omits the password and installs only the identity. Review its expected name and contents; enter the separate package password. The installer ZIP contains both files under one single-use download permission. An app update does not rename an installed identity. The Settings path installs an identity, not MDM enrollment. Safari must be tested separately; its compatibility with this project has not yet been verified. See the [full Safari and shared-identity instructions](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/ios-enrollment.md#install-for-safari-through-ios-settings).

## App configuration

```yaml
admin_user_ids:
  - "REPLACE_WITH_YOUR_32_CHARACTER_HA_USER_ID"
home_assistant_origin: ""
enable_certificate_management: false
pangolin_api_url: "https://api.pangolin.example.net/v1"
```

Replace every placeholder. **Home Assistant External URL** uses HA’s configured `external_url` at startup when blank. An entered `home_assistant_origin` value overrides it; use the exact HA scheme/hostname/port with no path or ingress token. The Web UI shows the effective address and source. Existing explicit values are preserved; clear the field and restart to use automatic mode. If HA has no external URL or Core is unavailable, set a manual override or configure HA first, then restart. Open this app using the selected address. Initially leave certificate management off, verify access, then enable it explicitly. An empty allowlist denies everyone. The API URL is optional until you use Pangolin checks and must resolve to public addresses with valid HTTPS.

## API key permissions

API forms are hidden by default under **Advanced: Pangolin setup and diagnostics**. These reads are for setup/testing only. Basic connection testing needs four reads; optional resource inspection adds three. Daily operation needs none. Follow the [short Pangolin connection-check routine](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/pangolin-connection-check.md).

| Category | Enable |
| --- | --- |
| Organization | Get Organization |
| Domain | List Organization Domains |
| Site | List Sites |
| Resource | List Resources; Get Resource |
| Resource Policy | Get Resource Policy |
| Target | List Targets |

No write, delete or root permission is needed. The key is used for one check, cleared from the field and not persisted. Reenter it when needed. Keys belong in the app form, never in chat, public logs or a repository URL.

## Adding a device or updating

For another device, reuse your existing CA/resource, issue a new identity, import its package and test its connection. No repeated API setup or CA upload is needed. Before expiry, issue/import a replacement; this does not revoke an older identity.

Update the app in place, preserve its data/CA, read the changelog and reopen the UI to confirm the build footer. Do not uninstall/recreate the app as an update procedure.

Packages expire after five minutes, can be downloaded once, and are invalidated by restart. The current limits are five pending packages and 100 issuance records. No permanent redownload/password recovery, automatic renewal, individual revocation, CA rotation or standalone encrypted recovery export is implemented.

A protected Supervisor backup is the current recovery mechanism; restoration needs separate isolated validation. It contains both the encrypted CA key and its automatic-unlock material, so protect it as signing access. Normal HA login remains required. Removing Pangolin's final trusted CA disables mTLS; never use that as a revocation action.

## Help

- [Detailed installation](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md)
- [iPhone/iPad enrollment and AirDrop ZIP workaround](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/ios-enrollment.md)
- [Troubleshooting](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/troubleshooting.md)
- [Optional terminal checks, including curl's PKCS#12 password issue](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/manual-checks.md)
- [Storage/security limits](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/SECURITY.md)
- [Scoped validation results](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/phase-2-results.md)

## Reminders and replacement (dev.6)

Take a protected backup before updating; metadata migrates to version 2 and older builds cannot open it. Enable `enable_home_assistant_notifications` and restart for optional HA notification-panel reminders; also enable **Start on boot** for checks after a host restart. Mobile push is not included. The app requests Core API access for this feature even when notifications are off.

Use **Replace certificate** to issue a fresh identity, import it inside Companion and test a new external connection. Confirm the test in the new inventory row to suppress older-record reminders. The old certificate remains valid until expiry. Choose **Download mTLS installer ZIP** to avoid manual compression before AirDrop; keep its password separate. See the [full certificate guide](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/certificate-management.md).

## User-name picker

The current configuration still requires IDs. The [administrator picker plan](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/administrator-picker.md) explains the verified HA administrator setup, user-list connection and saved selections needed to replace manual ID copying. No additional Pangolin API permissions are needed.

## API automation and the external URL

Pangolin can upload/manage public CA trust and enable resource mTLS through its integration API. A future reviewed workflow could automate trust setup and CA rotation; the current app has not implemented those remote writes. Device identity issuance stays local, phone installation stays manual, and shared-CA individual revocation is unavailable. Keep API tools optional; daily use does not require a key.

The automatic external-URL read uses the existing Core API permission, even if expiry notifications are off. It reads the fixed internal Core configuration endpoint, never the configured public URL, and does not modify HA or Supervisor settings. The name **Home Assistant External URL** is a user-facing label; `home_assistant_origin` remains the YAML key for compatibility and exact-origin request protection.
