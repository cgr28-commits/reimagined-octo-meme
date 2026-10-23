/** Pages preview entry ONLY. Not imported by the production Worker. No production bindings. */
import { stagingStore } from './staging-store';
import { handleDriverJobsRequest, handlePersonalDriverFlight } from '../../workers/addresses/src/tracking-handlers';
declare const STAGING_SESSION_SEED: string;
export async function previewRequest(request: Request, seed: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/driver/') || url.pathname === '/driver/') return null;
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  const { store, sessions } = await stagingStore(seed);
  if (url.pathname === '/driver/preview-session' && request.method === 'POST') {
    // Public test identities grant access to FICTIONAL data only. Never a production login route.
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'Origin not allowed' }, 403);
    let profile: string;
    try { profile = String((await request.json() as { profile?: string }).profile ?? 'owner'); } catch { return reply({ error: 'Invalid request' }, 400); }
    if (!Object.hasOwn(sessions, profile)) return reply({ error: 'Unknown test identity' }, 400);
    return reply({ sessionToken: sessions[profile] });
  }
  // Construct the environment explicitly: ignore all Pages project bindings and secrets.
  const env = { TRACKING_STORE: store, DRIVER_FLIGHT_MONITOR_ENABLED: 'true' };
  try {
    if (url.pathname === '/driver/jobs' && request.method === 'GET') return await handleDriverJobsRequest(request, env, null);
    if (url.pathname === '/driver/flight' && request.method === 'POST') return await handlePersonalDriverFlight(request, env, null);
    return reply({ error: 'Read-only staging preview. No bookings, messages, GPS or payments can be changed.' }, 403);
  } catch { return reply({ error: 'Staging data unavailable. Please retry.' }, 503); }
}
export default {
  async fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    const response = await previewRequest(request, STAGING_SESSION_SEED);
    return response ?? env.ASSETS.fetch(request);
  },
};
