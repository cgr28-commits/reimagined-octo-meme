/**
 * Christmas video viewing figures (owner, 17 Nov 2026).
 *
 *   POST /christmas-video/event         { event }  — public, anonymous: adds 1 to today's counter
 *   GET  /owner/christmas-video/stats              — owner only: totals and per-day figures
 *
 * Stored in D1 (DRIVER_DB) as one row per (day, event). The table is created on first use
 * (CREATE TABLE IF NOT EXISTS), so no manual migration is needed; the same SQL is in
 * migrations/driver-db/0006_christmas_video_stats.sql for the record.
 * Nothing personal is stored: no IP address, cookie, email or visitor id.
 */
import { corsHeaders } from "../shared/google-places";
import { isChristmasVideoEvent, summarizeChristmasVideoRows } from "../shared/christmas-video-stats";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { promoDb, type PromoDb } from "./promo-store";

type Env = DriverAuthEnv & { DRIVER_DB?: unknown };

const CREATE_SQL =
  "CREATE TABLE IF NOT EXISTS christmas_video_stats (day TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event))";

let tableReady = false;

async function ensureTable(db: PromoDb): Promise<void> {
  if (tableReady) return;
  await db.prepare(CREATE_SQL).run();
  tableReady = true;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

/** Today's date in Northern Ireland, YYYY-MM-DD. */
export function londonDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isChristmasVideoPath(pathname: string): boolean {
  const p = pathname.replace(/^\/api/, "");
  return p === "/christmas-video/event" || p === "/owner/christmas-video/stats";
}

export async function recordChristmasVideoEvent(db: PromoDb, event: string, now: Date = new Date()): Promise<boolean> {
  if (!isChristmasVideoEvent(event)) return false;
  await ensureTable(db);
  await db
    .prepare(
      "INSERT INTO christmas_video_stats (day, event, count) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET count = count + 1",
    )
    .bind(londonDay(now), event)
    .run();
  return true;
}

export async function readChristmasVideoStats(db: PromoDb) {
  await ensureTable(db);
  const { results } = await db
    .prepare("SELECT day, event, count FROM christmas_video_stats ORDER BY day DESC LIMIT 2000")
    .all<{ day: string; event: string; count: number }>();
  return summarizeChristmasVideoRows(results ?? []);
}

export async function handleChristmasVideoRequest(request: Request, env: Env, origin: string | null): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const db = promoDb(env);

  if (path === "/christmas-video/event" && request.method === "POST") {
    // Sent as text/plain (no CORS preflight); body is a tiny JSON object.
    let event = "";
    try {
      const text = (await request.text()).slice(0, 200);
      event = String((JSON.parse(text) as { event?: unknown })?.event ?? "");
    } catch {
      return json({ ok: false }, 400, origin);
    }
    if (!isChristmasVideoEvent(event)) return json({ ok: false }, 400, origin);
    if (!db) return json({ ok: true, stored: false }, 200, origin);
    try {
      await recordChristmasVideoEvent(db, event);
      return json({ ok: true }, 200, origin);
    } catch (error) {
      console.error("Christmas video event failed", error instanceof Error ? error.message : String(error));
      return json({ ok: false }, 500, origin);
    }
  }

  if (path === "/owner/christmas-video/stats" && request.method === "GET") {
    if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized — owner access required." }, 401, origin);
    if (!db) return json({ error: "Viewing figures are not configured" }, 503, origin);
    try {
      return json({ ok: true, ...(await readChristmasVideoStats(db)) }, 200, origin);
    } catch (error) {
      console.error("Christmas video stats failed", error instanceof Error ? error.message : String(error));
      return json({ error: "Could not load the video figures" }, 500, origin);
    }
  }

  return json({ error: "Not found" }, 404, origin);
}
