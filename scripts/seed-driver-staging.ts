import fs from 'node:fs';
import { stagingStore } from './driver-integration/staging-store';
async function main() {
const id = fs.readFileSync('/tmp/myjobs-staging-namespace', 'utf8').trim();
const production = fs.readFileSync('workers/addresses/wrangler.toml', 'utf8');
if (!/^[a-f0-9]{32}$/.test(id) || production.includes(id)) throw new Error('Unsafe staging namespace');
const { data } = await stagingStore('fixture-generation-only');
const values = [...data].filter(([key]) => !key.startsWith('driver-portal-')).map(([key, value]) => ({ key, value, expiration_ttl: 86400 * 7 }));
values.push({ key: 'staging:fixture-version', value: 'v1', expiration_ttl: 86400 * 7 });
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${id}/bulk`, { method: 'PUT', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
if (!response.ok || !(await response.json() as { success: boolean }).success) throw new Error('Staging fixture seed failed');
console.log('Seeded fictional records into isolated staging KV; no production records accessed.');

}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
