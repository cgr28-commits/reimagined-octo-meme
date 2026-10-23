/** Called only in the guarded staging workflow. Never reads production records. */
import fs from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Staging deployment credentials unavailable');
const root = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function cf(path, options = {}) {
  const response = await fetch(root + path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Staging configuration failed (${response.status}); verify Workers Scripts and Workers KV permissions.`);
  return data.result;
}
const title = 'my-jobs-staging-bookings';
const namespaces = [];
for (let page = 1; ; page++) { const found = await cf(`/storage/kv/namespaces?per_page=100&page=${page}`); namespaces.push(...found); if (found.length < 100) break; }
const matches = namespaces.filter(item => item.title === title);
if (matches.length > 1) throw new Error('Ambiguous staging namespace');
const ns = matches[0] ?? await cf('/storage/kv/namespaces', { method: 'POST', body: JSON.stringify({ title }) });
const production = fs.readFileSync('workers/addresses/wrangler.toml', 'utf8');
if (production.includes(ns.id)) throw new Error('Staging namespace must not match any production/legacy-preview binding');
const config = {
  name: 'my-jobs-secure-staging', main: 'workers/addresses/src/driver-staging.ts', compatibility_date: '2026-10-01',
  account_id: account, workers_dev: true, preview_urls: false,
  assets: { directory: './out', binding: 'ASSETS', run_worker_first: ['/driver/*'] },
  kv_namespaces: [{ binding: 'STAGING_BOOKINGS', id: ns.id }],
  durable_objects: { bindings: [{ name: 'DRIVER_AUTH', class_name: 'DriverAuthCoordinator' }] },
  migrations: [{ tag: 'staging-driver-auth-v1', new_sqlite_classes: ['DriverAuthCoordinator'] }],
  vars: { STAGING_ONLY: 'true' }, observability: { enabled: false },
};
fs.writeFileSync('wrangler.driver-staging.generated.json', JSON.stringify(config, null, 2));
fs.writeFileSync('/tmp/myjobs-staging-namespace', ns.id);
console.log('Verified dedicated staging bindings. Production and legacy preview storage excluded.');
