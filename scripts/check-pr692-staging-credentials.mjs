import {ACCOUNT_ID, REQUIRED_SECRETS} from './pr692-staging-config.mjs';
// Names/presence only. Never substitutes production credentials or prints API responses.
let missing = false;
for (const name of REQUIRED_SECRETS) {
  const present = Boolean(process.env[name]?.trim());
  console.log(`${present ? 'PRESENT' : 'MISSING'} ${name}`);
  missing ||= !present;
}
if (!process.env.PR692_STAGING_FRONTEND_ORIGIN?.trim()) {
  console.log('MISSING variable PR692_STAGING_FRONTEND_ORIGIN'); missing = true;
}
if (missing) {
  console.error('BLOCKED: staging credentials/configuration are incomplete. No deployment or payment attempted.');
  process.exit(1);
}
const merchant = process.env.PR692_STAGING_SUMUP_MERCHANT_CODE.trim();
const response = await fetch(`https://api.sumup.com/v1/merchants/${encodeURIComponent(merchant)}`, {
  headers: {Authorization:`Bearer ${process.env.PR692_STAGING_SUMUP_API_KEY.trim()}`},
  redirect:'error', signal:AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`Sandbox merchant verification failed (HTTP ${response.status}); no payment attempted`);
const profile = await response.json();
if (profile.sandbox !== true || profile.merchant_code !== merchant) throw new Error('Merchant is not the configured SumUp sandbox; deployment blocked');
console.log('VERIFIED SumUp sandbox merchant (no transaction created)');
const cf = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/subdomain`, {
  headers:{Authorization:`Bearer ${process.env.PR692_STAGING_CLOUDFLARE_API_TOKEN.trim()}`},
  redirect:'error', signal:AbortSignal.timeout(15000),
});
if (!cf.ok || (await cf.json()).success !== true) throw new Error('Dedicated staging Cloudflare credential cannot access the configured account');
console.log('VERIFIED staging account access; no production Worker/storage/customer records read');
