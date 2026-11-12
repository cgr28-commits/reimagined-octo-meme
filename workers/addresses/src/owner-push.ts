/**
 * Owner Dashboard push notifications (iPhone Home Screen app, Android, desktop).
 * Subscriptions, preferences and the VAPID identity live in the private KV store.
 * Notifications are raised from emails arriving in the dashboard inbox, so every alert
 * the office already receives by email can also reach the phone — without touching
 * booking or payment code.
 */
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  generateVapidKeys,
  isAllowedPushEndpoint,
  sendWebPush,
  type StoredPushSubscription,
  type VapidKeys,
} from "./web-push";

export type OwnerPushEnv = DriverAuthEnv & { TRACKING_STORE?: KVNamespace; DRIVER_DB?: unknown };

export const PUSH_CATEGORIES = {
  bookings: { label: "New paid bookings", defaultOn: true },
  messages: { label: "Customer emails and WhatsApp hand-overs", defaultOn: true },
  requests: { label: "Booking requests needing your decision", defaultOn: true },
  cancellations: { label: "Cancellations and refunds", defaultOn: true },
  calls: { label: "Phone calls taken by the receptionist", defaultOn: true },
  payments: { label: "Payment problems", defaultOn: true },
  // Driver portal (Stage 2). Only listed where driver accounts are switched on.
  drivers: { label: "Driver jobs and urgent driver reports", defaultOn: true },
} as const;
export type PushCategory = keyof typeof PUSH_CATEGORIES;
export type PushPrefs = Record<PushCategory, boolean>;

type DeviceSubscription = StoredPushSubscription & { label: string; createdAt: string };

const VAPID_KEY = "owner-push:vapid";
const SUBS_KEY = "owner-push:subscriptions";
const PREFS_KEY = "owner-push:prefs";
const MAX_DEVICES = 8;
const VAPID_SUBJECT = "mailto:bookings@myairporttaxini.co.uk";
const OWN_DOMAIN = "myairporttaxini.co.uk";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

async function readJson<T>(store: KVNamespace, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getVapid(store: KVNamespace): Promise<VapidKeys> {
  const existing = await readJson<VapidKeys>(store, VAPID_KEY);
  if (existing?.publicKey && existing.privateJwk) return existing;
  const created = await generateVapidKeys();
  await store.put(VAPID_KEY, JSON.stringify(created));
  return created;
}

async function getSubscriptions(store: KVNamespace): Promise<DeviceSubscription[]> {
  return (await readJson<DeviceSubscription[]>(store, SUBS_KEY)) ?? [];
}

export function defaultPushPrefs(): PushPrefs {
  return Object.fromEntries(Object.entries(PUSH_CATEGORIES).map(([k, v]) => [k, v.defaultOn])) as PushPrefs;
}

async function getPrefs(store: KVNamespace): Promise<PushPrefs> {
  return { ...defaultPushPrefs(), ...((await readJson<Partial<PushPrefs>>(store, PREFS_KEY)) ?? {}) };
}

export type OwnerPushNotice = { category: PushCategory; title: string; body: string; url: string; tag?: string };

/**
 * Decide whether an email arriving in the dashboard inbox deserves a phone alert.
 * Routine automatic emails (quote viewed/saved, daily reports, confirmations copied to the
 * office) return null.
 */
export function pushNoticeForInboundEmail(email: { from: string; fromName?: string; subject: string; text: string }): OwnerPushNotice | null {
  const from = email.from.trim().toLowerCase();
  const domain = from.slice(from.lastIndexOf("@") + 1);
  const subject = email.subject.trim();
  const snippet = email.text.replace(/\s+/g, " ").trim().slice(0, 140);
  const inbox = "/owner/?ui=mobile#inbox";

  if (domain === "fonio.ai" || domain.endsWith(".fonio.ai") || /\(fonio\)/i.test(subject)) {
    return { category: "calls", title: "Phone call taken", body: subject.slice(0, 120), url: inbox, tag: "call" };
  }

  const own = domain === OWN_DOMAIN || domain.endsWith(`.${OWN_DOMAIN}`);
  const automated = own || /^(no-?reply|do-?not-?reply|donotreply|notifications?|mailer-daemon|postmaster|bounces?)([+._-].*)?@/.test(from);
  if (!automated) {
    return {
      category: "messages",
      title: `Email from ${email.fromName?.trim() || from}`.slice(0, 80),
      body: `${subject}${snippet ? ` — ${snippet}` : ""}`.slice(0, 160),
      url: inbox,
    };
  }
  if (!own) return null;

  if (/^Paid booking\b/i.test(subject)) {
    return { category: "bookings", title: "New paid booking", body: subject.replace(/^Paid booking\s*[—-]\s*/i, "").slice(0, 140), url: "/owner/?ui=mobile#bookings" };
  }
  if (/^WhatsApp: .*wants to speak/i.test(subject)) {
    return { category: "messages", title: "WhatsApp customer wants to speak to you", body: subject.replace(/^WhatsApp:\s*/i, "").slice(0, 140), url: inbox };
  }
  if (/REFUND (FAILED|RECONCILIATION)|could not be charged|payment unsuccessful/i.test(subject)) {
    return { category: "payments", title: "Payment problem", body: subject.slice(0, 140), url: inbox };
  }
  if (/cancell?ation|refund issued/i.test(subject)) {
    return { category: "cancellations", title: "Cancellation or refund", body: subject.slice(0, 140), url: inbox };
  }
  if (/short[- ]notice|awaiting (your )?(approval|decision)|needs your (approval|decision)|request[- ]only|booking request (received|needs)|7[- ]seater request|minibus request/i.test(subject)) {
    return { category: "requests", title: "Booking request needs your decision", body: subject.slice(0, 140), url: "/owner/?ui=mobile#home" };
  }
  return null;
}

/** Send one notice to every registered device (respecting preferences). Never throws. */
export async function notifyOwnerPush(
  env: OwnerPushEnv,
  notice: OwnerPushNotice,
  fetchImpl: typeof fetch = fetch,
  options: { ignorePrefs?: boolean } = {},
): Promise<{ sent: number; removed: number }> {
  const store = env.TRACKING_STORE;
  if (!store) return { sent: 0, removed: 0 };
  try {
    const subs = await getSubscriptions(store);
    if (!subs.length) return { sent: 0, removed: 0 };
    if (!options.ignorePrefs && !(await getPrefs(store))[notice.category]) return { sent: 0, removed: 0 };
    const vapid = await getVapid(store);
    const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, tag: notice.tag ?? notice.category });
    let sent = 0;
    const gone = new Set<string>();
    await Promise.all(
      subs.map(async (sub) => {
        try {
          const result = await sendWebPush(sub, payload, vapid, { subject: VAPID_SUBJECT }, fetchImpl);
          if (result.ok) sent++;
          else if (result.gone) gone.add(sub.endpoint);
          else console.warn(JSON.stringify({ event: "owner_push_failed", status: result.status }));
        } catch (error) {
          console.warn(JSON.stringify({ event: "owner_push_error", message: error instanceof Error ? error.message : "unknown" }));
        }
      }),
    );
    if (gone.size) {
      // Re-read so a device added meanwhile is not lost.
      const latest = await getSubscriptions(store);
      await store.put(SUBS_KEY, JSON.stringify(latest.filter((s) => !gone.has(s.endpoint))));
    }
    return { sent, removed: gone.size };
  } catch (error) {
    console.warn(JSON.stringify({ event: "owner_push_error", message: error instanceof Error ? error.message : "unknown" }));
    return { sent: 0, removed: 0 };
  }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Routes: GET /owner/push, POST /owner/push/{subscribe,unsubscribe,prefs,test}. Null if not a push route. */
