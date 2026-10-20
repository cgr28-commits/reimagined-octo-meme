import { ownerAuthorized } from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import type { TrackingJobRecord } from "../shared/tracking";
import { handleDriverLocationRequest } from "./tracking-handlers";

type Env = Parameters<typeof handleDriverLocationRequest>[1];
const TTL = 3600;
const marker = (token: string) => `private-gps-test:${token}`;
const jobKey = (token: string) => `track:job:${token}`;
const historyKey = (token: string) => `track:driver-history:${token}`;

/** Isolated, one-hour test; never indexed as a booking or passed to notification handlers. */
export async function handlePrivateGpsTest(request: Request, env: Env, origin: string | null) {
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
  });
  if (!["GET", "POST"].includes(request.method)) return reply({ error: "Method not allowed" }, 405);
  if (!env.TRACKING_STORE) return reply({ error: "Tracking storage unavailable" }, 503);
  const store = env.TRACKING_STORE;
  // GET is a capability link: its random token grants access only to this temporary test pin.
  if (request.method === "POST" && !ownerAuthorized(request, env)) return reply({ error: "Owner sign-in required" }, 401);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try { body = await request.json(); } catch { return reply({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid JSON" }, 400);
  }
  if (body.action === "create") {
    const token = crypto.randomUUID().replaceAll("-", "");
    const expiresAt = Date.now() + TTL * 1000;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const p = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
    const tripDate = `${p("year")}-${p("month")}-${p("day")}`;
    const tripTime = `${p("hour")}:${p("minute")}`;
    const job: TrackingJobRecord = { token, createdAt: new Date().toISOString(), customerName: "PRIVATE GPS TEST", customerMobile: "", pickupLabel: "Private test", dropoffLabel: "Private test", tripDate, tripTime, pickupAt: `${tripDate}T${tripTime}`, sharingActive: true, journeyStatus: "tracking" };
    await store.put(jobKey(token), JSON.stringify(job), { expirationTtl: TTL });
    await store.put(marker(token), JSON.stringify({ expiresAt }), { expirationTtl: TTL });
    return reply({ ok: true, token, expiresAt });
  }
  const token = String(body.token ?? new URL(request.url).searchParams.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) return reply({ error: "Invalid test link" }, 400);
  const test = await store.get<{ expiresAt: number }>(marker(token), "json");
  if (!test || test.expiresAt <= Date.now()) return reply({ error: "Test stopped or expired" }, 410);
  if (request.method === "GET") {
    const job = await store.get<TrackingJobRecord>(jobKey(token), "json");
    const fresh = job?.driverUpdatedAt && Date.now() - Date.parse(job.driverUpdatedAt) < 90_000;
    return reply({ ok: true, expiresAt: test.expiresAt, pointCount: job?.driverLocationPointCount ?? 0, driver: fresh && job?.sharingActive ? { lat: job.driverLat, lng: job.driverLng, updatedAt: job.driverUpdatedAt } : null });
  }
  if (body.action === "stop") {
    // Revoke the viewer first, then delete all test data. Real job tokens cannot pass the marker check.
    await store.delete(marker(token));
    await store.delete(jobKey(token));
    await store.delete(historyKey(token));
    return reply({ ok: true });
  }
  if (body.action !== "location") return reply({ error: "Unknown test action" }, 400);
  const response = await handleDriverLocationRequest(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ token, lat: body.lat, lng: body.lng, accuracy: body.accuracy }) }), env, origin);
  if (!await store.get(marker(token))) {
    await store.delete(jobKey(token));
    await store.delete(historyKey(token));
    return reply({ error: "Test stopped" }, 410);
  }
  // The existing GPS handler uses normal retention. Bound every test write to the original expiry.
  const ttl = Math.max(60, Math.ceil((test.expiresAt - Date.now()) / 1000));
  for (const key of [jobKey(token), historyKey(token)]) {
    const value = await store.get(key);
    if (value) await store.put(key, value, { expirationTtl: ttl });
  }
  return response;
}
