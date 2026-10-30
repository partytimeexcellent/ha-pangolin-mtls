# HA Pangolin Access setup

**Start with the [complete installation tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md).** It covers enabling Pangolin's integration API, DNS/Traefik routing, exact key permissions, certificate trust and iOS Companion import. It also separates routine setup from advanced validation.

Pangolin Access creates device certificates and can install its public CA certificate on a selected Pangolin public resource. Resource creation and enabling mTLS remain steps in the Pangolin dashboard. This is an early-access build with outstanding release checks.

## First installation: short path

1. Install **HA Pangolin Access** from this repository. In **Home Assistant setup**, review the URL, choose and save administrators, then select **Check access**.
2. Create the certificate authority once in **Device certificates** and take a protected backup of app data.
3. Enable Pangolin's integration API, expose its HTTPS `/v1` URL, and enter that URL in **Pangolin setup**. Create an organization API key with the permissions below.
4. In Pangolin, prepare a dedicated HTTPS public resource for Home Assistant, preferably disabled during setup, without a shared policy.
5. Open **Pangolin setup**. Enter the Pangolin API URL, Organization ID and API key, select **Find public resources**, then **Install CA cert** on the intended hostname. The app checks the resource before upload and verifies its CA fingerprint afterward.
6. In Pangolin, enable **Client Certificate (mTLS)** on that resource. Create and import a device certificate in Companion. Enable the target/resource, then verify rejection without a certificate and access with the enrolled device.

See the [complete installation tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md) for API routing, setup order and device import details.

## Safari and Companion on the same iPhone

One device identity can be used for both: choose **iOS mTLS installer.zip**, import its `.p12` inside Companion, then install its `.mobileconfig` through iOS **Settings → Profile Downloaded** or **General → VPN & Device Management** for Safari. Keep the package until both imports and connection checks succeed; one download can supply both installations. Use a different identity for each additional physical device. The package is not hardware-bound, and sharing it means both copies hold the same private key. Update and test both when replacing it.

For Safari only, install **Install for Safari.mobileconfig** from the ZIP; Companion uses **Home Assistant identity.p12**. The Settings title is **Home Assistant mTLS - [device name] - expires [month year]**, based on the actual expiry. The unsigned profile omits the password and installs only the identity. Review its expected name and contents; enter the separate package password. The installer ZIP contains both files under one single-use download permission. An app update does not rename an installed identity. The Settings path installs an identity, not MDM enrollment. Safari must be tested separately; its compatibility with this project has not yet been verified. See the [full Safari and shared-identity instructions](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/ios-enrollment.md#install-for-safari-through-ios-settings).

## App configuration

```yaml
admin_user_ids:
  - "REPLACE_WITH_YOUR_32_CHARACTER_HA_USER_ID"
home_assistant_origin: ""
```

Replace every placeholder. **Home Assistant URL override (optional)** uses HA’s configured `external_url` at startup when blank. An entered `home_assistant_origin` value overrides it; use the exact HA scheme/hostname/port with no path or ingress token. The Web UI shows the effective address and source. Existing explicit values are preserved; clear the field and restart to use automatic mode. If HA has no external URL or Core is unavailable, set a manual override or configure HA first, then restart. Open this app using the selected address. Certificate creation requires an HTTPS Home Assistant URL and verified administrator setup. An empty ID list denies access unless a Core-verified administrator completes first-time setup or an eligible saved administrator is selected. Enter the API URL in Pangolin setup for automatic CA installation. It must resolve to public addresses with valid HTTPS. The URL is saved in this browser after a successful resource search; the API key stays only in page memory.

## API key permissions

Pangolin setup has its own section above Device certificates. Discovery and installation need the permissions below. Daily device access needs none. Follow the [short Pangolin connection-check routine](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/pangolin-connection-check.md).

| Category | Enable |
| --- | --- |
| Organization | Get Organization |
| Domain | List Organization Domains |
| Site | List Sites |
| Resource | List Resources; Get Resource |
| Resource Policy | Get Resource Policy |
| Target | List Targets |
| Resource | Create Resource mTLS Certificate |

The upload requires the Create Resource mTLS Certificate write permission. No delete or root permission is needed. The key stays only in the open page’s memory for setup actions; close the page when done. Keys belong in the app form, never in chat, public logs or a repository URL.

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

Use **Replace certificate** to issue a fresh identity, import it inside Companion and test a new external connection. Confirm the test in the new inventory row to suppress older-record reminders. The old certificate remains valid until expiry. Choose **Download installer (.zip)** to avoid manual compression before AirDrop; keep its password separate. See the [full certificate guide](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/certificate-management.md).

## User-name picker

Initial setup retrieves the signed-in administrator ID automatically when no IDs or saved selection exist. Home Assistant setup shows the URL, administrator selection and access check, then collapses after confirmation. Pangolin setup is a separate section. Existing configured IDs remain an optional recovery path. The [administrator picker guide](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/administrator-picker.md) explains eligibility checks, saved selections, recovery and the verified setup boundary. Actual Core/Supervisor permission acceptance still needs validation. The separate Pangolin CA upload uses the permissions listed above.

## API automation and the external URL

This app uploads its public CA to an explicitly selected resource and verifies it through the integration API. It does not enable mTLS or rotate the CA. Device identity issuance stays local, phone installation stays manual, and shared-CA individual revocation is unavailable. Daily use does not require a key.

The automatic external-URL read uses the existing Core API permission, even if expiry notifications are off. It reads the fixed internal Core configuration endpoint, never the configured public URL, and does not modify HA or Supervisor settings. The name **Home Assistant URL override (optional)** is a user-facing label; `home_assistant_origin` remains the YAML key for compatibility and exact-origin request protection.
