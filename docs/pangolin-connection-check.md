# Pangolin connection check: setup and troubleshooting only

This app's Pangolin API tools inspect configuration. They do not carry normal HA traffic or configure Pangolin. Once your resource trusts the app's CA, daily Companion/Safari access, device issuance/replacement and expiry reminders need **zero Pangolin API permissions**.

## Short routine

1. **Confirm the API address.** If this is a new server, complete [integration API setup](installation.md#3-enable-pangolins-integration-api). Use the separate HTTPS integration URL, such as `https://api.pangolin.example.net/v1`. `/v1` reporting healthy only proves the listener answers; `/v1/openapi.json` should return its API specification. A blank Swagger page alone is not an API authentication test.
2. **Create a temporary organization key.** For the basic connection check, enable the four reads below. Find the organization ID in Pangolin's organization settings or dashboard URL, rather than its display name. Set **Pangolin API URL (optional)** in HA app Configuration, save and restart.
3. **Run Check connection.** Expand **Pangolin connection checks**, then use **Check your Pangolin connection**. The forms are absent from the normal dashboard until you expand Advanced. Leave **Inspect resource configuration (optional)** unchecked, enter the organization ID and full API key, and select **Check connection**. A pass confirms the inspected API contract and authorized reads for that organization. The key field clears and the key is not saved.
4. **Optionally inspect your prepared resource.** Add the three extra read permissions, select resource inspection, and supply its exact identifier and expected hostname. Review the resource, targets, policy and CA trust. Findings about existing targets/trust or mTLS already enabled are expected for your configured resource; do not remove them just to clear a warning.
5. **Check actual access separately.** With the intended resource active and mTLS on, verify rejection of a fresh client without a certificate, then verify the enrolled client works at the protected hostname over cellular. Use the [short installation checks](installation.md#8-activate-and-perform-the-short-installation-checks). A failed DNS lookup, timeout or server-certificate error is not proof of mTLS rejection. API success alone cannot establish edge enforcement.
6. **Finish.** Revoke the temporary API key if no further inspection is needed. Keep the resource, targets and trusted CA configured. Adding another device under the same CA does not require repeating API setup, uploading the CA again or keeping the key alive.

## Read permissions

| Check | Permissions |
| --- | --- |
| Basic connection: four reads | Get Organization; List Sites; List Organization Domains; List Resources |
| Resource inspection: add three reads | Get Resource; Get Resource Policy; List Targets |
| Daily operation after setup | None |

No write, delete or root key is needed. A permission-denied message names the failing operation; add that read for the correct organization, rather than enabling every action. A changed key must be reentered in the form.

Use [Troubleshooting](troubleshooting.md) for URL/origin/permission failures. The [advanced checks](manual-checks.md) are for diagnosis or changed deployments, not a daily routine or a requirement for every new device. Pangolin may change API contracts; these instructions were checked against the project's inspected 1.25.2 interface.

## Is there useful certificate automation beyond testing?

Yes. The existing read-only checks validate prerequisites for future CA-trust management; they are not the full extent of Pangolin's API. The distinction is between issuing device identities locally and configuring which CAs Pangolin trusts.

| Task | Pangolin capability | Current app |
| --- | --- | --- |
| Issue/sign a device certificate and encrypted package | Bring your own CA; not issued by Pangolin | Implemented locally |
| Upload/list trusted public CA certificates | Supported integration API operations | Read-only inspection; upload remains manual |
| Enable mTLS after valid CA trust is present | Supported resource update | Manual Pangolin dashboard step |
| Overlap CA A and CA B, then remove old A while B remains | Trust add/list/delete operations can support an orchestrated rotation | Rotation workflow not implemented |
| Install/renew an identity inside an unmanaged phone's apps | Not performed by this API | Manual import and test |
| Revoke one leaf under the shared CA | Not supported by the inspected public-resource mTLS interface | No revoke control |

A safe future setup workflow could upload this app's public CA to one explicitly selected resource and enable mTLS after reviewing the changes. Rotation additionally needs durable operation tracking, policy ownership/capacity checks, new-client acceptance, old-trust removal safeguards, reconciliation after uncertain writes and session/edge validation. Shared policies and unrelated trust must be preserved. An API key with write access alone does not provide these safeguards. No such write workflow is included in the current app, so daily users do not need the API tools or credentials. Never delete the final trusted CA: Pangolin disables mTLS in that case.

See the [pinned API inventory and enforcement evidence](research.md#exact-public-api-inventory) and [Pangolin mTLS guide](https://docs.pangolin.net/manage/access-control/mtls).
