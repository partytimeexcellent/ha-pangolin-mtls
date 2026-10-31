export function DeviceInstallGuides({ profileDisplayName }: { profileDisplayName: string }) {
  return <div className="install-guides">
    <p>Open the instructions for the device you are setting up. Each section starts closed.</p>

    <details className="install-guide"><summary>iPhone or iPad</summary>
      <ol>
        <li>Choose <strong>Download certificate package (.zip)</strong>. If you made the certificate on a different device, transfer the ZIP to your iPhone or iPad using a trusted method such as AirDrop.</li>
        <li>In the <strong>Files</strong> app, find the ZIP in Downloads or the location where you saved it. Tap it once to extract a folder. The folder contains <strong>Home Assistant identity.p12</strong> and <strong>Install for Safari.mobileconfig</strong>.</li>
        <li>For the <strong>Home Assistant Companion app</strong>, open its server’s <strong>Connection → Client Certificate</strong> setting (or the certificate prompt during setup). Choose Import, select <strong>Home Assistant identity.p12</strong> from Files, and enter the package password shown above. Open the protected Home Assistant address in Companion and sign in.</li>
        <li>For <strong>Safari</strong>, open <strong>Install for Safari.mobileconfig</strong>. In iPhone or iPad <strong>Settings</strong>, tap <strong>Profile Downloaded</strong>, or go to <strong>General → VPN &amp; Device Management</strong>. Select the profile, tap Install, and enter the package password. Its name should be <strong>{profileDisplayName}</strong>. If Files does not offer the profile installation, transfer that same .mobileconfig separately from your computer. Safari may ask you to choose the identity when you visit the protected address.</li>
        <li>If you use both Companion and Safari, complete both imports. Test the protected address over cellular or another external network. Normal Home Assistant sign-in is still required.</li>
      </ol>
      <p>The Safari profile is an unsigned wrapper around the encrypted identity. It does not enroll your device in management. An iOS “Not Signed” or “Unverified” label refers to the profile wrapper; check its name and contents before installing it. <a href="https://support.apple.com/en-us/102532" target="_blank" rel="noreferrer">Apple’s Files ZIP guide</a> explains extraction.</p>
    </details>

    <details className="install-guide"><summary>macOS</summary>
      <ol>
        <li>Choose <strong>Download certificate (.p12)</strong>. Use the <strong>Home Assistant identity.p12</strong> file directly; the ZIP is intended for iPhone and iPad.</li>
        <li>For <strong>Safari</strong>, open <strong>Keychain Access</strong> using Spotlight. Choose <strong>File → Import Items</strong>, select the downloaded .p12, choose your <strong>login</strong> keychain, and enter the package password shown above.</li>
        <li>In Keychain Access, open <strong>My Certificates</strong> and check that the imported certificate has a private key beneath it. Quit and reopen Safari, visit the protected Home Assistant HTTPS address, and choose the certificate if prompted. Then sign in to Home Assistant.</li>
        <li>For the <strong>Home Assistant app on Mac</strong>, import the same .p12 through that app’s server <strong>Connection → Client Certificate</strong> setting and enter the password. Importing into Keychain Access alone does not confirm that Companion is using it.</li>
        <li>Test each app you use from outside your local network, then remove unneeded downloaded copies of the .p12.</li>
      </ol>
      <p><a href="https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac" target="_blank" rel="noreferrer">Apple’s Keychain import guide</a></p>
    </details>

    <details className="install-guide"><summary>Windows</summary>
      <ol>
        <li>Choose <strong>Download certificate (.p12)</strong>. If you created it elsewhere, transfer <strong>Home Assistant identity.p12</strong> to the Windows PC using a trusted method.</li>
        <li>On the Windows PC, double-click the .p12 in File Explorer. In the Certificate Import Wizard, choose <strong>Current User</strong> and continue. If double-click does not open the wizard, press <strong>Win + R</strong>, run <code>certmgr.msc</code>, then choose <strong>Personal → Certificates → All Tasks → Import</strong>.</li>
        <li>Confirm the selected file, enter the package password shown above, and leave <strong>Mark this key as exportable</strong> off. Choose <strong>Place all certificates in the following store → Personal</strong>, then Finish.</li>
        <li>Open <strong>Microsoft Edge or Chrome</strong> and visit the protected Home Assistant HTTPS address. Select the imported certificate if the browser asks, then sign in to Home Assistant.</li>
        <li>Test from outside your local network. Remove unneeded downloaded copies of the .p12 after the import works.</li>
      </ol>
      <p>Firefox may use its own personal-certificate store; importing into Windows does not establish that Firefox can use the identity. <a href="https://learn.microsoft.com/windows-hardware/drivers/install/certificate-stores" target="_blank" rel="noreferrer">Microsoft’s certificate-store guide</a> explains the Current User and Personal stores.</p>
    </details>

    <details className="install-guide"><summary>Android</summary>
      <ol>
        <li>Choose <strong>Download certificate (.p12)</strong>. Save <strong>Home Assistant identity.p12</strong> on the Android device, or transfer it there using a trusted method.</li>
        <li>Open Android <strong>Settings → Security &amp; privacy → More security settings → Encryption &amp; credentials → Install a certificate</strong>. Choose <strong>VPN &amp; app user certificate</strong>, select the .p12, enter the package password shown above, and give the certificate a recognizable name. Menu names vary by device and Android version.</li>
        <li>Open the <strong>Home Assistant Companion app</strong> and connect to the protected HTTPS address. When Android asks which certificate to use, select the one you just installed and allow Companion to use it.</li>
        <li>If you also use Chrome, open the same protected address there and choose the certificate if prompted. Test from mobile data or another external network, then sign in to Home Assistant.</li>
        <li>After successful testing, remove unneeded downloaded copies of the .p12. Keep the certificate installed in Android’s credential store.</li>
      </ol>
      <p><a href="https://companion.home-assistant.io/docs/getting_started/#tls-client-authentication" target="_blank" rel="noreferrer">Home Assistant’s Android mTLS guide</a> specifies the VPN &amp; app certificate type.</p>
    </details>
  </div>;
}
