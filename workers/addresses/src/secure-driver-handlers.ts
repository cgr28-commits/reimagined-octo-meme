import { trySendResendOnlyEmail, type WorkerEmailEnv } from "./worker-email";
import { authCall, credentialDigest, secureCookieHeader, secureDriverCookie, secureIdentity, validDriverMutation, type SecureDriverEnv } from './driver-auth-coordinator';
import { resolveDriverSession, type DriverAuthEnv } from './driver-auth';
import { getOwnerAccountProfile } from './owner-profile-store';
import { getDriverVehicleProfile, findSavedDriverProfileByEmail } from './driver-vehicle-store';
const json = (data: unknown, status = 200, cookie?: string) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
export async function handleSecureDriverAuth(request: Request, env: SecureDriverEnv & DriverAuthEnv & WorkerEmailEnv & { TRACKING_STORE?: KVNamespace }): Promise<Response> {
  if (!env.DRIVER_AUTH) return json({ error: 'Secure sign-in is unavailable' }, 503);
  const path = new URL(request.url).pathname;
  if (new URL(request.url).search) return json({ error: 'Credentials must not be supplied in URLs' }, 400);
  if (request.method === 'GET' && path.endsWith('/session')) {
    const identity = await secureIdentity(request, env);
    return identity ? json({ ok: true, driverName: identity.driverName }) : json({ error: 'Sign in required' }, 401);
  }
  if (request.method !== 'POST' || !validDriverMutation(request)) return json({ error: 'Request not allowed' }, 403);
  const text = await request.text();
  if (text.length > 8192) return json({ error: 'Request too large' }, 413);
  let body: Record<string, string>;
  try { body = JSON.parse(text || '{}'); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); } catch { return json({ error: 'Invalid request' }, 400); }
  if (path.endsWith('/logout')) {
    const token = secureDriverCookie(request);
    if (token && !(await authCall(env, 'logout', { token })).ok) return json({ error: 'Sign-out could not complete. Please retry.' }, 503);
    return json({ ok: true }, 200, secureCookieHeader('', 0));
  }
  if (path.endsWith('/request-code')) {
    const client = await credentialDigest('email:' + (request.headers.get('CF-Connecting-IP') || 'local'));
    if (!(await authCall(env, 'rate', { client })).ok) return json({ error: 'Too many requests. Try again later.' }, 429);
    if (!env.TRACKING_STORE) return json({ error: 'Sign-in unavailable' }, 503);
    const email = String(body.email ?? '').trim().toLowerCase();
    const recipientRate = await credentialDigest('recipient:' + email);
    if (!(await authCall(env, 'rate', { client: recipientRate })).ok) return json({ ok: true, message: 'If this email belongs to a saved driver, a sign-in code will be sent.' });
    const owner = await getOwnerAccountProfile(env.TRACKING_STORE);
    const profile = owner?.email?.toLowerCase() === email ? owner : await findSavedDriverProfileByEmail(env.TRACKING_STORE, email);
    if (profile?.email && profile.displayName) {
      const issued = await authCall(env, 'issue', { profileKey: profile.profileKey, driverName: profile.displayName });
      if (!issued.ok) return json({ error: 'Sign-in unavailable' }, 503);
      const { code } = await issued.json() as { code: string };
      // Only the fixed configured portal origin is used. No request-controlled links or secrets in URLs.
      const portal = env.SITE_URL ? new URL('/driver/', env.SITE_URL).href : '';
      if (!portal.startsWith('https://')) return json({ error: 'Sign-in unavailable' }, 503);
      await trySendResendOnlyEmail(env, { ownerCopy: false, to: profile.email, toName: profile.displayName,
        subject: 'Your My Jobs sign-in code',
        body: `Your My Jobs sign-in code is:\n${code}\n\nOpen ${portal} and paste this code. It expires in 15 minutes and works once. If you did not request it, ignore this email.`,
      });
    }
    return json({ ok: true, message: 'If this email belongs to a saved driver, a sign-in code will be sent.' });
  }
  if (path.endsWith('/exchange')) {
    const client = await credentialDigest(request.headers.get('CF-Connecting-IP') || 'local');
    if (!(await authCall(env, 'rate', { client })).ok) return json({ error: 'Too many attempts. Try again in ten minutes.' }, 429);
    const oldToken = secureDriverCookie(request);
    const exchanged = await authCall(env, 'exchange', { code: String(body.code ?? body.access ?? '').trim() });
    if (!exchanged.ok) return json({ error: 'This sign-in code is invalid, expired or already used.' }, exchanged.status);
    const result = await exchanged.json() as { token: string; driverName: string };
    if (oldToken && !(await authCall(env, 'logout', { token: oldToken })).ok) {
      await authCall(env, 'logout', { token: result.token });
      return json({ error: 'Sign-in could not complete. Please request a new code.' }, 503);
    }
    // Session credentials are NEVER returned to JavaScript.
    return json({ ok: true, driverName: result.driverName }, 200, secureCookieHeader(result.token));
  }
  if (path.endsWith('/invite')) {
    const owner = resolveDriverSession(request, env);
    if (!owner.authorized || owner.role !== 'owner' || request.headers.has('X-Driver-Session')) return json({ error: 'Owner sign-in required' }, 403);
    if (!env.TRACKING_STORE) return json({ error: 'Profiles unavailable' }, 503);
    const key = String(body.profileKey || 'owner').trim().toLowerCase();
    const profile = key === 'owner' ? await getOwnerAccountProfile(env.TRACKING_STORE) : await getDriverVehicleProfile(env.TRACKING_STORE, key);
    if (!profile?.displayName) return json({ error: 'Save the driver profile first' }, 422);
    const issued = await authCall(env, 'issue', { profileKey: profile.profileKey, driverName: profile.displayName });
    if (!issued.ok) return json({ error: 'Sign-in unavailable' }, 503);
    const result = await issued.json() as { code: string };
    return json({ code: result.code, access: result.code, jobsUrl: '/driver/' });
  }
  return json({ error: 'Not found' }, 404);
}
