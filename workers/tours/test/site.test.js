import test from "node:test";
import assert from "node:assert/strict";
import { ATTRACTIONS, ATTRACTION_BY_ID, APPROVED_COMBOS, TOURS, buildSchedule, publicView, suggest, parseHM, legEstimate, RULES } from "../src/engine/index.js";
import { FORBIDDEN_WORDING } from "../src/constants.js";
import { validateEnquiry, buildEnquiryRecord, receipt } from "../src/enquiries.js";
import { TourEnquiriesDO } from "../src/enquiries-do.js";
import { fakeStorage, KEY } from "./helpers.js";
import worker from "../src/index.js";

const D = "2027-06-10"; // a Thursday in season
const base = { date: D, startMinutes: parseHM("08:30"), pickupZoneId: "belfast-centre", guests: 2 };

test("attraction library is complete and internally consistent", () => {
  assert.ok(ATTRACTIONS.length >= 30);
  for (const a of ATTRACTIONS) {
    assert.ok(a.name && a.blurb && a.lat && a.lng && a.minutes > 0, a.id);
    assert.ok(a.minMinutes <= a.minutes && a.minutes <= a.maxMinutes, a.id);
    assert.ok(a.open[0] < a.open[1], a.id);
  }
  assert.equal(new Set(ATTRACTIONS.map((a) => a.id)).size, ATTRACTIONS.length);
  assert.ok(APPROVED_COMBOS.length > 0);
});

test("six signature tours exist and each default itinerary fits", () => {
  assert.equal(TOURS.length, 6);
  for (const t of TOURS) {
    const cruise = t.cruise ? { allAboard: "20:00", canLeaveTerminal: "08:30", confirmed: true } : undefined;
    const r = buildSchedule({ ...base, stopIds: t.stops, startMinutes: parseHM(t.start), pickupZoneId: t.cruise ? "belfast-harbour" : "belfast-centre", cruise });
    assert.equal(r.status, "fits", `${t.id}: ${JSON.stringify(r.issues)}`);
    assert.ok(r.price.pence > 0);
  }
});

test("tour copy never uses forbidden wording", () => {
  const text = JSON.stringify(TOURS) + JSON.stringify(ATTRACTIONS.map((a) => a.blurb));
  for (const re of FORBIDDEN_WORDING) assert.ok(!re.test(text), String(re));
  assert.ok(!/glengormley|glen manor/i.test(text));
});

test("website source for Private Tours never uses forbidden wording or the driver's base", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const roots = [new URL("../../../src/app/private-tours/", import.meta.url), new URL("../../../src/components/private-tours/", import.meta.url)];
  for (const root of roots) for (const f of readdirSync(root, { recursive: true }).filter((n) => /\.(tsx|ts|css)$/.test(n))) {
    const text = readFileSync(new URL(f, root), "utf8");
    for (const re of FORBIDDEN_WORDING) assert.ok(!re.test(text), `${f}: ${re}`);
    assert.ok(!/glengormley|glen manor|54\.683/i.test(text), f);
  }
});

test("rules: more than 4 guests, unapproved combination and over-long days are blocked", () => {
  const ids = TOURS[1].stops;
  assert.equal(buildSchedule({ ...base, stopIds: ids, guests: 5 }).ok, false);
  assert.equal(buildSchedule({ ...base, stopIds: ["titanic-belfast", "giants-causeway", "glenariff", "mourne-mountains"].filter((i) => ATTRACTION_BY_ID.has(i)) }).ok, false);
  const all = ATTRACTIONS.slice(0, 8).map((a) => a.id);
  assert.equal(buildSchedule({ ...base, stopIds: all }).ok, false);
});

