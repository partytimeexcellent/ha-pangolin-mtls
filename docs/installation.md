# Installation planning guide

There is no installable release yet. This is the proposed workflow, pending Phase 2 testing.

You will need Home Assistant OS with Supervisor on amd64 or aarch64, an existing Pangolin 1.25+ server, a connected site able to reach Home Assistant, an available dedicated HTTPS hostname, local HA administrator access, and a supported Apple Companion build. The app will not replace Pangolin's existing server or site infrastructure.

1. Once a repository and beta image are published, add its real URL in Home Assistant's app store repository dialog and install HA Pangolin Access. Do not use a placeholder URL. [Official repository installation model](https://contributors.home-assistant.io/apps/guides/repository/).
2. Set the allowed administrator HA user IDs through the app's Supervisor configuration, start the app, and open its ingress dashboard locally.
3. Enable Pangolin's integration API on the server, following its [official instructions](https://docs.pangolin.net/manage/integration-api). Supply its HTTPS API base URL, organization ID and a narrowly scoped organization key. Do not supply dashboard cookies or root API keys.
4. Select the existing site and domain. Enter the backend address reachable from that site. A remote connector cannot use this app's internal `homeassistant` DNS name.
5. Review a dedicated resource configuration, create the CA, upload only its public certificate and enable mTLS. Setup must verify the result before attaching/activating the Home Assistant backend.
6. Check Core's [reverse-proxy settings](https://www.home-assistant.io/integrations/http/) against the real network path. The app will not edit Core YAML automatically. Preserve HA login and backend TLS verification where used.
7. Enroll a device locally, then test the protected hostname with and without its certificate. Keep a local recovery route and an encrypted CA backup.

No port forwarding to this app, additional production container, privileged mode or Docker socket is planned. Exact screens, minimum HA version and API grants will be finalized from the POC. Before updates, take a protected backup and read migration notes; incompatible automatic upgrades must be marked as breaking changes.
