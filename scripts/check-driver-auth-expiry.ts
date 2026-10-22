import assert from 'node:assert/strict';
import { DriverAuthCoordinator, DRIVER_SESSION_SECONDS } from '../workers/addresses/src/driver-auth-coordinator';
import { resolveAuthorizedSession } from '../workers/addresses/src/driver-portal-session';
async function main() {
  const secureEnv = { OWNER_ACCESS_KEY: 'fictional-admin', DRIVER_ACCESS_KEY: 'fictional-shared', DRIVER_AUTH: {} as DurableObjectNamespace };
  const admin = await resolveAuthorizedSession(new Request('https://staging.invalid/driver/jobs', { headers: { 'X-Owner-Key': 'fictional-admin', Cookie: '__Host-matni-driver=invalid' } }), secureEnv);
  assert.ok(admin.authorized && admin.role === 'owner', 'Admin header must remain independent of driver cookie');
  assert.equal((await resolveAuthorizedSession(new Request('https://staging.invalid/driver/jobs', { headers: { 'X-Driver-Key': 'fictional-shared' } }), secureEnv)).authorized, false);

  const records = new Map<string, any>();
  const storage: any = { get: async (key: string) => records.get(key), put: async (key: string, value: any) => records.set(key, value), delete: async (key: string | string[]) => { for (const k of Array.isArray(key) ? key : [key]) records.delete(k); }, list: async () => new Map(records), getAlarm: async () => null, setAlarm: async () => {}, transaction: async (fn: any) => fn(storage) };
  const coordinator = new DriverAuthCoordinator({ storage } as any);
  const call = (action: string, body: unknown) => coordinator.fetch(new Request('https://internal/' + action, { method: 'POST', body: JSON.stringify(body) }));
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  try {
    const expired = await (await call('issue', { profileKey: 'owner', driverName: 'Fictional' })).json() as any;
    assert.ok(![...records.keys()].some(key => key.includes(expired.code)), 'Credentials are hashed at rest');
    now += 15 * 60000;
    assert.equal((await call('exchange', expired)).status, 401);
    const fresh = await (await call('issue', { profileKey: 'owner', driverName: 'Fictional' })).json() as any;
    const session = await (await call('exchange', fresh)).json() as any;
    assert.equal((await call('session', { token: session.token })).status, 200);
    now += DRIVER_SESSION_SECONDS * 1000;
    assert.equal((await call('session', { token: session.token })).status, 401);
    for (let i = 0; i < 30; i++) assert.equal((await call('rate', { client: 'fictional-client' })).status, 200);
    assert.equal((await call('rate', { client: 'fictional-client' })).status, 429);
    now += 600001; assert.equal((await call('rate', { client: 'fictional-client' })).status, 200);
    await coordinator.alarm(); assert.ok([...records.keys()].every(key => key.startsWith('rate:')));
    console.log('PASS: invitation/session expiry boundaries, hashed credentials, throttling and expired-record cleanup.');
  } finally { Date.now = originalNow; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