test("cruise: all-aboard buffer is enforced and never lowered", () => {
  const stops = TOURS[5].stops;
  const tight = buildSchedule({ ...base, stopIds: stops, startMinutes: parseHM("09:00"), pickupZoneId: "belfast-harbour", cruise: { allAboard: "15:00", canLeaveTerminal: "08:30", confirmed: true } });
  assert.equal(tight.ok, false);
  const incomplete = buildSchedule({ ...base, stopIds: stops, pickupZoneId: "belfast-harbour", cruise: { allAboard: "20:00", canLeaveTerminal: "08:30", confirmed: false } });
  assert.equal(incomplete.ok, false); // the all-aboard confirmation is mandatory
  assert.equal(validateEnquiry({ ...good(), cruise: { ship: "Ship", allAboard: "20:00", canLeaveTerminal: "08:30" } }, now).ok, false);
  assert.equal(RULES.returnBufferMinutes.belfastOnly >= 60, true);
  assert.equal(RULES.returnBufferMinutes.longDistance >= 90, true);
});

test("public view never exposes driver working time, anchor or owner-only issues", () => {
  const r = buildSchedule({ ...base, stopIds: TOURS[1].stops });
  const view = JSON.stringify(publicView(r));
  assert.ok(!/driver|anchor|positioning|54\.683|glengormley/i.test(view));
});

test("the real driver anchor never ships in the engine used by the website", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../src/engine/", import.meta.url);
  for (const f of readdirSync(dir)) assert.ok(!/54\.683|DEFAULT_ANCHOR/.test(readFileSync(new URL(f, dir), "utf8")), f);
});

test("journey estimates are plausible and symmetric", () => {
  const a = ATTRACTION_BY_ID.get("titanic-belfast"), b = ATTRACTION_BY_ID.get("giants-causeway");
  const ab = legEstimate(a, b), ba = legEstimate(b, a);
  assert.ok(ab.minutes > 60 && ab.minutes < 130);
  assert.equal(ab.minutes, ba.minutes);
});

test("suggestions are deterministic for a seed, vary across seeds, and honour mobility", () => {
  const input = { ...base, interests: ["coast", "photo"], pace: "balanced", seed: 7 };
  const a = suggest(input), b = suggest(input);
  assert.deepEqual(a, b);
  assert.ok(JSON.stringify(a).length > 10);
  const other = JSON.stringify(suggest({ ...input, seed: 99, surprise: true }));
  assert.ok(other.length > 10);
});

// ---- enquiries ----
const good = () => ({ name: "Sam Customer", email: "sam@example.com", phone: "", contactVia: "email", date: "2027-06-10", startTime: "08:30", guests: 2, pickupZoneId: "belfast-centre", stopIds: TOURS[1].stops, tourId: "game-of-thrones", luggage: { large: 0, cabin: 0 }, consentToStore: true });
const now = Date.parse("2027-05-01T10:00:00Z");

test("enquiry validation: required fields, consent, honeypot, mobility consent", () => {
  assert.equal(validateEnquiry(good(), now).ok, true);
  assert.equal(validateEnquiry({ ...good(), email: "nope" }, now).ok, false);
  assert.equal(validateEnquiry({ ...good(), consentToStore: false }, now).ok, false);
  assert.equal(validateEnquiry({ ...good(), guests: 5 }, now).ok, false);
  assert.equal(validateEnquiry({ ...good(), stopIds: ["nope"] }, now).ok, false);
  assert.equal(validateEnquiry({ ...good(), website: "http://spam" }, now).spam, true);
  assert.equal(validateEnquiry({ ...good(), mobility: { preferences: ["avoid-steps"] } }, now).ok, false);
  const m = validateEnquiry({ ...good(), mobility: { preferences: ["avoid-steps", "x"], consent: true } }, now);
  assert.deepEqual(m.value.mobility, ["avoid-steps"]);
});

test("enquiry record: server-side rebuild, owner review flags, receipt leaks nothing private", () => {
  const v = validateEnquiry({ ...good(), luggage: { large: 1, cabin: 0 }, mobility: { preferences: ["avoid-steps"], consent: true } }, now).value;
  const { record } = buildEnquiryRecord(v, { id: "TE-1", now, controlsDecision: { allowed: true, manualReview: true } });
  assert.equal(record.flags.luggageReview, true);
  assert.equal(record.flags.controlsManualReview, true);
  assert.deepEqual(record.mobility, ["avoid-steps"]);
  const r = JSON.stringify(receipt(record));
  assert.ok(!/avoid-steps|sam@example|driver|working/i.test(r));
  assert.equal(receipt(record).handling, "manual-review");
});

