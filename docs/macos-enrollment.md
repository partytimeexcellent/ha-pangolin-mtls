# macOS enrollment proposal

Status: pending real Mac testing. Safari and Companion are separate acceptance targets.

For Safari, obtain the encrypted device `.p12` through local authorized enrollment. Use Keychain Access, choose File > Import Items, select the package and your login keychain, and provide its export password. Confirm the imported identity includes its private key. Open the protected HTTPS hostname in Safari and choose the matching identity if prompted, then complete normal HA login. Apple's [Keychain import guide](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac) documents the import operation; selection and behavior with this app's chain still need testing.

For macOS Companion, test its own per-server certificate importer on the intended build. The shared Apple source includes import support, but neither a login-keychain import nor a Safari success proves Companion can use the identity. Do not promise automatic sharing between clients. Record Mac model/architecture, macOS version, Companion version, browser result, app result and WebSocket/background behavior.

Delete temporary packages after import. Do not grant unrelated apps broad private-key access or mark the client CA universally trusted as a troubleshooting shortcut. Renewal and CA replacement require new imports and explicit testing. Keep local access available during changes.
