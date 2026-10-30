# Troubleshooting HA Pangolin Access

Applies to the certificate manager and Pangolin CA setup. Start with the [installation tutorial](installation.md); use [advanced checks](manual-checks.md) for terminal diagnosis and maintainer tests.

## Home Assistant app access

| Symptom | Check / fix |
| --- | --- |
| Authorization denied | Set the actual 32-character administrator HA user ID in `admin_user_ids`; save and restart. Display names are not IDs. An empty allowlist intentionally denies everyone. |
| `ORIGIN_MISMATCH` | Set `home_assistant_origin` to the exact scheme, hostname and port currently used to open HA. Include no path or ingress token. Save/restart, then use that origin. |
| `ORIGIN_MISSING` / `ORIGIN_NULL` | The expected origin did not arrive; inspect the legitimate HA/proxy path. Do not accept absent/opaque origins as a fallback. |
| Session/CSRF failure | Reopen the app through HA ingress and retry. App sessions expire; do not expose the app's port to bypass ingress. |
| Certificate section unavailable | Use an HTTPS Home Assistant URL and finish administrator setup; restart the app after changing its URL. |
| Old UI after updating | Refresh/check the app store for updates, update in place and reopen the Web UI. Confirm the build footer. Keep existing app data and CA. |

## Pangolin integration API

| Symptom | Check / fix |
| --- | --- |
| `/api/v1/docs` returns 404 | This is the dashboard API path. Use the separately routed integration hostname with `/v1/docs/`. |
| `/v1/docs` also returns 404 on the dashboard host | Find `int-api-router` in Traefik's dynamic config. Its `Host(...)` identifies the integration hostname. If absent, follow the tutorial's API setup. |
| A key exists but the API does not respond | Enable `flags.enable_integration_api`, load Pangolin's config, route the integration listener through HTTPS and configure DNS. Key creation alone does not expose the API. |
| `PANGOLIN_GATEWAY` during API specification check | The public integration API hostname returned 502, 503 or 504. On self-hosted Pangolin, check `flags.enable_integration_api: true` in `config.yml`, restart Pangolin, and confirm the Traefik `int-api-router` hostname and `int-api-service` target (default `http://pangolin:3003`). Open `https://YOUR_API_HOST/v1/openapi.json`; it must return JSON. The dashboard hostname may be different. |
| `/v1` is healthy but docs are white | Try `/v1/docs/`, then `/v1/openapi.json`. A functioning JSON specification is sufficient for this app; the Swagger UI can be investigated separately. |
| Unclear whether `http://pangolin:3003` needs replacing | It is Traefik's internal backend. Keep it for a standard Compose service named `pangolin` on the same Docker network with integration port 3003. Use your deployment's service name/port if different. |
| Dashboard API route already exists | Keep it. Add integration routers/services under the existing `http` maps. Different exact host rules can coexist; avoid duplicate YAML map keys. |
| `PANGOLIN_ADDRESS_BLOCKED` | The app requires a public DNS endpoint; private/reserved or mixed DNS answers are rejected. Private integration endpoints are not supported by this build. |
| `PANGOLIN_REDIRECT` | Enter the final HTTPS integration API URL ending in `/v1`; redirects are refused rather than forwarding bearer credentials. |
| Authentication rejected | Use the full key Pangolin supplied, without adding `Bearer`. Confirm that it has not expired/been removed and is the intended organization key. |
| Permission denied | Save the exact seven read grants in the tutorial and use the organization where the key was created. The failure label identifies which read failed. |
| `Policies (Get Resource Policy)` denied | Enable **Resource Policy → Get Resource Policy**, separately from **Resource → Get Resource**. Save changes to the same key used in the form. |
| Organization ID unclear | Read it from General settings or the first dashboard URL path component. In `https://pangolin.domain.com/organizationid/settings/api-keys`, enter `organizationid`, not the display name. |
| Error ends in HTTP 502 | The app reports Pangolin connection failures as local HTTP 502. Read the fixed code and operation label; `PANGOLIN_GATEWAY` specifically means the integration API hostname returned 502, 503 or 504. A permission failure uses `PANGOLIN_PERMISSION_DENIED` even though its local HTTP status is also 502. |

Keys are request-scoped and cleared after submission. Reenter the key for another check; the app intentionally does not remember it.

## Resource inspection findings

