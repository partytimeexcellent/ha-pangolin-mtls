# Administrator name picker: implementation plan

The current app still requires an explicit HA user ID allowlist. A name picker is feasible, but it is not implemented in dev.8. It manages who can administer this certificate app, not who receives an individual device certificate. Certificate display names are still device labels you enter yourself.

Home Assistant exposes an administrator-only WebSocket command, `config/auth/list`. It returns IDs, display names, active status, system-account flags and groups. A group membership/owner check is needed to identify eligible administrators; it does not directly return an `is_admin` field. [HA source](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/auth.py).

## Work required

1. **Authenticate the setup administrator.** Verify the browser's HA identity and current administrator privilege. An ingress user ID is an identity assertion; `panel_admin` controls presentation and does not replace backend authorization. A system/app API token is not proof that the visiting human is an administrator. Do not let the first visitor claim an empty installation.
2. **Read eligible users through a supported authenticated connection.** Implement a bounded, read-only Core WebSocket client and validate the user-list response. Keep credentials server-side and out of logs, child-process environments and browser storage. Return only the fields needed for selection, excluding credentials/providers and unrelated account details. Prefer active, non-system administrator accounts for administration; define any non-administrator delegation separately.
3. **Store and enforce selections.** Show display names, save stable user IDs to private app state through a protected explicit action, and integrate those IDs into the existing ingress/session/CSRF authorization. Do not silently edit Supervisor's options file or expand access just because an account appears in the list. Preserve a documented recovery path if the chosen administrator is removed or loses privileges.
4. **Resolve first-run setup and migration.** Existing users can retain their explicit ID as the initial authorization boundary. To eliminate ID copying on a fresh install, add a verified HA administrator sign-in/claim flow, then save the selection. Decide how option-based IDs and UI-managed selections interact so upgrades cannot silently broaden access or lock out the owner.
5. **Test the boundary in real HA.** Cover ordinary users, forged identities, expired credentials, disabled/demoted accounts, empty allowlists, restart persistence and recovery. The Core token's ability to call an admin-only command must be verified on the actual Supervisor/Core combination; notification permission alone does not establish it.

No Pangolin permission is involved. This is a focused HA authentication/onboarding increment; adding an HA configuration translation cannot turn an ID text field into a secure dynamic user picker.