function makeEnquiriesDO(controlsDecision) {
  const storage = fakeStorage();
  storage.getAlarm = async () => null; storage.setAlarm = async () => {};
  const env = { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging", TOUR_CONTROLS: { idFromName: () => "x", get: () => ({ fetch: async () => (controlsDecision === "throw" ? (() => { throw new Error("down"); })() : new Response(JSON.stringify({ ok: true, decision: controlsDecision })) ) }) } };
  return { storage, stub: new TourEnquiriesDO({ storage }, env) };
}
const call = (stub, method, path, body, headers = {}) => stub.fetch(new Request(`https://x.test${path}`, { method, headers: { "content-type": "application/json", "x-client-id": "c1", ...headers }, body: body ? JSON.stringify(body) : undefined }));

test("enquiries DO: stores, rate limits, fail-safe controls, owner-only reads", async () => {
  const { stub, storage } = makeEnquiriesDO("throw");
  const res = await call(stub, "POST", "/submit", good());
  assert.equal(res.status, 201);
  const rec = [...(await storage.list({ prefix: "e:" })).values()][0];
  assert.equal(rec.flags.controlsFailSafe, true); // controls unreachable => manual review, never fail open
  assert.equal((await call(stub, "GET", "/owner/enquiries")).status, 401);
  const owner = await call(stub, "GET", "/owner/enquiries", null, { authorization: `Bearer ${KEY}` });
  assert.equal((await owner.json()).entries.length, 1);
  for (let i = 0; i < 4; i++) await call(stub, "POST", "/submit", good());
  assert.equal((await call(stub, "POST", "/submit", good())).status, 429);
});

test("enquiries DO: saved plans hold no contact or mobility data, expire and can be deleted", async () => {
  const { stub, storage } = makeEnquiriesDO({ allowed: true, manualReview: false });
  const res = await call(stub, "POST", "/plans", { plan: { stopIds: TOURS[1].stops, email: "a@b.co", mobility: ["avoid-steps"], notes: "secret", guests: 2 } });
  const { token } = await res.json();
  const saved = JSON.stringify([...(await storage.list({ prefix: "p:" })).values()]);
  assert.ok(!/a@b\.co|avoid-steps|secret/.test(saved));
  assert.equal((await call(stub, "GET", `/plans/${token}`)).status, 200);
  await call(stub, "DELETE", `/plans/${token}`);
  assert.equal((await call(stub, "GET", `/plans/${token}`)).status, 404);
  const t2 = (await (await call(stub, "POST", "/plans", { plan: { stopIds: TOURS[1].stops } })).json()).token;
  const key = `p:${t2}`; const r = await storage.get(key); r.expiresAt = new Date(Date.now() - 1000).toISOString(); await storage.put(key, r);
  await storage.put("meta:lastPurge", 0);
  assert.equal((await call(stub, "GET", `/plans/${t2}`)).status, 404);
  assert.equal(await storage.get(key), undefined); // deleted, not just hidden
});

test("worker routes: public enquiry route is CORS-limited to the preview origin; owner routes need the key", async () => {
  const seen = [];
  const env = { TOURS_ENVIRONMENT: "staging", TOURS_ALLOWED_ORIGINS: "https://matni-tours-preview.pages.dev", TOUR_ENQUIRIES: { idFromName: () => "e", get: () => ({ fetch: async (r) => { seen.push(new URL(r.url).pathname); return new Response("{}", { status: 200 }); } }) } };
  const ok = await worker.fetch(new Request("https://w.test/enquiries", { method: "POST", headers: { origin: "https://matni-tours-preview.pages.dev" }, body: "{}" }), env);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://matni-tours-preview.pages.dev");
  const bad = await worker.fetch(new Request("https://w.test/enquiries", { method: "POST", headers: { origin: "https://www.myairporttaxini.co.uk" }, body: "{}" }), env);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
  assert.equal((await worker.fetch(new Request("https://w.test/internal/enquiry-decision", { method: "POST", body: "{}" }), env)).status, 404);
  assert.deepEqual(seen, ["/submit", "/submit"]);
});

test("attraction photographs: every credit is openly licensed with a Commons source, and every card has its file", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const credits = JSON.parse(readFileSync(new URL("../../../src/lib/private-tours-photo-credits.json", import.meta.url), "utf8"));
  for (const a of ATTRACTIONS) {
    const c = credits[a.id];
    assert.ok(c, `${a.id} has a credit`);
    assert.match(c.licence, /^(CC0|CC BY(-SA)? \d\.\d|Public domain)/i, a.id);
    assert.ok(!/NC|ND/.test(c.licence), a.id);
    assert.match(c.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, a.id);
    assert.ok(c.author.length > 1, a.id);
    assert.ok(existsSync(new URL(`../../../public/images/private-tours/${a.id}.webp`, import.meta.url)), `${a.id} file`);
  }
});