| Finding | Interpretation |
| --- | --- |
| Resource enabled during preparation | Disable the new resource while configuring trust. Confirm you selected the test resource, not existing remote access. |
| Targets attached | A presence reminder, including for disabled targets. Read each target's enabled/disabled status. |
| Target remains enabled after disabling resource | Resource and target switches are separate. Disable the target row on the intended resource. |
| Existing trust / mTLS already on | Expected after your planned CA upload/mTLS setup. Compare its certificate fingerprint and retain the intended trust. Do not delete a CA just to clear a finding. |
| Shared policy | It can affect multiple services and override inline behavior. This workflow requires manual review rather than automatic detachment or edits. |
| Resource/hostname mismatch | Use the exact identifier and expected hostname for the same organization. Do not substitute the resource's display name. |
| Incomplete search/target results | Bounded results are not a complete inventory. Resolve the scope/limit before approving configuration. |
| CA details unavailable in Pangolin UI | The app's inspector reads CA fingerprint metadata. Compare it with the app CA fingerprint. A certificate fingerprint differs from a checksum of PEM file bytes. |

Removing Pangolin's final trusted CA disables mTLS. Never use that as a blocking/revocation action.

## Device packages and iOS import

| Symptom | Check / fix |
| --- | --- |
| AirDrop opens Settings instead of Files | Compress the `.p12` on the Mac, AirDrop the ZIP, extract it in Files, then select the `.p12` from Companion's importer. |
| Certificate installed in Settings, Companion still fails | Import into Companion itself. System-wide identity installation does not automatically provide its client identity. |
| Download expired, failed or cannot be repeated | Packages have five-minute, single-use delivery. Restart invalidates pending packages. Issue another identity if needed; this does not revoke the old one. |
| Wrong package password | Pair the password with the exact issuance/file. Check an unmodified copy and package verification before changing crypto settings. |
| curl `mac verify failure`, `HTTP 000` | Some builds do not prompt for a PKCS#12 password. Verify with `openssl pkcs12 ... -info -noout`, then use the stdin-password helper in advanced checks. |
| Safari works but Companion fails | Test the app-local importer, server selection and its actual URL. Browsers and Companion are separate acceptance targets. |
| Wi-Fi works, cellular fails | Check the external URL, public DNS, intended server entry and routing. An internal URL may have bypassed the public path on Wi-Fi. |

## Backend and connection problems

A request without a client certificate should fail at TLS with no HTTP response. An HTTP response without that identity requires investigation of trust, shared policies, redirects/router conflicts and the actual endpoint; disable the dedicated resource while resolving it. Timeouts and DNS/server-certificate errors are not proof of mTLS.

If a valid identity gets through TLS but HA does not load:

- Check site/connector connectivity and the target address from that connector's network. `localhost` means the connector itself; the app's internal `homeassistant` alias does not resolve everywhere.
- Match the target's HTTP/HTTPS method to its listener. When targeting an HTTPS reverse proxy by IP, review backend certificate verification and TLS server-name/SNI settings using the proxy's certificate hostname. Preserve verification.
- Configure the protected hostname in a hostname-based local reverse proxy. Check the forwarded Host behavior and any explicit Host override against that proxy's routing.
- For HA 400/proxy errors, compare Core's `trusted_proxies` and forwarded-header settings with the actual legitimate proxy source. Do not trust every LAN address as a workaround. [HA HTTP proxy documentation](https://www.home-assistant.io/integrations/http/)
- Separate an HTTP 200 from application success. Confirm the intended HA dashboard, normal HA authentication, live updates and the external Companion connection.

## Safe information to share

Share the displayed fixed code/operation label, relevant sanitized settings and a concise observed result. Keep keys, package passwords, `.p12` files, private keys, ingress URLs, cookies, session/enrollment tokens and backups out of public issues. Avoid posting full response bodies or verbose request logs that may include headers or application cookies.

Review [certificate management](certificate-management.md) for expiry, backup and shared-CA limitations. Inventory status and a downloaded package do not prove a device was installed or revoked.

## Automatic Home Assistant URL override (optional)

With dev.9, a blank `home_assistant_origin` uses HA's configured external URL at startup. Existing explicit values remain overrides; clear the field and restart if you want automatic selection. The Web UI shows the selected URL and source. The Configuration field stays blank in automatic mode because the app does not rewrite Supervisor options.

If startup says the external URL is unavailable, configure it in HA's Network settings and start the app after Core is ready, or enter a manual app override. Discovery does not fall back to an internal URL or browser headers. If authorization reports an address mismatch, set the override to the exact scheme/hostname/port where you opened this app. That management address can differ from your new protected mTLS hostname. Keep HTTPS when certificate management is enabled.

Pangolin diagnostic forms are hidden under **Pangolin connection checks**. Expand them only when you want to run an explicit read-only check; they are not needed to keep certificate access or expiry reminders working.
