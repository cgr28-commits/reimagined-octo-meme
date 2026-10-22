/** Atomic driver invitations and revocable sessions; separate namespace per environment. */
export type DriverIdentity = { profileKey: string; driverName: string };
export const SECURE_DRIVER_COOKIE = '__Host-matni-driver';
export const DRIVER_SESSION_SECONDS = 30 * 86400;
type Stored = DriverIdentity & { expires: number };
export async function credentialDigest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
function randomCredential(prefix: string) {
  return prefix + [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export class DriverAuthCoordinator {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname;
    const body = await request.json() as Record<string, string>;
    const now = Date.now();
    const reply = (data: unknown, status = 200) => Response.json(data, { status });
    if (action === '/issue') {
      if (!body.profileKey?.trim() || !body.driverName?.trim()) return reply({ error: 'Invalid profile' }, 400);
      const code = randomCredential('dpc_');
      await this.state.storage.put(`invite:${await credentialDigest(code)}`, { profileKey: body.profileKey.trim().toLowerCase(), driverName: body.driverName.trim(), expires: now + 15 * 60000 });
      await this.scheduleCleanup();
      return reply({ code });
    }
    if (action === '/exchange') {
      if (!/^dpc_[a-f0-9]{64}$/.test(body.code ?? '')) return reply({ error: 'Invalid or expired sign-in code' }, 401);
      const key = `invite:${await credentialDigest(body.code)}`;
      const token = randomCredential('dsc_');
      const sessionKey = `session:${await credentialDigest(token)}`;
      const identity = await this.state.storage.transaction(async txn => {
        const invitation = await txn.get<Stored>(key);
        if (!invitation || invitation.expires <= now) return null;
        await txn.delete(key);
        const session = { ...invitation, expires: now + DRIVER_SESSION_SECONDS * 1000 };
        await txn.put(sessionKey, session);
        return session;
      });
      if (!identity) return reply({ error: 'Invalid or expired sign-in code' }, 401);
      await this.scheduleCleanup();
      return reply({ token, ...identity });
    }
    if (action === '/session' || action === '/logout') {
      if (!/^dsc_[a-f0-9]{64}$/.test(body.token ?? '')) return reply({ error: 'Sign in required' }, 401);
      const key = `session:${await credentialDigest(body.token)}`;
      if (action === '/logout') { await this.state.storage.delete(key); return reply({ ok: true }); }
      const session = await this.state.storage.get<Stored>(key);
      if (!session || session.expires <= now) return reply({ error: 'Sign in required' }, 401);
      return reply(session);
    }
    if (action === '/rate') {
      const key = `rate:${body.client}`;
      const allowed = await this.state.storage.transaction(async txn => {
        const previous = await txn.get<{ count: number; expires: number }>(key);
        const next = previous && previous.expires > now ? { ...previous, count: previous.count + 1 } : { count: 1, expires: now + 600000 };
        await txn.put(key, next);
        return next.count <= 30;
      });
      await this.scheduleCleanup();
      return reply({ allowed }, allowed ? 200 : 429);
    }
    return reply({ error: 'Not found' }, 404);
  }
  private async scheduleCleanup() { if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(Date.now() + 3600000); }
  async alarm() {
    const entries = await this.state.storage.list<{ expires: number }>();
    const expired = [...entries].filter(([, v]) => v.expires <= Date.now()).map(([k]) => k);
    for (let i = 0; i < expired.length; i += 128) await this.state.storage.delete(expired.slice(i, i + 128));
    if (entries.size > expired.length) await this.state.storage.setAlarm(Date.now() + 3600000);
  }
}
export type SecureDriverEnv = { DRIVER_AUTH?: DurableObjectNamespace; SITE_URL?: string };
export async function authCall(env: SecureDriverEnv, action: string, data: unknown) {
  if (!env.DRIVER_AUTH) return Response.json({ error: 'Secure driver sign-in is not configured' }, { status: 503 });
  return env.DRIVER_AUTH.get(env.DRIVER_AUTH.idFromName('driver-auth-v1')).fetch(new Request(`https://driver-auth.internal/${action}`, { method: 'POST', body: JSON.stringify(data) }));
}
export function secureDriverCookie(request: Request) {
  return (request.headers.get('Cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(SECURE_DRIVER_COOKIE + '='))?.slice(SECURE_DRIVER_COOKIE.length + 1) ?? '';
}
export function secureCookieHeader(token: string, seconds = DRIVER_SESSION_SECONDS) {
  return `${SECURE_DRIVER_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export function validDriverMutation(request: Request) {
  return request.headers.get('Origin') === new URL(request.url).origin && request.headers.get('X-Driver-Intent') === 'portal';
}
export async function secureIdentity(request: Request, env: SecureDriverEnv): Promise<DriverIdentity | null> {
  const token = secureDriverCookie(request);
  if (!token) return null;
  const response = await authCall(env, 'session', { token });
  if (!response.ok) return null;
  return response.json() as Promise<DriverIdentity>;
}
