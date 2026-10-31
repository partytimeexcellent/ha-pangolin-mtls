# Enroll a Mac

In **Device certificates → Add a device**, select **Mac**, create its certificate, save the displayed password, and choose **Download certificate (.p12)**. Use the downloaded `Home Assistant identity.p12` directly. The ZIP package is intended for iPhone and iPad.

For **Safari**, open **Keychain Access** using Spotlight. Choose **File → Import Items**, select the `.p12`, choose your **login** keychain, and enter the package password. Under **My Certificates**, confirm that the identity includes its private key. Reopen Safari, visit the Pangolin protected HTTPS Home Assistant hostname, select the identity if asked, and complete normal Home Assistant sign-in. [Apple’s Keychain import guide](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac) documents the import.

For the **Home Assistant app on Mac**, import the same `.p12` through that app’s server **Connection → Client Certificate** setting and enter the password. A Keychain import or Safari success does not confirm that Companion is configured to present the identity. The Home Assistant project reports that the missing Mac certificate control was fixed; verify the control in your installed version and test an external connection. [Home Assistant mTLS discussion](https://github.com/orgs/home-assistant/discussions/1078)

Test Safari and Companion separately from outside the local network, including a fresh app launch. Remove unneeded downloaded `.p12` copies after import. Avoid granting unrelated apps broad private-key access or marking the client CA universally trusted as a shortcut. For the other platform guides, see [device installation](device-installation.md); the optional file-based terminal check is in [advanced checks](manual-checks.md).
