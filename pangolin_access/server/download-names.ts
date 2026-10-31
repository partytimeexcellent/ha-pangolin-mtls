export const identityFilename = 'Home Assistant identity.p12';
export const profileFilename = 'Install for Safari.mobileconfig';
export function downloadFilename(platform: string, format: 'p12' | 'zip' | 'mobileconfig') {
  if (format === 'p12') return identityFilename;
  if (format === 'mobileconfig') return profileFilename;
  return platform === 'ios' || platform === 'ipados' ? 'iPhone or iPad certificate package.zip' : 'Device certificate package.zip';
}
