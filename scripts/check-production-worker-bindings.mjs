/** Read-only release preflight. Never prints secret values, settings contents or customer data. */
import assert from 'node:assert/strict';
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
assert.ok(token && account, 'Production configuration cannot be verified: Cloudflare read credentials unavailable');
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/reimagined-octo-meme/settings`, {
  headers: { Authorization: `Bearer ${token}` },
});
assert.ok(response.ok, `Read-only Worker settings request failed (HTTP ${response.status})`);
const data = await response.json();
assert.equal(data.success, true, 'Cloudflare settings read unsuccessful');
const bindings = new Map((data.result?.bindings ?? []).map(b => [b.name, b.type]));
const required = ['TRACKING_STORE', 'REFUND_COORDINATOR', 'QUOTE_LEAD_COORDINATOR', 'MEET_GREET_COORDINATOR', 'CONSENT_LEDGER', 'SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'QUOTE_RECEIPT_SECRET'];
let missing = false;
for (const name of required) {
  console.log(`${bindings.has(name) ? 'PRESENT' : 'MISSING'} ${name}`);
  missing ||= !bindings.has(name);
}
for (const [label, alternatives] of [['Google address key', ['GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_API_KEY']], ['Confirmation email provider', ['RESEND_API_KEY', 'WEB3FORMS_ACCESS_KEY']]]) {
  const found = alternatives.some(name => bindings.has(name));
  console.log(`${found ? 'PRESENT' : 'MISSING'} ${label}`);
  missing ||= !found;
}
assert.equal(missing, false, 'Production binding preflight incomplete');
console.log('Read-only binding inventory passed. Presence does not verify credential validity, new code deployment, or real payment delivery.');
