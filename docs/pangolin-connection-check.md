# Pangolin connection check: setup and troubleshooting only

This app's Pangolin API tools inspect configuration. They do not carry normal HA traffic or configure Pangolin. Once your resource trusts the app's CA, daily Companion/Safari access, device issuance/replacement and expiry reminders need **zero Pangolin API permissions**.

## Short routine

1. **Confirm the API address.** If this is a new server, complete [integration API setup](installation.md#3-enable-pangolins-integration-api). Use the separate HTTPS integration URL, such as `https://api.pangolin.example.net/v1`. `/v1` reporting healthy only proves the listener answers; `/v1/openapi.json` should return its API specification. A blank Swagger page alone is not an API authentication test.
2. **Create a temporary organization key.** For the basic connection check, enable the four reads below. Find the organization ID in Pangolin's organization settings or dashboard URL, rather than its display name. Set **Pangolin API URL (Setup/Testing Only)** in HA app Configuration, save and restart.
3. **Run Test API connection.** Open the app's **Pangolin setup and testing** section. Leave **Inspect resource configuration (optional)** unchecked, enter the organization ID and full API key, and select **Test API connection**. A pass confirms the inspected API contract and authorized reads for that organization. The key field clears and the key is not saved.
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
