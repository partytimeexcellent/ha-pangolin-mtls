# Connect Pangolin and install the CA

The Pangolin setup is in **Pangolin setup** in the Home Assistant app. It uses Pangolin’s integration API to list public resources and upload this app’s public CA certificate to the resource you select. Normal device access, local certificate issuance and expiry reminders do not need an API key.

1. Enable Pangolin’s integration API and expose its HTTPS URL ending in `/v1`. Enter **Pangolin API URL** in this app’s **Pangolin setup** section. See the [installation guide](installation.md#3-enable-pangolins-integration-api).
2. Create an organization API key with **Get Organization**, **List Sites**, **List Organization Domains**, **List Resources**, **Get Resource**, **Get Resource Policy**, **List Targets**, and **Create Resource mTLS Certificate**. Find the organization ID in Pangolin’s organization settings or dashboard URL.
3. Create the CA in this app’s **Device certificates** section. In Pangolin, create a dedicated HTTPS public resource for Home Assistant with an inline policy. You can leave its resource and target disabled while preparing it.
4. In **Pangolin setup**, enter the API URL, Pangolin Organization ID and API key, then select **Find public resources**. Find the intended hostname and select **Install CA cert**. The app checks its identity, policy, hostname and trust first. It refuses shared policies and conflicting or incomplete hostname results. A repeated selection reports **Already installed**.
5. In Pangolin, open the resource’s **Authentication → Other Methods → Client Certificate (mTLS)**, enable the requirement and save. The app uploads CA trust; it does not enable mTLS.
6. After importing a device certificate and enabling the prepared target/resource, confirm a new client without a certificate is rejected and the enrolled device connects over the intended external network. API success alone does not prove TLS enforcement.

The key remains only in this page’s memory while it is open. Close the page or revoke the key after setup if you no longer need it. If upload reports an uncertain result, inspect trusted CAs in Pangolin before retrying. The app never sends its CA private key, device identity or package password to Pangolin. It never removes a trusted CA. Removing Pangolin’s final trusted CA disables mTLS.

See [research evidence](research.md#exact-public-api-inventory) and [Pangolin’s mTLS guide](https://docs.pangolin.net/manage/access-control/mtls).
