import {
  advertisingConsent,
  type MeasurementConsent,
} from "../shared/measurement-consent";
import { corsHeaders } from "../shared/google-places";
export const withdrawalKey = (id: string) => `measurement:withdrawn:${id}`;
/** Fail closed if the permission is absent, expired, revoked, or the ledger is unavailable. */
export async function eligibleAdvertisingConsent(
  store: KVNamespace | undefined,
  value: unknown,
): Promise<MeasurementConsent | undefined> {
  const c = advertisingConsent(value);
  if (!c || !store) return;
  try {
    if (await store.get(withdrawalKey(c.id))) return;
    return c;
  } catch {
    return;
  }
}
export async function handleMeasurementWithdrawal(
  request: Request,
  store: KVNamespace | undefined,
  origin: string | null,
): Promise<Response> {
  const headers = {
    ...corsHeaders(origin),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("{}", { status: 405, headers });
  if (!store) return new Response("{}", { status: 503, headers });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 20_000)
      return new Response("{}", { status: 413, headers });
    body = JSON.parse(text);
  } catch {
    return new Response("{}", { status: 400, headers });
  }
  const ids = (body as { ids?: unknown })?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    !ids.every((id) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id))
  )
    return new Response("{}", { status: 400, headers });
  // Immutable denials; no endpoint can revive a grant. Longer than the maximum consent lifetime.
  try { await Promise.all(
    ids.map((id) =>
      store.put(withdrawalKey(id), "1", { expirationTtl: 180 * 86400 }),
    ),
  ); } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers });
  }
  return new Response(JSON.stringify({ ok: true }), { headers });
}
