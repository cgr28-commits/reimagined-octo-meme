export { TourSettingsDO } from "./settings-do.js";
export { TourControlsDO } from "./controls-do.js";

const ROUTES = new Map([
  ["GET /settings", true], ["GET /readiness", true], ["GET /versions", true], ["GET /audit", true],
  ["POST /validate", true], ["POST /validate-itinerary", true], ["POST /publish", true], ["POST /rollback", true], ["POST /verify", true],
]);
// WP-B2 emergency controls (separate Durable Object). GET /status is the ONLY public route and is informational only.
const CONTROLS_ROUTES = new Set([
  "GET /controls", "GET /controls/versions", "GET /controls/audit", "GET /controls/notifications",
  "POST /controls/pause", "POST /controls/resume", "POST /controls/override", "POST /controls/override/revoke", "POST /controls/limits", "POST /controls/check",
]);
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/health") return json({ ok: true, service: "tours-settings", environment: env.TOURS_ENVIRONMENT || "unknown" }, 200);
    const isStatus = request.method === "GET" && path === "/status";
    const isControls = CONTROLS_ROUTES.has(`${request.method} ${path}`) || (request.method === "GET" && /^\/controls\/versions\/\d{1,8}$/.test(path));
    const allowed = isStatus || isControls || ROUTES.has(`${request.method} ${path}`) || (request.method === "GET" && /^\/versions\/\d{1,8}$/.test(path));
    if (!allowed) return json({ ok: false, error: "not-found" }, 404);
    if (env.TOURS_ENVIRONMENT !== "staging") return json({ ok: false, error: "staging-only" }, 503); // refuses to run anywhere else
    const clientId = (request.headers.get("cf-connecting-ip") || "unknown").slice(0, 64);
    const headers = new Headers(request.headers);
    headers.set("x-client-id", clientId); // overwrite any caller-supplied value
    if (isStatus || isControls) {
      const target = isStatus ? "/public-status" : path;
      const controls = env.TOUR_CONTROLS.get(env.TOUR_CONTROLS.idFromName("tour-controls-staging"));
      return controls.fetch(new Request(new URL(target, request.url), { method: request.method, headers, body: request.method === "GET" ? undefined : await request.text() }));
    }
    const stub = env.TOUR_SETTINGS.get(env.TOUR_SETTINGS.idFromName("tour-settings-staging"));
    return stub.fetch(new Request(request, { headers }));
  },
};
