# Install a device certificate

Use **Device certificates → Add a device** in the HA Pangolin Access app. Give each physical device its own name, choose its type, and select **Create device certificate**. Save the displayed package password before downloading. The download is available for five minutes, works once, and cannot be recovered after it expires or the app restarts. You can create the certificate on one device and transfer the downloaded file to the intended device through a trusted method.

The device type controls the download button:

| Device type | Download | Use it for |
| --- | --- | --- |
| iPhone or iPad | **Download certificate package (.zip)** | Contains `Home Assistant identity.p12` for Companion and `Install for Safari.mobileconfig` for Safari |
| Mac, Windows PC, Android, Other | **Download certificate (.p12)** | Import the encrypted identity directly into the intended device or app |

The ZIP is a transfer package for iPhone and iPad, not a separate certificate. Its `.mobileconfig` file is only for Safari on iPhone or iPad. A `.p12` holds the device certificate and its private key; keep the file and its password private. The public CA certificate used by Pangolin is a different file and is not the device download.

All four platform guides are collapsed in the app; open only the one you need. The steps are also written here for reference.

## iPhone or iPad

1. Download the ZIP. If you created it on another computer, transfer it to the iPhone or iPad with AirDrop or another trusted method.
2. Open **Files**, locate the ZIP in Downloads or its saved location, and tap it to extract a folder. [Apple’s Files guide](https://support.apple.com/en-us/102532) shows ZIP extraction.
3. For **Home Assistant Companion**, leave `Home Assistant identity.p12` in Files. Open Companion’s certificate importer for the server under **Connection → Client Certificate** or use its setup prompt. Select the `.p12` from inside Companion and enter the package password. Opening the file directly in Files may instead start an iOS Settings installation, which does not provision Companion.
4. For **Safari**, open `Install for Safari.mobileconfig`, then finish in **Settings → Profile Downloaded** or **Settings → General → VPN & Device Management**. Enter the same package password. If iOS does not offer to install the extracted profile, transfer that same `.mobileconfig` separately from your computer; do not issue another identity just for this transfer.
5. If you use both apps, complete both imports. Test the protected HTTPS Home Assistant address in each app over cellular or another external network, and sign in normally.

The Safari profile’s title is **Home Assistant mTLS - [device name] - expires [month year]**. The profile wrapper is unsigned, so iOS may say **Not Signed** or **Unverified**; review the expected title and the single certificate payload. It does not enroll the device in management. The [iOS guide](ios-enrollment.md) covers replacement and troubleshooting in more detail.

## macOS

1. Download `Home Assistant identity.p12` directly. The ZIP is intended for iPhone and iPad.
2. For **Safari**, open **Keychain Access** with Spotlight. Choose **File → Import Items**, select the `.p12`, choose the **login** keychain, and enter the package password. Under **My Certificates**, confirm that the identity has a private key beneath it. [Apple documents Keychain import](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac).
3. Reopen Safari and visit the protected HTTPS Home Assistant address. Choose the identity if Safari asks, then sign in to Home Assistant.
4. For the **Home Assistant app on Mac**, import the `.p12` in that app’s server **Connection → Client Certificate** setting and enter the password. A Keychain import alone does not confirm that the app is configured to use it. The Home Assistant project reports that the missing Mac certificate control was fixed; test on your installed app version. [Home Assistant discussion](https://github.com/orgs/home-assistant/discussions/1078)
5. Test each client you intend to use from outside the local network. Remove unneeded downloaded copies after a successful import.

## Windows

1. Download `Home Assistant identity.p12` directly and save or transfer it to the Windows PC.
2. Double-click the file in File Explorer. In the Certificate Import Wizard, select **Current User** and continue. If the wizard does not open, press **Win + R**, run `certmgr.msc`, then choose **Personal → Certificates → All Tasks → Import**. Confirm the file and enter the package password.
3. Leave **Mark this key as exportable** unchecked. Select **Place all certificates in the following store → Personal**, then complete the wizard. [Microsoft explains the Current User and Personal stores](https://learn.microsoft.com/windows-hardware/drivers/install/certificate-stores).
4. Open **Microsoft Edge or Chrome**, visit the protected HTTPS Home Assistant address, choose the imported identity if prompted, and sign in to Home Assistant.
5. Test from outside the local network. Firefox may require a separate personal-certificate import in its own certificate settings; the Windows import alone does not establish Firefox behavior. Remove unneeded downloaded copies after testing.

## Android

1. Download `Home Assistant identity.p12` directly and save or transfer it to the Android phone or tablet.
2. Open **Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate**. Choose **VPN & app user certificate**, select the `.p12`, enter the package password, and give it a recognizable name. Device makers and Android versions may use slightly different menu names. The [Home Assistant Companion instructions](https://companion.home-assistant.io/docs/getting_started/#tls-client-authentication) specify the **VPN & app user certificate** type.
3. Open **Home Assistant Companion**, enter the protected HTTPS address, and select the installed certificate when Android asks which identity the app may use. Continue with normal Home Assistant sign-in.
4. If you also use Chrome, test the same address there and choose the identity if prompted. Test over mobile data or another external network. After testing, remove unneeded downloaded `.p12` copies while keeping the installed Android credential.

If a browser or app never offers the certificate, check that you imported the **device** `.p12` into the correct store or app, that the package password was accepted, and that you are opening the Pangolin protected hostname. Downloading a file alone does not install or activate it.
