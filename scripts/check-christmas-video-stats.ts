/**
 * Christmas video viewing figures: counter endpoint + owner stats, against a real SQLite DB.
 * Run: npx tsx scripts/check-christmas-video-stats.ts
 */
import { DatabaseSync } from "node:sqlite";
import { handleChristmasVideoRequest } from "../workers/addresses/src/christmas-video-stats";

const sqlite = new DatabaseSync(":memory:");
const db = {
  prepare(sql: string) {
    const stmt = sqlite.prepare(sql);
    let args: unknown[] = [];
    const p = {
      bind(...v: unknown[]) { args = v; return p; },
      async first() { return (stmt.get(...(args as never[])) as never) ?? null; },
      async all() { return { results: stmt.all(...(args as never[])) as never[] }; },
      async run() { return stmt.run(...(args as never[])); },
    };
    return p;
  },
};
const env = { DRIVER_DB: db, OWNER_ACCESS_KEY: "owner-test-key-123456" } as never;
const origin = "https://www.myairporttaxini.co.uk";
const post = (body: string) =>
  handleChristmasVideoRequest(new Request("https://w.dev/christmas-video/event", { method: "POST", body, headers: { "Content-Type": "text/plain" } }), env, origin);
const get = (key?: string) =>
  handleChristmasVideoRequest(new Request("https://w.dev/owner/christmas-video/stats", { headers: key ? { "X-Owner-Key": key } : {} }), env, origin);

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

(async () => {
  for (const e of ["popup_shown", "popup_shown", "popup_shown", "popup_watched", "popup_skipped", "section_play"]) {
    const r = await post(JSON.stringify({ event: e }));
    if (r.status !== 200) check(`record ${e}`, false, String(r.status));
  }
  check("rejects unknown event", (await post(JSON.stringify({ event: "drop_table" }))).status === 400);
  check("rejects junk body", (await post("not json")).status === 400);
  check("owner figures need the owner key", (await get()).status === 401 && (await get("wrong")).status === 401);
  const r = await get("owner-test-key-123456");
  const body = (await r.json()) as { totals: Record<string, number>; days: Array<{ day: string }> };
  check("owner figures load", r.status === 200);
  check("counts add up (3 shown, 1 watched, 1 skipped, 1 homepage play)",
    body.totals.popup_shown === 3 && body.totals.popup_watched === 1 && body.totals.popup_skipped === 1 && body.totals.section_play === 1 && body.totals.popup_closed === 0,
    JSON.stringify(body.totals));
  check("one row per day (UK date)", body.days.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(body.days[0].day), body.days[0]?.day);
  const cols = sqlite.prepare("PRAGMA table_info(christmas_video_stats)").all().map((c) => (c as { name: string }).name).join(",");
  check("stores nothing personal (day, event, count only)", cols === "day,event,count", cols);
  if (failed) process.exit(1);
})();