test("library copy states no opening hours, admission prices or accessibility facts", () => {
  const text = ATTRACTIONS.map((a) => a.blurb).join(" ");
  assert.ok(!/£|\bfree\b|opens? at|closes? at|wheelchair|step-free|accessible|Friday|Monday|Sunday/i.test(text));
});

// ---- Production launch readiness (enquiry-only) ----
import { notifyOwner, buildOwnerNotification } from "../src/notify.js";
import { readFileSync as readFileSyncLaunch, readdirSync as readdirSyncLaunch } from "node:fs";

test("owner notification: reference, date and guests only; no customer details; skipped when not configured", async () => {
  const record = { id: "TE-ABC12345", request: { date: "2027-06-10", guests: 2 }, contact: { name: "Secret Name", email: "secret@example.com", phone: "07000000000" }, request2: null, cruise: null, controls: { manualReview: true } };
  const mail = buildOwnerNotification({ ...record, request: { ...record.request, notes: "private note" }, mobility: { preferences: ["step-free"] } }, { TOURS_OWNER_URL: "https://example.test/owner/" });
  for (const secret of ["Secret Name", "secret@example.com", "07000000000", "private note", "step-free"]) assert.ok(!(mail.subject + mail.text).includes(secret), secret);
  assert.match(mail.text, /TE-ABC12345/); assert.match(mail.text, /2027-06-10/); assert.match(mail.text, /manual review/i);
  assert.deepEqual(await notifyOwner({}, record), { sent: false, reason: "not-configured" });
  const calls = [];
  const res = await notifyOwner({ RESEND_API_KEY: "k", TOURS_NOTIFY_EMAIL: "owner@example.com" }, record, async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, status: 200 }; });
  assert.equal(res.sent, true); assert.equal(calls[0][0], "https://api.resend.com/emails"); assert.deepEqual(calls[0][1].to, ["owner@example.com"]);
  assert.equal((await notifyOwner({ RESEND_API_KEY: "k", TOURS_NOTIFY_EMAIL: "o@example.com" }, record, async () => { throw new Error("down"); })).sent, false);
});

