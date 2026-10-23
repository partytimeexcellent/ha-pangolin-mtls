# Troubleshooting plan

The app is not implemented yet. These are expected diagnostic categories and safe checks for the POC.

| Symptom | Check |
| --- | --- |
| API connection fails | Exact integration API URL, server enablement, HTTPS certificate, routing, organization ID and key grants; dashboard URL is not necessarily the API URL |
| Organization discovery forbidden | Org-wide listing is root-only in 1.25.1; enter the organization ID and use an organization key |
| API says configured but certificate-less client works | Stop activation; check effective shared policy, SSL, same-host routers/redirects, edge propagation and alternate entrypoints; reread settings and run a fresh negative handshake |
| Retired device still connects | Expected with shared-CA administrative retirement; inspect trust and active sessions, then follow the documented rotation/containment process |
| All remote clients fail | Check CA trust, correct client identity, dates/time, complete chain, SNI and public server TLS; retain local access while repairing |
| Home Assistant shows 400 / proxy error | Compare actual proxy source against Core's trusted proxy configuration; do not broaden trust to every network |
| Site online but backend unavailable | Probe from the actual connector network; target `localhost` and app-only DNS are often the wrong address |
| Safari works but Companion fails | Import into Companion itself; confirm installed app version, package password/profile and complete chain; test app networking independently |
| Package says wrong password | Confirm the separately displayed password and unmodified file; investigate Apple/OpenSSL profile compatibility before changing crypto defaults |
| Ingress page blank or API 404 | Inspect ingress prefix handling and relative assets/API paths; verify socket peer and trusted path header |
| Unauthorized administrator action | Check configured HA user ID and real ingress identity; missing identity should fail closed, never bypass it by exposing a port |
| Interrupted enrollment | Single-use download may already be consumed; create a fresh issuance instead of reopening a permanent package URL |
| Restore has different device status from edge | Reconcile public CA fingerprints and live resource policy; never treat restored SQLite status as proof of enforcement |

Diagnostics should separate API reachability, target reachability, effective mTLS configuration, positive/negative fresh TLS tests, unauthenticated WebSocket reachability and user-confirmed app operation. Do not retain HA passwords or long-lived user tokens for diagnostics. Full authenticated WebSocket use is an explicit client acceptance step, not something a tokenless probe proves.

Share only sanitized versions, timestamps, operation IDs, error categories and configuration fingerprints. Never share CA private keys, client packages, export passwords, bearer keys, ingress URLs/cookies, enrollment tokens or full backups in issues. Logs must redact them before collection, including verbose/debug modes.
