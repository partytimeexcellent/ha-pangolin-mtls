import { identityFilename } from './download-names.js';
import { randomUUID } from 'node:crypto';

export function profileDisplayName(name: string, expiresAt: string): string {
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(expiresAt));
  return `Home Assistant mTLS - ${name} - expires ${month}`;
}

function xml(value: string): string {
  // XML 1.0 excludes isolated UTF-16 surrogates and some noncharacters.
  return Array.from(value, (character) => {
    const point = character.codePointAt(0)!;
    return point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) || point >= 0x10000 ? character : '\ufffd';
  }).join('').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

// This is a named wrapper around the already encrypted P12, never a new key or CA.
export function appleProfile(certificate: { id: string; name: string; expiresAt: string }, p12: Buffer): Buffer {
  const label = xml(profileDisplayName(certificate.name, certificate.expiresAt));
  const identifier = `org.hapangolinaccess.identity.${certificate.id}`;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${identifier}</string>
<key>PayloadUUID</key><string>${certificate.id}</string>
<key>PayloadDisplayName</key><string>${label}</string>
<key>PayloadDescription</key><string>Installs one password-protected Home Assistant client identity for Safari. No device management enrollment or root trust settings. Normal Home Assistant login remains required.</string>
<key>PayloadOrganization</key><string>Home Assistant mTLS</string>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.security.pkcs12</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${identifier}.certificate</string>
<key>PayloadUUID</key><string>${randomUUID()}</string>
<key>PayloadDisplayName</key><string>${label}</string>
<key>PayloadCertificateFileName</key><string>${identityFilename}</string>
<key>PayloadContent</key><data>${p12.toString('base64')}</data>
</dict></array>
</dict></plist>`, 'utf8');
}
