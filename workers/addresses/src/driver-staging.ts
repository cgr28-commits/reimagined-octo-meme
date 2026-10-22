/** Dedicated staging entry: no production routes, credentials, bookings or external services. */
import { authCall, credentialDigest, validDriverMutation } from './driver-auth-coordinator';
import { handleSecureDriverAuth } from './secure-driver-handlers';
import { handleDriverJobsRequest, handlePersonalDriverFlight } from './tracking-handlers';
export { DriverAuthCoordinator } from './driver-auth-coordinator';
type Env = { STAGING_BOOKINGS: KVNamespace; DRIVER_AUTH: DurableObjectNamespace; ASSETS: Fetcher; SITE_URL?: string; STAGING_ONLY: string };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
function readOnlyStore(store: KVNamespace): KVNamespace {
  return {
    get: async (key: string, type?: string) => {
      const result = await store.get(key, type as 'json');
      // The explicitly labelled fictional delay is a persisted test record, never a provider claim.
      if (key.startsWith('driver-flight:') && type === 'json' && result && typeof result === 'object') return { ...result, lastCheckedAt: new Date().toISOString() };
      return result;
    },
    list: (options: KVNamespaceListOptions) => store.list(options),
    put: async () => { throw new Error('Staging booking records are read-only'); },
    delete: async () => { throw new Error('Staging booking records are read-only'); },
  } as unknown as KVNamespace;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.STAGING_ONLY !== 'true' || !env.STAGING_BOOKINGS || !env.DRIVER_AUTH) return reply({ error: 'Isolated staging is not configured' }, 503);
    const url = new URL(request.url);
    if (url.pathname === '/driver/staging/health') return reply({ staging: true, seeded: await env.STAGING_BOOKINGS.get('staging:fixture-version') === 'v1' });
    if (url.pathname === '/driver/staging/invite' && request.method === 'POST') {
      if (!validDriverMutation(request)) return reply({ error: 'Request not allowed' }, 403);
      const client = await credentialDigest('staging:' + (request.headers.get('CF-Connecting-IP') || 'local'));
      if (!(await authCall(env, 'rate', { client })).ok) return reply({ error: 'Too many test sign-ins. Try later.' }, 429);
      let profile: string;
      try { profile = String((await request.json() as { profile?: string }).profile ?? ''); } catch { return reply({ error: 'Invalid request' }, 400); }
      if (!['owner', 'other', 'empty'].includes(profile)) return reply({ error: 'Unknown test driver' }, 400);
      const result = await authCall(env, 'issue', { profileKey: profile, driverName: profile === 'empty' ? 'Empty sample' : 'Colin (sample)' });
      return reply(await result.json(), result.status);
    }
    const driverEnv = { DRIVER_AUTH: env.DRIVER_AUTH, TRACKING_STORE: readOnlyStore(env.STAGING_BOOKINGS), DRIVER_FLIGHT_MONITOR_ENABLED: 'true', SITE_URL: url.origin };
    try {
      if (/^\/driver\/portal\/(session|exchange|logout)$/.test(url.pathname)) return await handleSecureDriverAuth(request, driverEnv);
      if (url.pathname === '/driver/jobs' && request.method === 'GET') return await handleDriverJobsRequest(request, driverEnv, null);
      if (url.pathname === '/driver/flight' && request.method === 'POST') return await handlePersonalDriverFlight(request, driverEnv, null);
      if (url.pathname.startsWith('/driver/') && !['/driver/', '/driver/index.html'].includes(url.pathname)) return reply({ error: 'Read-only staging. Booking changes, messages and GPS are disabled.' }, 403);
      if (request.method !== 'GET' && request.method !== 'HEAD') return reply({ error: 'Read-only staging' }, 403);
      return env.ASSETS.fetch(request);
    } catch { return reply({ error: 'Staging service unavailable. Please retry.' }, 503); }
  },
};