export async function handleOwnerPushRequest(
  request: Request,
  env: OwnerPushEnv,
  origin: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/^\/api(?=\/owner\/)/, "").replace(/\/+$/, "");
  if (path !== "/owner/push" && !path.startsWith("/owner/push/")) return null;
  if (!ownerAuthorized(request, env)) return json({ error: "Owner access required" }, 401, origin);
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "Storage not configured" }, 503, origin);

  const status = async () => {
    const subs = await getSubscriptions(store);
    return {
      ok: true,
      publicKey: (await getVapid(store)).publicKey,
      devices: subs.map((s) => ({ label: s.label, createdAt: s.createdAt, endpointId: s.endpoint.slice(-16) })),
      prefs: await getPrefs(store),
      categories: Object.entries(PUSH_CATEGORIES)
        .filter(([id]) => id !== "drivers" || Boolean(env.DRIVER_DB))
        .map(([id, c]) => ({ id, label: c.label })),
    };
  };

  if (path === "/owner/push" && request.method === "GET") return json(await status(), 200, origin);

  if (request.method !== "POST") return json({ error: "Not found" }, 404, origin);
  const data = await body(request);

  if (path === "/owner/push/subscribe") {
    const sub = (data.subscription ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = String(sub.endpoint ?? "");
    const p256dh = String(sub.keys?.p256dh ?? "");
    const auth = String(sub.keys?.auth ?? "");
    if (!isAllowedPushEndpoint(endpoint) || p256dh.length < 80 || p256dh.length > 100 || auth.length < 16 || auth.length > 40) {
      return json({ error: "This device's notification details were not recognised." }, 400, origin);
    }
    const label = String(data.label ?? "").trim().slice(0, 40) || "Device";
    const subs = (await getSubscriptions(store)).filter((s) => s.endpoint !== endpoint);
    subs.push({ endpoint, keys: { p256dh, auth }, label, createdAt: new Date().toISOString() });
    await store.put(SUBS_KEY, JSON.stringify(subs.slice(-MAX_DEVICES)));
    return json(await status(), 200, origin);
  }

  if (path === "/owner/push/unsubscribe") {
    const endpoint = String(data.endpoint ?? "");
    const endpointId = String(data.endpointId ?? "");
    const subs = await getSubscriptions(store);
    const kept = subs.filter((s) => (endpoint ? s.endpoint !== endpoint : endpointId ? s.endpoint.slice(-16) !== endpointId : true));
    await store.put(SUBS_KEY, JSON.stringify(kept));
    return json(await status(), 200, origin);
  }

  if (path === "/owner/push/prefs") {
    const current = await getPrefs(store);
    const incoming = (data.prefs ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(PUSH_CATEGORIES) as PushCategory[]) {
      if (typeof incoming[key] === "boolean") current[key] = incoming[key] as boolean;
    }
    await store.put(PREFS_KEY, JSON.stringify(current));
    return json(await status(), 200, origin);
  }

  if (path === "/owner/push/test") {
    const result = await notifyOwnerPush(
      env,
      { category: "messages", title: "Notifications are on", body: "This is a test from your Owner Dashboard.", url: "/owner/?ui=mobile", tag: "test" },
      fetchImpl,
      { ignorePrefs: true },
    );
    return json({ ...(await status()), sent: result.sent, removed: result.removed }, 200, origin);
  }

  return json({ error: "Not found" }, 404, origin);
}
