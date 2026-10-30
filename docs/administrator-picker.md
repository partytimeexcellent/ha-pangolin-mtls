# Administrator setup and name picker

Dev.10 implements the intended no-ID-copying setup. It manages who may administer this certificate app, not certificate recipients. Device certificate names remain device labels.

## First setup

1. Leave **Recovery administrator IDs** empty in app Configuration. First-time setup is available to a Core-verified Home Assistant administrator only when no configured IDs or saved administrator selection exist.
2. Open ingress while signed in to HA as an active administrator. HTTPS is required. The backend reads the trusted Supervisor ingress identity and matches it to an active, non-system owner or `system-admin` member returned by Core. Neither `panel_admin`, an app token nor browser input proves the human's privileges.
3. In **Home Assistant setup**, review the URL, select **Choose administrators**, keep your own account selected, choose any additional administrators and select **Save administrators**.
4. Select **Check access**. The app verifies authorization, finishes setup and collapses the Home Assistant section. Expand it later to change administrators.

No selection is created by viewing the page, listing accounts or checking access. Before explicit save, verified setup visitors can access only setup routes/assets, never issuance, exports or Pangolin checks. Setup permission stops after any selection file has been saved, even if it contains an empty list. Other HA administrators do not automatically gain access after setup. First-run concurrent saves use revision checks; only one selection wins.

## Existing installations and recovery

Configured IDs remain an independent explicit recovery boundary and take precedence over setup mode. Turning on setup while IDs are configured does not add other administrators. Saving through the picker does not edit Supervisor options. Additional selected accounts are rechecked against Core on every request, including downloads. Directory failure, deletion, disablement and demotion deny those accounts. Configured recovery IDs retain their previous behavior.

For recovery, configure a known trusted user's ID in Supervisor app Configuration and restart; correct the selection from that account. Manual ID copying is an optional emergency path, not required for ordinary initial setup. Corrupt/unknown-version state fails startup closed; preserve a protected backup and restore a known-good file while stopped rather than deleting authorization state casually.

Selections and the setup-completion presentation flag live in `/data/state/administrators.json`, version 1, under private directory/file permissions (0700/0600). Atomic replacement and revision checks prevent partial writes and stale selections. Permissions do not encrypt backups. Older dev.9 selection files load with setup incomplete; no existing IDs are broadened. A selection edit reopens setup until re-confirmed. Completion is a local UI state shared across administrators; it never bypasses authorization.

## Core contract and remaining verification

The fixed read-only connection is `ws://supervisor/core/websocket`, with authentication followed only by `config/auth/list`. The existing `homeassistant_api` permission supports this request. The Supervisor token remains server-side memory and is cleared from the environment before child processes start. The client has a five-second deadline, 256 KiB completed-text-message check and 1,000-account schema limit. Native WebSocket framing buffers messages before application size validation. Simultaneous reads share one in-flight connection without retaining an eligibility cache. Only eligible names and stable IDs reach the selector.

Pinned sources: [Core 2026.10.0 auth handler](https://github.com/home-assistant/core/blob/2026.10.0/homeassistant/components/config/auth.py), [Supervisor 2026.10.0 proxy](https://github.com/home-assistant/supervisor/blob/2026.10.0/supervisor/api/proxy.py). Target-instance permissions remain unverified. If Core denies the command, the app fails closed; it does not infer administrator status or use a dashboard endpoint.

Live acceptance still needs actual versions and sanitized results for current-user setup without IDs, ordinary/disabled/system accounts, forged/missing ingress identity, Core outage, expired sessions, CSRF, concurrent setup, restart persistence, demotion and recovery. Local fixtures and browser simulations do not certify real Supervisor behavior. No Pangolin write or deployment is authorized by these checks.