test("production Worker mode: enquiries and controls only, settings editor stays staging-only, own storage names", async () => {
  const worker = (await import("../src/index.js")).default;
  const seen = [];
  const stub = (kind) => ({ idFromName: (n) => { seen.push(`${kind}:${n}`); return n; }, get: () => ({ fetch: async () => new Response("{}", { headers: { "content-type": "application/json" } }) }) });
  const env = { TOURS_ENVIRONMENT: "production", TOURS_ALLOWED_ORIGINS: "https://www.myairporttaxini.co.uk", TOUR_ENQUIRIES: stub("e"), TOUR_CONTROLS: stub("c"), TOUR_SETTINGS: stub("s") };
  const call = (method, path, extra = {}) => worker.fetch(new Request(`https://w.test${path}`, { method, ...extra }), env);
  assert.equal((await call("GET", "/health")).status, 200);
  assert.equal((await call("GET", "/settings")).status, 503, "settings editor is not available in production");
  assert.equal((await call("POST", "/publish", { body: "{}" })).status, 503);
  assert.equal((await call("GET", "/itinerary/saved/" + "a".repeat(32))).status, 200);
  assert.equal((await call("GET", "/status")).status, 200);
  assert.ok(seen.includes("e:tour-enquiries-production") && seen.includes("c:tour-controls-production"));
  assert.ok(!seen.some((s) => s.startsWith("s:")), "settings storage untouched");
  assert.equal((await worker.fetch(new Request("https://w.test/itinerary/saved/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), { ...env, TOURS_ENVIRONMENT: "development" })).status, 503);
});

test("production config and workflow: separate Worker, manual deploy only, no airport bindings", () => {
  const toml = readFileSyncLaunch(new URL("../wrangler.production.toml", import.meta.url), "utf8");
  assert.match(toml, /name = "reimagined-octo-meme-tours"/); assert.match(toml, /TOURS_ENVIRONMENT = "production"/);
  assert.ok(!/kv_namespaces|TRACKING_STORE|BOOKING_COUNTER|\[\[routes|route =|pages\.dev/.test(toml), "no KV, routes or preview origins");
  assert.deepEqual([...toml.matchAll(/class_name = "(\w+)"/g)].map((m) => m[1]).sort(), ["TourControlsDO", "TourEnquiriesDO", "TourSettingsDO"]);
  const wf = readFileSyncLaunch(new URL("../../../.github/workflows/deploy-tours-production.yml", import.meta.url), "utf8").replace(/^\s*#.*$/gm, "");
  assert.match(wf, /on:\s*\n\s*workflow_dispatch:/); assert.ok(!/\bpush:|\bschedule:|pull_request/.test(wf));
  assert.match(wf, /DEPLOY TOURS WORKER/); assert.match(wf, /environment: tours-production/);
  const dir = new URL("../../../.github/workflows/", import.meta.url);
  for (const f of readdirSyncLaunch(dir)) if (f !== "deploy-tours-production.yml") assert.ok(!readFileSyncLaunch(new URL(f, dir), "utf8").includes("wrangler.production.toml") || !f.includes("worker"), `${f} must not deploy the tours production config`);
});

test("live mode: pages stay noindex and unlinked unless the live switch is set; sitemap and privacy cover tours", () => {
  const root = new URL("../../../", import.meta.url);
  const layout = readFileSyncLaunch(new URL("src/app/private-tours/layout.tsx", root), "utf8");
  assert.match(layout, /TOURS_LIVE\s*\?\s*\{[\s\S]*index: true[\s\S]*\}\s*:\s*\{[\s\S]*index: false/);
  assert.match(readFileSyncLaunch(new URL("src/lib/private-tours-mode.ts", root), "utf8"), /NEXT_PUBLIC_TOURS_MODE === "live"/);
  const pages = readFileSyncLaunch(new URL(".github/workflows/deploy-pages.yml", root), "utf8");
  assert.match(pages, /vars\.TOURS_LAUNCH.*= "live"/); assert.match(pages, /staging mode \(not indexed\)/);
  assert.match(readFileSyncLaunch(new URL("scripts/generate-sitemap.mjs", root), "utf8"), /TOURS_LIVE\s*\n?\s*\? \[/);
  assert.match(readFileSyncLaunch(new URL("src/app/robots.ts", root), "utf8"), /\/private-tours\/owner\//);
  assert.match(readFileSyncLaunch(new URL("src/lib/privacy.ts", root), "utf8"), /Private Tours enquiries/);
  assert.match(readFileSyncLaunch(new URL("src/app/private-tours/owner/page.tsx", root), "utf8"), /index: false/);
});

// ---- Final launch checks: prices, safe defaults, licences, no payments ----
test("public guide prices equal the published /tours prices and are never raised; cruise tours show no figure", () => {
  const root = new URL("../../../", import.meta.url);
  const published = readFileSyncLaunch(new URL("src/lib/tours.ts", root), "utf8");
  const mine = readFileSyncLaunch(new URL("src/lib/private-tours.ts", root), "utf8");
  for (const [slug, from] of [["giants-causeway", 395], ["game-of-thrones", 395], ["belfast-city", 195], ["antrim-coast", 195]]) {
    const block = published.split(`slug: "${slug}"`)[1].split("priceFrom:")[1];
    assert.equal(Number(block.match(/\d+/)[0]), from, `${slug} published price`);
    assert.match(mine, new RegExp(`"${slug}": \\{ from: ${from},`));
  }
  assert.ok(!/cruise-express|cruise-causeway/.test(mine.split("PUBLISHED_FROM_POUNDS")[1].split("export function guidePrice")[0]), "cruise tours have no public figure");
  for (const f of ["src/app/private-tours/page.tsx", "src/app/private-tours/[slug]/page.tsx", "src/app/private-tours/cruise-excursions/page.tsx", "src/components/private-tours/PlanBuilder.tsx"]) {
    const src = readFileSyncLaunch(new URL(f, root), "utf8");
    assert.ok(!/pricePence\s*\?/.test(src) && !/result\.price\.pence/.test(src), `${f} must not show engine prices`);
  }
});

test("production is enquiry-only: every enquiry is a manual review whatever the controls say; no payment or booking code in tours", async () => {
  const { TourEnquiriesDO } = await import("../src/enquiries-do.js");
  const prod = new TourEnquiriesDO({ storage: {} }, { TOURS_ENVIRONMENT: "production" });
  assert.deepEqual(
    { r: prod.enquiryOnly({ allowed: true, manualReview: false, autoQuote: true, reserveAvailability: true }).manualReview, a: prod.enquiryOnly({ autoQuote: true }).autoQuote, v: prod.enquiryOnly({ reserveAvailability: true }).reserveAvailability },
    { r: true, a: false, v: false },
  );
  const staging = new TourEnquiriesDO({ storage: {} }, { TOURS_ENVIRONMENT: "staging" });
  assert.equal(staging.enquiryOnly({ manualReview: false }).manualReview, false);
  const root = new URL("../../../", import.meta.url);
  for (const dir of ["workers/tours/src", "src/app/private-tours", "src/components/private-tours"]) {
    const walk = (u) => readdirSyncLaunch(u, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, u)) : [new URL(e.name, u)]));
    for (const f of walk(new URL(`${dir}/`, root))) if (/\.(js|ts|tsx)$/.test(f.pathname) && !f.pathname.endsWith("/workers/tours/src/controls.js")) assert.ok(!/stripe|sumup|paymentIntent|checkout\.session|booking-confirm/i.test(readFileSyncLaunch(f, "utf8")), `${f.pathname} must not contain payment or booking code`);
  }
});

test("photograph credits: every image has a credit with an allowed licence, author and source; attribution is shown", () => {
  const root = new URL("../../../", import.meta.url);
  const credits = JSON.parse(readFileSyncLaunch(new URL("src/lib/private-tours-photo-credits.json", root), "utf8"));
  const ids = Object.keys(credits); assert.ok(ids.length >= 32);
  for (const id of ids) {
    const c = credits[id];
    assert.match(c.licence, /^(CC0|CC BY(-SA)? [0-9.]+|Public domain|PDM)/i, `${id} licence ${c.licence}`);
    assert.ok(c.author && c.source && c.licenceUrl && c.title, `${id} credit fields`);
    assert.ok(readdirSyncLaunch(new URL("public/images/private-tours/", root)).includes(`${id}.webp`), `${id} image file`);
  }
});

test("terms and privacy wording for tours appears only in the live build", () => {
  const root = new URL("../../../", import.meta.url);
  for (const f of ["src/lib/terms.ts", "src/lib/privacy.ts"]) assert.match(readFileSyncLaunch(new URL(f, root), "utf8"), /TOURS_LIVE \? \[\.\.\.BASE_/);
  assert.match(readFileSyncLaunch(new URL("src/lib/terms.ts", root), "utf8"), /not a booking[\s\S]*Payment and cancellation terms for your tour are set out in your quote/);
});
