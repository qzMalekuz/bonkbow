// Publish these before the dApp Store submission — the publisher portal asks
// for a privacy policy URL and the settings screen links to both. The domain
// matches APP_IDENTITY.uri in src/solana/config.ts (the SIWS domain).
export const DOMAIN = 'stickchers.bitwise.app';
export const SUPPORT_EMAIL = 'support@bitwise.app';
export const LEGAL_URLS = {
  privacy: `https://${DOMAIN}/privacy`,
  terms: `https://${DOMAIN}/terms`,
};
