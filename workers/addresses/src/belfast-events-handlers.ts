/**
 * Belfast event listings — Worker routes (isolated module).
 *
 * Public (only when BESPOKE_QUOTES_ENABLED = "1"; 404 otherwise):
 *   GET  /events/public              → published / postponed / cancelled upcoming events, public fields only
 *
 * Owner (X-Owner-Key header only; ?key= refused):
 *   GET  /owner/belfast-events        → every event incl. drafts and private notes
 *   POST /owner/belfast-events/action → { action: "create" | "save" | "publish" | "unpublish" | "postpone" | "cancel", id?, expectedVersion?, fields? }
 *
 * Storage: TRACKING_STORE (KV) under the new prefix "bevt:" only. Only the owner
 * writes, so a version check is enough to warn about two devices editing the
 * same event. Nothing here touches quotes, payments or bookings.
 */
import { corsHeaders } from "../shared/google-places";
import {
  BELFAST_EVENT_ID,
  applyBelfastEventAction,
  createBelfastEvent,
  sortBelfastEvents,
  toBelfastEventPublic,
  type BelfastEventAction,
  type BelfastEventPublic,
  type BelfastEventRecord,
} from "../shared/belfast-events";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

export type BelfastEventsEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  BESPOKE_QUOTES_ENABLED?: string;
};

const KEY_PREFIX = "bevt:";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 500;
const ROUTE = /^\/(?:api\/)?(?:events\/public|owner\/belfast-events(?:\/action)?)\/?$/;

export function isBelfastEventsPath(pathname: string): boolean {
  return ROUTE.test(pathname);
}

function respond(body: unknown, status: number, origin: string | null, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache, ...corsHeaders(origin) },
  });
}

function eventKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export async function listBelfastEventRecords(store: KVNamespace): Promise<BelfastEventRecord[]> {
  const records: BelfastEventRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: KEY_PREFIX, cursor, limit: 1000 });
    const loaded = await Promise.all(page.keys.map((k) => store.get<BelfastEventRecord>(k.name, "json")));
    for (const record of loaded) if (record && typeof record.id === "string") records.push(record);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && records.length < MAX_EVENTS);
  return sortBelfastEvents(records);
}

export async function getBelfastEvent(store: KVNamespace, id: string): Promise<BelfastEventRecord | null> {
  if (!BELFAST_EVENT_ID.test(id)) return null;
  return store.get<BelfastEventRecord>(eventKey(id), "json");
}

/** Public list: never drafts, never past events, never private fields. */
export async function listPublicBelfastEvents(store: KVNamespace, now = new Date()): Promise<BelfastEventPublic[]> {
  const records = await listBelfastEventRecords(store);
  return records.map((r) => toBelfastEventPublic(r, now)).filter((e): e is BelfastEventPublic => e !== null);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleBelfastEventsRoute(
  request: Request,
  env: BelfastEventsEnv,
  origin: string | null,
  now = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const path = url.pathname.replace(/^\/api/, "").replace(/\/$/, "");

  if (path === "/events/public") {
    if (env.BESPOKE_QUOTES_ENABLED !== "1") return respond({ error: "Not found" }, 404, origin);
    if (request.method !== "GET") return respond({ error: "Method not allowed" }, 405, origin);
    if (!env.TRACKING_STORE) return respond({ error: "Temporarily unavailable" }, 503, origin);
    const events = await listPublicBelfastEvents(env.TRACKING_STORE, now);
    // Short cache: cancellations should show quickly.
    return respond({ ok: true, events, generatedAt: now.toISOString() }, 200, origin, "public, max-age=300");
  }

  // Owner routes
  if (url.searchParams.has("key")) {
    return respond({ error: "Send the owner key in the X-Owner-Key header, not the URL." }, 400, origin);
  }
  if (!ownerAuthorized(request, env)) return respond({ error: "Unauthorized — owner access required." }, 401, origin);
  if (!env.TRACKING_STORE) return respond({ error: "Storage is not configured" }, 503, origin);
  const store = env.TRACKING_STORE;

  if (path === "/owner/belfast-events" && request.method === "GET") {
    const events = await listBelfastEventRecords(store);
    return respond({ ok: true, events, publicEnabled: env.BESPOKE_QUOTES_ENABLED === "1" }, 200, origin);
  }

  if (path === "/owner/belfast-events/action" && request.method === "POST") {
    const body = await readJson(request);
    if (!body) return respond({ error: "Invalid request." }, 400, origin);
    const action = body.action;
    const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? (body.fields as Record<string, unknown>) : {};

    if (action === "create") {
      const created = createBelfastEvent(fields, now);
      if (!created.ok) return respond(created, 400, origin);
      if (await store.get(eventKey(created.record.id))) {
        return respond({ ok: false, error: "An event with this name and date already exists. Edit that one instead." }, 409, origin);
      }
      await store.put(eventKey(created.record.id), JSON.stringify(created.record));
      return respond({ ok: true, record: created.record }, 201, origin);
    }

    const id = typeof body.id === "string" ? body.id : "";
    const current = id ? await getBelfastEvent(store, id) : null;
    if (!current) return respond({ ok: false, error: "Event not found." }, 404, origin);
    if (body.expectedVersion !== current.version) {
      return respond(
        { ok: false, error: "This event was changed on another device. Refresh and try again.", record: current },
        409,
        origin,
      );
    }
    let typed: BelfastEventAction | null = null;
    if (action === "save") typed = { type: "save", fields };
    else if (action === "publish" || action === "unpublish" || action === "postpone" || action === "cancel") typed = { type: action };
    if (!typed) return respond({ ok: false, error: "Unknown action." }, 400, origin);
    const result = applyBelfastEventAction(current, typed, now);
    if (!result.ok) return respond(result, 400, origin);
    await store.put(eventKey(result.record.id), JSON.stringify(result.record));
    return respond({ ok: true, record: result.record }, 200, origin);
  }

  return respond({ error: "Not found" }, 404, origin);
}
