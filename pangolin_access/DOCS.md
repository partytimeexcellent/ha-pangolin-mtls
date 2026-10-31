# HA Pangolin Access setup

**Start with the [complete installation tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md).** It covers enabling Pangolin's integration API, DNS/Traefik routing, exact key permissions, certificate trust and iOS Companion import. It also separates routine setup from advanced validation.

Pangolin Access creates device certificates, installs its public CA on a selected Pangolin public resource, and can enable mTLS on that resource’s inline policy while the resource is disabled. Resource creation and live access testing remain steps in Pangolin. This is an early-access build with outstanding release checks.

## First installation: short path

1. Install **HA Pangolin Access** from this repository. In **Home Assistant setup**, review the URL, choose and save administrators, then select **Check access**.
2. Create the certificate authority once in **Device certificates** and take a protected backup of app data.
3. For self-hosted Pangolin, [enable the integration API](https://docs.pangolin.net/self-host/advanced/integration-api) by setting `enable_integration_api: true` under `flags:` in `config.yml`. In `config/traefik/dynamic_config.yml`, route the hostname in the `int-api-router` `Host(...)` rule to `int-api-service`, which targets Pangolin's integration listener (normally `http://pangolin:3003`). Enter `https://` plus that hostname in **Pangolin setup**; the app adds `/v1`. For Pangolin Cloud, enter `https://api.pangolin.net`. Create an organization API key with the permissions below.
4. In Pangolin, prepare a dedicated HTTPS public resource for Home Assistant, preferably disabled during setup, without a shared policy.
5. Open **Pangolin setup**. Enter the Pangolin API address, Organization ID and API key, select **Find public resources**, then **Install CA cert** on the intended hostname. The Organization ID is the first segment after the hostname in your dashboard URL: `https://pangolin.domain.com/organizationid/settings/api-keys` gives `organizationid`. The app checks the resource before upload and verifies its CA fingerprint afterward; any error appears beside that resource.
6. For a disabled resource, optionally select **Enable mTLS after installing the CA**. Otherwise enable **Client Certificate (mTLS)** in Pangolin. Create and import a device certificate in Companion. Enable the target/resource, then verify rejection without a certificate and access with the enrolled device.

See the [complete installation tutorial](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/installation.md) for API routing and setup order. After creating a device certificate, open its collapsed platform guide in the app or use the [iPhone/iPad, Mac, Windows and Android instructions](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/device-installation.md).

## Safari and Companion on the same iPhone

One device identity can be used for both: choose **iPhone or iPad certificate package.zip**, import its `.p12` inside Companion, then install its `.mobileconfig` through iOS **Settings → Profile Downloaded** or **General → VPN & Device Management** for Safari. Keep the package until both imports and connection checks succeed; one download can supply both installations. Use a different identity for each additional physical device. The package is not hardware-bound, and sharing it means both copies hold the same private key. Update and test both when replacing it.

For Safari only, install **Install for Safari.mobileconfig** from the ZIP; Companion uses **Home Assistant identity.p12**. The Settings title is **Home Assistant mTLS - [device name] - expires [month year]**, based on the actual expiry. The unsigned profile omits the password and installs only the identity. Review its expected name and contents; enter the separate package password. The certificate package ZIP contains both files under one single-use download permission. An app update does not rename an installed identity. The Settings path installs an identity, not MDM enrollment. Safari must be tested separately; its compatibility with this project has not yet been verified. See the [full Safari and shared-identity instructions](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/ios-enrollment.md#install-for-safari-through-ios-settings).

## App configuration

```yaml
admin_user_ids:
  - "REPLACE_WITH_YOUR_32_CHARACTER_HA_USER_ID"
home_assistant_origin: ""
```

Replace every placeholder. **Home Assistant URL override (optional)** uses HA’s configured `external_url` at startup when blank. An entered `home_assistant_origin` value overrides it; use the exact HA scheme/hostname/port with no path or ingress token. The Web UI shows the effective address and source. Existing explicit values are preserved; clear the field and restart to use automatic mode. If HA has no external URL or Core is unavailable, set a manual override or configure HA first, then restart. Open this app using the selected address. Certificate creation requires an HTTPS Home Assistant URL and verified administrator setup. An empty ID list denies access unless a Core-verified administrator completes first-time setup or an eligible saved administrator is selected. Enter the Pangolin integration API address in Pangolin setup; the app adds `/v1`. The self-hosted hostname comes from the Traefik `int-api-router` `Host(...)` rule; Cloud uses `https://api.pangolin.net`. The URL must resolve to public addresses with valid HTTPS. It is saved in this browser after a successful resource search; the API key stays only in page memory.

## API key permissions

Device certificates, including CA creation, now appears above Pangolin setup. Discovery, CA installation and optional mTLS enablement need the permissions below. Daily device access needs none. Follow the [short Pangolin connection-check routine](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/pangolin-connection-check.md).

| Category | Enable |
| --- | --- |
| Organization | Get Organization |
| Domain | List Organization Domains |
| Site | List Sites |
| Resource | Get Resource; List Resources |
| Target | List Targets |
| Resource Policy | Get Resource Policy |
| Resource Policy | Update Resource Policy |

CA upload and optional mTLS enablement use Update Resource Policy on the selected resource’s inline policy. This checkbox permits broader policy changes in Pangolin, so use a temporary organization key and revoke it after setup. No delete or root permission is needed. The key stays only in the open page’s memory for setup actions; close the page when done. Keys belong in the app form, never in chat, public logs or a repository URL.

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

Take a protected backup before updating; metadata migrates to version 2 and older builds cannot open it. Use **Device certificates → Expiry reminders** to turn HA notification-panel reminders on or off; also enable **Start on boot** for checks after a host restart. Mobile push is not included. The app requests Core API access for this feature even when notifications are off.

Use **Replace certificate** to issue a fresh identity and test a new external connection. Confirm the test in the new inventory row to suppress older-record reminders. The old certificate remains valid until expiry. iPhone/iPad receives a ZIP for Files/AirDrop; Mac, Windows and Android receive the `.p12` directly. Keep the package password separate. See the [full certificate guide](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/certificate-management.md).

## User-name picker

Initial setup retrieves the signed-in administrator ID automatically when no IDs or saved selection exist. Home Assistant setup shows the URL, administrator selection and access check, then collapses after confirmation. Pangolin setup is a separate section. Existing configured IDs remain an optional recovery path. The [administrator picker guide](https://github.com/partytimeexcellent/ha-pangolin-mtls/blob/main/docs/administrator-picker.md) explains eligibility checks, saved selections, recovery and the verified setup boundary. Actual Core/Supervisor permission acceptance still needs validation. The separate Pangolin CA upload uses the permissions listed above.

## API automation and the external URL

This app uploads its public CA to an explicitly selected resource and verifies it through the integration API. With explicit selection, it can also enable mTLS on that resource’s inline policy while the resource is disabled. It does not rotate the CA. Device identity issuance stays local, phone installation stays manual, and shared-CA individual revocation is unavailable. Daily use does not require a key.

The automatic external-URL read uses the existing Core API permission, even if expiry notifications are off. It reads the fixed internal Core configuration endpoint, never the configured public URL, and does not modify HA or Supervisor settings. The name **Home Assistant URL override (optional)** is a user-facing label; `home_assistant_origin` remains the YAML key for compatibility and exact-origin request protection.
