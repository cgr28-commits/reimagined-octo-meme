export { TourSettingsDO } from "./settings-do.js";
export { TourControlsDO } from "./controls-do.js";
export { TourEnquiriesDO } from "./enquiries-do.js";

const ROUTES = new Map([
  ["GET /settings", true], ["GET /readiness", true], ["GET /versions", true], ["GET /audit", true],
  ["POST /validate", true], ["POST /validate-itinerary", true], ["POST /publish", true], ["POST /rollback", true], ["POST /verify", true],
]);
// WP-B2 emergency controls (separate Durable Object). GET /status is the ONLY public route and is informational only.
const CONTROLS_ROUTES = new Set([
  "GET /controls", "GET /controls/versions", "GET /controls/audit", "GET /controls/notifications",
  "POST /controls/pause", "POST /controls/resume", "POST /controls/override", "POST /controls/override/revoke", "POST /controls/limits", "POST /controls/check",
]);
// Private Tours site (staging): public customer routes (rate limited, validated) and owner-only enquiry routes.
const PUBLIC_SITE = [
  ["POST", /^\/enquiries$/, "/submit"],
  ["POST", /^\/itinerary\/save$/, "/plans"],
  ["GET", /^\/itinerary\/saved\/([A-Za-z0-9_-]{20,64})$/, (m) => `/plans/${m[1]}`],
  ["DELETE", /^\/itinerary\/saved\/([A-Za-z0-9_-]{20,64})$/, (m) => `/plans/${m[1]}`],
];
const OWNER_SITE = [
  ["GET", /^\/owner\/enquiries$/, "/owner/enquiries"],
  ["POST", /^\/owner\/enquiries\/status$/, "/owner/status"],
  ["POST", /^\/owner\/enquiries\/delete$/, "/owner/delete"],
];
function matchSite(list, method, path) {
  for (const [m, re, target] of list) {
    if (m !== method) continue;
    const hit = path.match(re);
    if (hit) return typeof target === "function" ? target(hit) : target;
  }
  return null;
}
function corsFor(request, env) {
  const origin = request.headers.get("origin");
  const allowed = String(env.TOURS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, "vary": "Origin", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS", "access-control-allow-headers": "content-type,authorization", "access-control-max-age": "600" };
}
const withCors = (response, cors) => { const r = new Response(response.body, response); for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** Environments this Worker will run in. Production serves enquiries, saved plans and the owner's emergency controls only. */
const ENVIRONMENTS = new Set(["staging", "production"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/health") return json({ ok: true, service: "tours-settings", environment: env.TOURS_ENVIRONMENT || "unknown" }, 200);
    const cors = corsFor(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
    const publicTarget = matchSite(PUBLIC_SITE, request.method, path);
    const ownerTarget = publicTarget ? null : matchSite(OWNER_SITE, request.method, path);
    if (publicTarget || ownerTarget) {
      if (!ENVIRONMENTS.has(env.TOURS_ENVIRONMENT)) return json({ ok: false, error: "not-configured" }, 503);
      const headers = new Headers(request.headers);
      headers.set("x-client-id", (request.headers.get("cf-connecting-ip") || "unknown").slice(0, 64));
      const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.text();
      if (body !== undefined && body.length > 32 * 1024) return withCors(json({ ok: false, error: "too-large" }, 413), cors);
      const stub = env.TOUR_ENQUIRIES.get(env.TOUR_ENQUIRIES.idFromName(`tour-enquiries-${env.TOURS_ENVIRONMENT}`));
      const res = await stub.fetch(new Request(new URL(publicTarget || ownerTarget, request.url), { method: request.method, headers, body }));
      return withCors(res, cors);
    }
    const isStatus = request.method === "GET" && path === "/status";
    const isControls = CONTROLS_ROUTES.has(`${request.method} ${path}`) || (request.method === "GET" && /^\/controls\/versions\/\d{1,8}$/.test(path));
    const allowed = isStatus || isControls || ROUTES.has(`${request.method} ${path}`) || (request.method === "GET" && /^\/versions\/\d{1,8}$/.test(path));
    if (!allowed) return json({ ok: false, error: "not-found" }, 404);
    if (!ENVIRONMENTS.has(env.TOURS_ENVIRONMENT)) return json({ ok: false, error: "not-configured" }, 503); // refuses to run anywhere else
    // The settings editor (publish, validate, versions) is staging only. Production has the status read and the owner's emergency controls.
    if (env.TOURS_ENVIRONMENT !== "staging" && !isStatus && !isControls) return json({ ok: false, error: "staging-only" }, 503);
    const clientId = (request.headers.get("cf-connecting-ip") || "unknown").slice(0, 64);
    const headers = new Headers(request.headers);
    headers.set("x-client-id", clientId); // overwrite any caller-supplied value
    if (isStatus || isControls) {
      const target = isStatus ? "/public-status" : path;
      const controls = env.TOUR_CONTROLS.get(env.TOUR_CONTROLS.idFromName(`tour-controls-${env.TOURS_ENVIRONMENT}`));
      return controls.fetch(new Request(new URL(target, request.url), { method: request.method, headers, body: request.method === "GET" ? undefined : await request.text() }));
    }
    const stub = env.TOUR_SETTINGS.get(env.TOUR_SETTINGS.idFromName(`tour-settings-${env.TOURS_ENVIRONMENT}`));
    return stub.fetch(new Request(request, { headers }));
  },
};
