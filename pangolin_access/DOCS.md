# Ingress prototype setup

Use an isolated Home Assistant OS/Supervisor test installation. This build checks identity and CSRF protection only. It cannot issue certificates, export credentials or contact Pangolin.

## Local installation

Copy this entire `pangolin_access` directory (including its lockfile and source, excluding `node_modules` and `dist`) into the Supervisor local app directory using your existing development access. Refresh the local app store, install HA Pangolin Access, and leave protection mode enabled. No GitHub repository has been published yet.

In Configuration, set:

- `admin_user_ids`: the actual 32-character Home Assistant user ID for each administrator who may use this app. Find a user's ID on their user details page in Home Assistant's user management (Advanced Mode may be needed, depending on version). This is an ID, not a display name or username. An empty list denies everyone.
- `home_assistant_origin`: the exact URL origin you use to open HA, for example `https://ha.example.net` or `http://192.168.1.50:8123`. Include a nonstandard port, but no path. Only this origin may send POST requests. If using multiple HA URLs, use the configured one during this prototype.

Start the app and select Open Web UI. Click Check my access. A pass means this request met the configured identity, peer, origin, session and CSRF checks; it does not certify Supervisor or enable signing. No credentials or external state change during the check.

## Acceptance checks

1. Confirm the allowlisted administrator can open the UI and complete the check.
2. Remove their ID, restart, and verify access is denied. Restore the intended allowlist through Supervisor options.
3. Verify a different HA account cannot access the app. `panel_admin` is an additional UI restriction; the backend independently enforces the allowlist.
4. Test through a different browser session and verify missing/expired app-session tokens fail.
5. Test attempts to reach port 8099 directly from the LAN or another app: no mapped LAN port, and non-Supervisor peers must be denied even with forged identity headers.
6. Confirm CSS/JS requests and the authorization POST stay under `/api/hassio_ingress/<token>/`, including after refresh and on a phone.
7. Confirm the service runs as UID/GID 1000 after startup, `/data/state` is 0700, and stopping/restarting works cleanly.

Record exact HA OS/Core/Supervisor versions and sanitized outcomes. Never copy actual ingress URLs, session tokens, user IDs, or cookies into public logs/issues. Older Supervisor builds that omit identity headers will be denied rather than given a fallback login.

The image uses a pinned official Node Debian image and Supervisor's init support. There is one server process after the initial privilege drop, so S6 is not needed in this increment. No API grants, additional volumes, capabilities or host networking are requested. AppArmor uses Supervisor's default profile. Container health checks only verify a listening TCP socket; real ingress behavior is a separate acceptance check.
