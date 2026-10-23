# Install HA Pangolin Access and connect iOS Companion

This tutorial covers the working path in `0.1.0-dev.8`: create client certificates in the Home Assistant app, inspect Pangolin through its integration API, configure a dedicated mTLS resource manually, and import a device identity into Companion. The API instructions were checked against Pangolin 1.25.2. Later versions may change screens or contracts.

This is an experimental prototype, not a production release. Initial client, cellular, restart and fresh TLS rejection checks have passed within the scope in [recorded results](phase-2-results.md). Backup restoration, rotation and broader compatibility remain separate release gates.

## Choose the path you need

| Task | Steps |
| --- | --- |
| First installation | Complete sections 1–8 below, including the short connection checks |
| Another device on the same installation | Follow [Add another device](#add-another-device); reuse the existing CA and Pangolin resource |
| App update | Preserve app data, read the changelog, update and reopen the UI; do not recreate the CA |
| Investigating a problem | Use [Troubleshooting](troubleshooting.md) |
| Maintainer or security validation | Use [Advanced checks](manual-checks.md) and the full [validation plan](validation-plan.md) |

A new installation needs a small set of checks against its own hostname. It does not need to repeat our full permission-denial, malformed-certificate, TLS-version, rotation or recovery experiments just to enroll a device.

## 1. Gather the addresses and access you need

You need Home Assistant OS/Supervisor on a declared app architecture, an administrator account, an existing Pangolin server and connected site, and a current Companion build with a client-certificate importer. There is no extra CA service or required additional container.

Use these example addresses as a worksheet. Replace them with your environment's values:

| Value | Example | Meaning |
| --- | --- | --- |
| HA management origin | `https://ha.example.net` | Where you open HA and this app to manage certificates |
| Pangolin dashboard | `https://pangolin.example.net` | Where you manage resources and API keys |
| Pangolin integration API | `https://api.pangolin.example.net/v1` | Separate API endpoint used by this app |
| New protected HA hostname | `ha-mtls.example.net` | Dedicated public hostname for the new mTLS resource |
| Backend target | `192.168.10.20:8123` | HA address reachable **from the Pangolin site's connector** |

Keep your existing working HA route while setting up the new hostname. Have local HA access and a protected backup. The certificate manager runs behind HA ingress; do not expose its port or create a public enrollment bypass.

You can use a local reverse proxy as the backend instead of HA directly. Configure the new hostname on that proxy so it routes to HA. If its listener is HTTPS, select the corresponding HTTPS target method in Pangolin and preserve backend certificate verification. Host routing and backend TLS/SNI are separate settings; do not solve a TLS error by disabling verification. See [backend troubleshooting](troubleshooting.md#backend-and-connection-problems).

## 2. Install and authorize the Home Assistant app

In HA, open the app/add-on store, open its Repositories dialog and add:

```text
https://github.com/partytimeexcellent/ha-pangolin-mtls
```

Refresh the store, install **HA Pangolin Access**, and leave protection mode enabled. Source builds can take time. Local-folder installation is an alternative for development, described in [development.md](development.md).

In the app's **Configuration**, set your administrator's actual HA user ID and exact HA origin. Find the ID by opening the administrator's user details in HA user management; Advanced Mode may be needed. It is a 32-character ID, not their display name.

```yaml
admin_user_ids:
  - "REPLACE_WITH_YOUR_32_CHARACTER_HA_USER_ID"
home_assistant_origin: "https://ha.example.net"
enable_certificate_management: false
```

The placeholder user ID must be replaced before saving. `home_assistant_origin` includes the scheme, hostname and any nonstandard port, with no path, query or ingress token. Open HA using that same origin. `https://ha.example.net` and `http://192.168.10.20:8123` are different origins.

Start the app, select **Open Web UI**, and select **Check my access**. The expected result is an authorization pass with signing disabled. Once that works, change `enable_certificate_management` to `true`, save and restart the app. Certificate management requires an HTTPS HA origin.

For an ordinary installation, you do not need to remove your user ID and lock yourself out as we did during prototype validation. Keep the allowlist narrow; an empty allowlist denies everyone. The app also enforces ingress, session and request protections on its backend.

## 3. Enable Pangolin's integration API

Skip the configuration changes if you already have a working integration endpoint and `openapi.json` loads.

Creating an API key in the dashboard does not itself expose the integration API. The dashboard API and integration API are separate listeners:

| API | Typical public route | Use |
| --- | --- | --- |
| Dashboard API | `pangolin.example.net/api/v1` | Pangolin's own web dashboard |
| Integration API | `api.pangolin.example.net/v1` | External tools using bearer API keys |

### Enable the listener

On the Pangolin server, edit `config/config.yml`. Merge this setting into its existing `flags` section:

```yaml
flags:
  enable_integration_api: true
```

The default integration port is `3003`. If you changed `server.integration_port`, use that port in the service definition below. Back up the configuration before editing and reload/restart Pangolin using your deployment's normal procedure. For a standard Compose service named `pangolin`, `docker compose restart pangolin` reloads its configuration; this may briefly interrupt service, so retain server-console access.

### Route HTTPS to the listener

Create a DNS record for `api.pangolin.example.net` pointing to the Pangolin edge. Then merge these entries into `config/traefik/dynamic_config.yml`:

```yaml
http:
  routers:
    int-api-router-redirect:
      rule: "Host(`api.pangolin.example.net`)"
      service: int-api-service
      entryPoints:
        - web
      middlewares:
        - redirect-to-https

    int-api-router:
      rule: "Host(`api.pangolin.example.net`)"
      service: int-api-service
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt

  services:
    int-api-service:
      loadBalancer:
        servers:
          - url: "http://pangolin:3003"
```

**Merge, rather than replace:** retain existing routers, services and middleware. If the file already contains `http:`, `routers:` and `services:`, add the new named entries inside those maps. Duplicate YAML keys can discard existing configuration. Use the entrypoint, redirect middleware and certificate-resolver names actually defined by your deployment. The example assumes the standard names shown above. Pangolin's official example also includes `badger` on the HTTP redirect router when that middleware is available; follow your deployment's existing middleware setup rather than adding an undefined name.

Keep the existing `api-router`/`api-service` for the dashboard. These example routers match different hostnames and can coexist.

`http://pangolin:3003` is an **internal Docker address**, not your public domain. It is correct when the Compose service is named `pangolin`, Traefik shares its network, and the integration port is `3003`. Change only the service name/port if your deployment differs. Public clients use HTTPS through Traefik; you do not need to publish port 3003 to the internet.

Traefik commonly watches its dynamic file. Check its reload/log behavior after editing; follow your deployment's reload procedure if file watching is not active. See [Pangolin's integration API setup](https://docs.pangolin.net/self-host/advanced/integration-api) for the upstream reference.

### Verify the URL

Open these addresses, using your API hostname:

```text
https://api.pangolin.example.net/v1
https://api.pangolin.example.net/v1/openapi.json
https://api.pangolin.example.net/v1/docs/
```

The base route should return a healthy response and `openapi.json` should return a large JSON API specification. A blank documentation page can be a Swagger asset/UI problem; if the JSON works, our app can proceed. `/api/v1/docs` on the dashboard hostname is not the integration documentation route. The final slash on `/docs/` is worth trying for relative assets, but is not a guaranteed fix for a blank page.

The value to enter in our app is exactly the HTTPS base ending in **`/v1`**, without `/docs` or `/openapi.json`. This prototype accepts public DNS destinations with valid HTTPS certificates. It rejects private/reserved addresses, mixed public/private DNS answers, redirects and custom URL path prefixes.

## 4. Create one organization API key with the correct reads

For a short setup/troubleshooting routine, see [Pangolin connection checks](pangolin-connection-check.md). Daily access and local certificate management do not require a Pangolin API key.

Create the key within the organization containing your new resource. Enable all seven permissions now to avoid adding them in separate troubleshooting rounds:

| Category | Exact permission label | Action |
| --- | --- | --- |
| Organization | Get Organization | `getOrg` |
| Domain | List Organization Domains | `listOrgDomains` |
| Site | List Sites | `listSites` |
| Resource | List Resources | `listResources` |
| Resource | Get Resource | `getResource` |
| Resource Policy | Get Resource Policy | `getResourcePolicy` |
| Target | List Targets | `listTargets` |

Save the permission changes. **Get Resource** and **Get Resource Policy** are separate permissions. No write/delete grants, root key or organization-listing grant is required by the current app. You make the later resource/trust changes manually in Pangolin's dashboard.

Find the organization ID in the organization's General settings or the first path component in its dashboard URL. For example, `https://pangolin.example.net/home-lab/settings/sites` means organization ID `home-lab`. Use the ID, not the display name. [Pangolin's organization-ID guide](https://docs.pangolin.net/manage/organizations/org-id)

Add the API URL to this app's HA Configuration, save and restart:

```yaml
pangolin_api_url: "https://api.pangolin.example.net/v1"
```

In **Connect to Pangolin**, enter the organization ID and the full API key as provided by Pangolin, then select **Check Pangolin connection**. Do not add the word `Bearer`; the app does that. The key is used for that check only, cleared from the field, and not saved to app configuration or the database. Reenter it for another check.

A pass confirms the scoped reads and expected response shapes. It does not prove target reachability or mTLS enforcement.

## 5. Create the CA and prepare a disabled resource

In **Certificate authority and devices**, confirm dedicated CA creation and select **Create certificate authority**. Create it once per installation; it is reused for additional devices. If the CA already exists, retain it.

Take a protected HA backup including this app's data after CA creation. The current automatic-unlock secret is stored with the encrypted CA key; the backup therefore contains signing access. Standalone encrypted recovery export is not implemented. Do not uninstall the app to update it.

Select **Download public CA certificate**, which produces `ha-pangolin-ca.pem`. Only this public certificate goes to Pangolin. The device `.p12` and CA private key do not.

In Pangolin, create a **separate HTTPS public resource** for `ha-mtls.example.net`, then disable it before attaching the real HA backend. Keep its target absent or disabled during preparation. Do not assign a shared resource policy. Choose the connected site and backend destination that can reach HA; if the UI creates a target, explicitly disable that target too. A disabled resource and a disabled target are two separate controls.

In our app, select **Inspect a specific test resource**. Enter its exact Pangolin **resource identifier**, expected hostname without scheme/path, organization ID and key. Select **Inspect resource**. Its identifier is visible in Pangolin resource settings and is not necessarily its display name.

Expected preparation state: resource disabled, HTTPS on, inline policy, no CA trust yet, mTLS off. Review any existing authentication or rules before changing them. An attached disabled target still produces a presence finding; that does not mean it is enabled. Shared policies and incomplete results require manual review. The inspector does not inventory every redirect, wildcard overlap or manual Traefik router; use a dedicated hostname without conflicting routes.

## 6. Add CA trust and enable mTLS while preparation stays disabled

On that resource, open **Authentication → Other Methods → Client Certificate (mTLS)**. Upload `ha-pangolin-ca.pem`, enable the client-certificate requirement and save. If the interface requires opening/enabling the mTLS section before upload, complete the upload before saving the requirement. Keep the resource and target disabled. [Pangolin's mTLS guide](https://docs.pangolin.net/manage/access-control/mtls)

Run **Inspect resource** again. Expect inline policy mTLS **on**, one CA entry, and resource/target **disabled**. Compare the returned CA fingerprint with the CA SHA-256 fingerprint in our app. Pangolin's certificate-detail screen is not needed; the inspector returns the metadata.

Compare **certificate fingerprints**, not the SHA-256 checksum of the `.pem` file's bytes. Colons and letter case can be normalized; the hex digits must agree.

At this stage, findings for **existing trust**, **mTLS already on** and **targets already attached** are expected when they describe the configuration you just created. They are review reminders, not an instruction to delete the CA or recreate the resource. Unexpected trust, shared policy or identity/hostname mismatches must be resolved first.

## 7. Issue and import a device identity

In the HA app, enter a device name, select iOS/iPadOS and choose a lifetime. The default is 90 days; supported bounds are 1–365 days within the CA's remaining validity. Select **Issue certificate**, save its separately displayed password, and select **Download mTLS installer ZIP** within five minutes. iOS/iPadOS offer only **iOS mTLS installer.zip**, containing Home Assistant identity.p12 and Install for Safari.mobileconfig.

A download can be redeemed once. Expiry, restart or a consumed/interrupted download does not provide a permanent recovery URL. Another issuance creates a fresh identity; it does not revoke the earlier one. Current limits are five pending packages and 100 issuance records.

For Mac-to-iPhone transfer, use the ZIP method from the start:

1. Choose **Download mTLS installer ZIP** to receive **iOS mTLS installer.zip**.
2. AirDrop the ZIP and save/open it in **Files** on the iPhone.
3. In Files, tap the ZIP to extract its contents.
4. Leave the extracted `.p12` there. Open Companion's own certificate importer and select the file from its picker.
5. Enter that package's password in Companion.

AirDropping a bare `.p12` may hand it to iOS Settings for device-wide installation. Installing there does not automatically provision Companion. ZIP avoids the bare-certificate handoff for Companion. Cancel an unwanted pending Settings installation if you only intend to use Companion. [Apple's ZIP instructions](https://support.apple.com/en-us/102532)

Companion's inspected source supports certificate selection during onboarding and through a server's Connection/Client Certificate settings. Installed labels vary; preserve the existing working server/URL while configuring the new protected URL. Do not assume changing only the external URL proves it was used: an internal URL can still win on home Wi-Fi. See [iOS enrollment](ios-enrollment.md) for details.

### Optional: Safari on the same iPhone

You can use the same device `.p12` for both Safari and Companion when both should have the same access. The **iOS mTLS installer.zip** contains both the `.p12` for Companion and a named `.mobileconfig` for Safari. After importing the `.p12` inside Companion, open or AirDrop the `.mobileconfig` and complete installation through **Settings → Profile Downloaded** or **General → VPN & Device Management**. The two clients require separate imports; certificate installation does not enroll the phone in MDM. For Safari-only use, extract and install just **Install for Safari.mobileconfig** from the ZIP. Its title uses **Home Assistant mTLS - [device name] - expires [month year]** with the actual certificate expiry. The profile omits the password, which you enter separately. It is unsigned and installs only the identity; review the expected name and contents before approving it. Older installed identities are not renamed automatically. The [iOS guide explains the Not Signed label](ios-enrollment.md#why-does-ios-say-not-signed); it describes the wrapper, not whether the client certificate has a CA signature.

Keep the downloaded file until both imports succeed; the app still permits only one download. One shared identity has one private key and expiry date: compromise of either copy affects that identity, and the certificate alone cannot distinguish the two clients. It is not hardware-bound, so use a fresh identity for a different physical device. When replacing it, update and test both installations before confirming replacement.

Follow the [Safari installation steps and shared-identity guidance](ios-enrollment.md#install-for-safari-through-ios-settings). After activation, test Safari at the protected URL over cellular, separately from Companion. Safari compatibility with this project remains unverified; do not treat Companion's recorded PASS as browser validation. Normal HA login and HTTPS server verification remain required.

## 8. Activate and perform the short installation checks

With the matching CA trusted and mTLS still on, enable the prepared target and resource for the dedicated hostname. Keep other resources unchanged. A targetless/disabled resource may have no usable edge route, so a failure while it is disabled does not establish mTLS enforcement.

Run these checks for each new deployment/hostname:

1. **No client certificate:** from a Mac terminal, make a fresh request:

   ```bash
   curl -q --verbose --connect-timeout 10 --max-time 15 \
     https://ha-mtls.example.net/ --output /dev/null
   ```

   Expect a TLS client-certificate rejection and no HTTP response. DNS failures, timeouts and untrusted **server** certificates are inconclusive. Some LibreSSL versions display a numeric TLS error rather than readable “certificate required.” An HTTP response without a client certificate requires investigation; disable the new resource while reviewing it. Keep certificate verification enabled.

2. **Enrolled device:** connect using Companion and the protected URL. Normal HA authentication remains required; an existing HA login session can be reused. Open a dashboard and use a harmless control. Confirm the correct server/URL is selected.
3. **External path:** turn off Wi-Fi and repeat over cellular, then background and reopen Companion. Ensure a cloud URL, VPN/internal route or alternate server entry is not silently providing access instead of the tested URL. If cellular/VPN routing prevents an unambiguous test, resolve that before claiming the public path passed.

These three checks are the routine installation path. The Mac `.p12` curl test, separately generated untrusted CA, forced TLS 1.2/1.3 probes, ingress-forgery cases, recovery drills and rotation/session tests belong in [Advanced checks](manual-checks.md). Run the relevant deeper checks when deployment, trust, policies or edge routing change; adding a device to an unchanged setup does not require recreating the full matrix.

Once the client import works, remove unnecessary temporary P12/profile/ZIP copies and synced copies in accordance with your backup policy. Retain a protected app backup. The app shows package delivery status; it cannot automatically establish device installation or edge enforcement.

## Add another device

Reuse the installation's existing CA, API endpoint and Pangolin resource. Issue a **new identity for each device**, save its package/password, transfer it as a ZIP if needed, import it into that device's Companion, and check its protected connection over cellular. Do not create a new CA, re-upload trust or recreate the resource for each device.

Before certificate expiry, issue and import a replacement. There is no automatic renewal installation or individual leaf revocation in this shared-CA prototype. Replacing a package does not invalidate copied or older certificates. See [certificate management](certificate-management.md).

## What to retain

Keep the API URL/org ID, chosen resource identifier/hostname and backend routing in your private installation notes. Keep API keys, package passwords and backups in appropriate protected storage; do not put them in public issues. Backups contain signing material. Verify restoration on an isolated HA instance before relying on recovery; an app restart is a separate check.

For updates, read the changelog, take a protected backup, update in place and confirm the build footer changed after reopening the UI. Preserve the existing CA and app data. If recovery material is lost, plan a new CA and device reenrollment rather than weakening client-certificate enforcement.

## Optional reminders and future replacements

With dev.6, turn on **Enable Home Assistant Notifications** (`enable_home_assistant_notifications` in YAML) in app Configuration and restart if you want expiry reminders in the HA notification panel. Enable **Start on boot** to keep checks running after host restarts. Phone push delivery is not included. Existing certificates are tracked without recreating them. For the replacement workflow, notification behavior and pre-update backup instructions, see [certificate management](certificate-management.md#expiry-reminders).

The app can now download the encrypted enrollment package as **iOS mTLS installer.zip**, avoiding the manual Finder compression step. For iOS/iPadOS, use the single installer ZIP download and keep the password separate. Pangolin setup, CA upload and initial test-resource activation are still manual. The administrator ID allowlist is still required; a user picker has not been added in this increment.
