import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TourControlsDO } from "../src/controls-do.js";
import worker from "../src/index.js";
import { seedSettings } from "../src/seed.js";
import { fakeStorage, KEY } from "./helpers.js";
import {
  TOUR_CATALOGUE, UNAFFECTED_KINDS, createOverride, createPause, evaluateEnquiry, evaluatePayment, initialControls, londonDate,
  publicStatus, resumePause, setLimits, validateControls, failSafeDecision,
} from "../src/controls.js";
import { assertToursSettingsConfigIsStagingOnly } from "../../../scripts/tours-preview-guard.mjs";

const NOW = Date.parse("2027-05-10T10:00:00Z");
const GATES = { launchGatesPassed: true, availabilityConfirmed: true, safetyApproved: true };
const REASON = "Driver unavailable (test)";
let n = 0;
const id = () => `p${++n}`;
const withPause = (input, doc = initialControls()) => { const r = createPause(doc, { reason: REASON, ...input }, NOW, id()); assert.ok(r.ok, JSON.stringify(r.errors)); return r.doc; };
const isCruise = (tourId) => Boolean(TOUR_CATALOGUE.get(tourId)?.cruiseScope);
const payOk = (doc, ctx) => evaluatePayment(doc, { mandatory: { ...GATES, ...(isCruise(ctx.tourId) ? { cruiseRequirementsMet: true } : {}) }, ...ctx }, NOW);
const enq = (doc, ctx) => evaluateEnquiry(doc, ctx, NOW);

function makeControls(env = { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging" }) {
  const storage = fakeStorage();
  const stub = new TourControlsDO({ storage }, env);
  const call = async (method, path, body, { key = KEY, client = "t1" } = {}) => {
    const headers = { "x-client-id": client };
    if (key !== null) headers.authorization = `Bearer ${key}`;
    const res = await stub.fetch(new Request(`https://x.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  const version = async () => (await call("GET", "/controls")).body.version;
  const pause = async (extra = {}) => { const r = await call("POST", "/controls/pause", { expectedVersion: await version(), scope: { kind: "all" }, effect: "both", reason: REASON, ...extra }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
  return { storage, stub, call, version, pause };
}

// ===== Acceptance 1: each pause type works independently =====
test("AC1: every scope kind and effect pauses only what it should", () => {
  const all = withPause({ scope: { kind: "all" }, effect: "both" });
  assert.equal(enq(all, { tourId: "giants-causeway" }).manualReview, true);
  assert.equal(payOk(all, { tourId: "belfast-city", date: "2027-08-01" }).allowed, false);

  const tour = withPause({ scope: { kind: "tour", tourId: "giants-causeway" }, effect: "payments" });
  assert.equal(payOk(tour, { tourId: "giants-causeway" }).allowed, false);
  assert.equal(payOk(tour, { tourId: "belfast-city" }).allowed, true);
  assert.equal(enq(tour, { tourId: "giants-causeway" }).manualReview, false); // payments-only pause leaves enquiries as they were

  const variant = withPause({ scope: { kind: "tour", tourId: "antrim-coast", variantId: "full-day" }, effect: "payments" });
  assert.equal(payOk(variant, { tourId: "antrim-coast", variantId: "full-day" }).allowed, false);
  assert.equal(payOk(variant, { tourId: "antrim-coast", variantId: "half-day" }).allowed, true);
  assert.equal(payOk(variant, { tourId: "giants-causeway" }).allowed, true);

  const range = withPause({ scope: { kind: "date", from: "2027-07-01", to: "2027-07-10" }, effect: "both" });
  assert.equal(payOk(range, { tourId: "belfast-city", date: "2027-07-05" }).allowed, false);
  assert.equal(payOk(range, { tourId: "belfast-city", date: "2027-07-10" }).allowed, false); // inclusive
  assert.equal(payOk(range, { tourId: "belfast-city", date: "2027-07-11" }).allowed, true);
  assert.equal(payOk(range, { tourId: "belfast-city", date: "2027-06-30" }).allowed, true);
  assert.equal(enq(range, { tourId: "belfast-city", date: "2027-07-05" }).manualReview, true);
  assert.equal(enq(range, { tourId: "belfast-city", date: "2027-08-05" }).manualReview, false);

  const cruise = withPause({ scope: { kind: "cruise", cruiseScope: "all" }, effect: "both" });
  assert.equal(payOk(cruise, { tourId: "cruise-express" }).allowed, false);
  assert.equal(payOk(cruise, { tourId: "giants-causeway" }).allowed, true);
});

// ===== Owner decisions =====
test("D1: unpaid quotes cannot start new payments during a pause, except by an audited owner override; mandatory gates are never bypassed", () => {
  let doc = withPause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments" });
  assert.equal(payOk(doc, { tourId: "belfast-city", quoteId: "Q-1001" }).allowed, false);
  const o = createOverride(doc, { quoteId: "Q-1001", reason: "Customer already agreed price", hours: 6 }, NOW, "ov1");
  assert.ok(o.ok);
  doc = o.doc;
  const ok = payOk(doc, { tourId: "belfast-city", quoteId: "Q-1001" });
  assert.equal(ok.allowed, true);
  assert.equal(ok.overrideId, "ov1");
  assert.equal(payOk(doc, { tourId: "belfast-city", quoteId: "Q-2002" }).allowed, false); // specific to one quote
  assert.equal(payOk(doc, { tourId: "belfast-city" }).allowed, false); // no quote id
  // mandatory gates still apply even with an override
  for (const flag of Object.keys(GATES)) {
    const blocked = evaluatePayment(doc, { tourId: "belfast-city", quoteId: "Q-1001", mandatory: { ...GATES, [flag]: false } }, NOW);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.blockedBy.includes(`mandatory:${flag}`));
  }
  assert.equal(evaluatePayment(doc, { tourId: "belfast-city", quoteId: "Q-1001" }, NOW).allowed, false); // gates missing = blocked
  // expiry and revocation
  assert.equal(evaluatePayment(doc, { tourId: "belfast-city", quoteId: "Q-1001", mandatory: GATES }, NOW + 7 * 3600e3).allowed, false);
  doc.overrides[0].revokedAt = new Date(NOW).toISOString();
  assert.equal(payOk(doc, { tourId: "belfast-city", quoteId: "Q-1001" }).allowed, false);
  // an override cannot be created without reason/valid quote/hours within limit
  assert.equal(createOverride(doc, { quoteId: "Q-1", reason: "x" }, NOW, "a").ok, false);
  assert.equal(createOverride(doc, { quoteId: "bad id!", reason: REASON }, NOW, "a").ok, false);
  assert.equal(createOverride(doc, { quoteId: "Q-77", reason: REASON, hours: 73 }, NOW, "a").ok, false);
});

test("D2: new enquiries are always accepted during a pause but flagged for manual review (no auto quote, no reservation)", () => {
  const doc = withPause({ scope: { kind: "all" }, effect: "both" });
  const d = enq(doc, { tourId: "game-of-thrones" });
  assert.equal(d.allowed, true);
  assert.equal(d.manualReview, true);
  assert.equal(d.autoQuote, false);
  assert.equal(d.reserveAvailability, false);
  assert.ok(d.blockedBy.length > 0);
  const normal = enq(initialControls(), { tourId: "game-of-thrones" });
  assert.deepEqual([normal.allowed, normal.manualReview, normal.autoQuote, normal.reserveAvailability], [true, false, true, true]);
});

test("D3: date pauses apply to the scheduled tour date in Europe/London", () => {
  // 23:30 UTC on 1 June is 00:30 on 2 June in London (BST)
  assert.equal(londonDate("2027-06-01T23:30:00Z"), "2027-06-02");
  assert.equal(londonDate("2027-12-01T23:30:00Z"), "2027-12-01"); // GMT: same day
  assert.equal(londonDate("2027-06-02T00:30:00+01:00"), "2027-06-02");
  assert.equal(londonDate("2027-06-01T23:30:00"), null); // no timezone: ambiguous, rejected
  const doc = withPause({ scope: { kind: "date", from: "2027-06-02", to: "2027-06-02" }, effect: "payments" });
  assert.equal(payOk(doc, { tourId: "belfast-city", date: "2027-06-01T23:30:00Z" }).allowed, false);
  const other = withPause({ scope: { kind: "date", from: "2027-06-01", to: "2027-06-01" }, effect: "payments" });
  assert.equal(payOk(other, { tourId: "belfast-city", date: "2027-06-01T23:30:00Z" }).allowed, true);
  // the date being unknown matches conservatively
  assert.equal(payOk(doc, { tourId: "belfast-city" }).allowed, false);
  // scope validation: real dates only
  assert.equal(createPause(initialControls(), { scope: { kind: "date", from: "2027-02-30", to: "2027-03-01" }, effect: "both", reason: REASON }, NOW, "x").ok, false);
});

test("D4: configurable limits - 366 day ranges and 90 day automatic resume", () => {
  const base = initialControls();
  const mk = (from, to) => createPause(base, { scope: { kind: "date", from, to }, effect: "both", reason: REASON }, NOW, "x");
  assert.equal(mk("2027-01-01", "2027-12-31").ok, true); // 365 days
  assert.equal(mk("2028-01-01", "2028-12-31").ok, true); // 366 days (leap year)
  assert.equal(mk("2028-01-01", "2029-01-01").ok, false); // 367 days
  assert.equal(mk("2027-07-10", "2027-07-01").ok, false);
  const resume = (days) => createPause(base, { scope: { kind: "all" }, effect: "both", reason: REASON, resumeAt: new Date(NOW + days * 86400e3).toISOString() }, NOW, "x");
  assert.equal(resume(90).ok, true);
  assert.equal(resume(91).ok, false);
  assert.equal(createPause(base, { scope: { kind: "all" }, effect: "both", reason: REASON, resumeAt: new Date(NOW - 1000).toISOString() }, NOW, "x").ok, false);
  // configurable (audited via the endpoint, tested below) and applies to new pauses only
  const lim = setLimits(base, { limits: { maxRangeDays: 30, maxAutoResumeDays: 7 }, reason: "Tighten for winter" });
  assert.equal(lim.ok, true);
  assert.equal(createPause(lim.doc, { scope: { kind: "date", from: "2027-01-01", to: "2027-03-01" }, effect: "both", reason: REASON }, NOW, "x").ok, false);
  assert.equal(setLimits(base, { limits: { maxRangeDays: 0 }, reason: REASON }).ok, false);
  assert.equal(setLimits(base, { limits: { nonsense: 5 }, reason: REASON }).ok, false);
  assert.equal(setLimits(base, { limits: {}, reason: REASON }).ok, false);
});

test("D5: all-cruise, Belfast-only and long-distance cruise pauses", () => {
  const seed = seedSettings();
  for (const t of seed.commercial.tours) assert.equal(TOUR_CATALOGUE.get(t.id).cruiseScope, t.cruiseScope || null); // catalogue matches the seed
  const matrix = { all: { "cruise-express": true, "cruise-causeway": true }, belfastOnly: { "cruise-express": true, "cruise-causeway": false }, longDistance: { "cruise-express": false, "cruise-causeway": true } };
  for (const [scope, expected] of Object.entries(matrix)) {
    const doc = withPause({ scope: { kind: "cruise", cruiseScope: scope }, effect: "payments" });
    for (const [tourId, paused] of Object.entries(expected)) assert.equal(payOk(doc, { tourId }).allowed, !paused, `${scope} ${tourId}`);
    for (const tourId of ["giants-causeway", "belfast-city", "game-of-thrones", "antrim-coast"]) assert.equal(payOk(doc, { tourId }).allowed, true, `${scope} must not touch ${tourId}`);
  }
  assert.equal(createPause(initialControls(), { scope: { kind: "cruise", cruiseScope: "everything" }, effect: "both", reason: REASON }, NOW, "x").ok, false);
});

// ===== Additional safeguards =====
test("auto-resume never overrides another pause or a mandatory gate", () => {
  let doc = withPause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments", resumeAt: new Date(NOW + 3600e3).toISOString() });
  doc = withPause({ scope: { kind: "all" }, effect: "payments" }, doc); // a second, open-ended pause
  const later = NOW + 2 * 3600e3;
  assert.equal(evaluatePayment(doc, { tourId: "belfast-city", mandatory: GATES }, later).allowed, false); // first expired, second still applies
  assert.equal(evaluatePayment(doc, { tourId: "belfast-city", mandatory: GATES }, later).blockedBy.length, 1);
  const only = withPause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments", resumeAt: new Date(NOW + 3600e3).toISOString() });
  assert.equal(evaluatePayment(only, { tourId: "belfast-city", mandatory: GATES }, later).allowed, true); // resumed automatically...
  assert.equal(evaluatePayment(only, { tourId: "belfast-city", mandatory: { ...GATES, safetyApproved: false } }, later).allowed, false); // ...but gates still block
  assert.equal(evaluatePayment(only, { tourId: "belfast-city" }, later).allowed, false);
  // manual resume of one pause does not lift another
  const r = resumePause(doc, { pauseId: doc.pauses[1].id, reason: "Issue fixed" }, NOW);
  assert.ok(r.ok);
  assert.equal(evaluatePayment(r.doc, { tourId: "belfast-city", mandatory: GATES }, NOW).allowed, false); // the tour pause still applies
  assert.equal(evaluatePayment(r.doc, { tourId: "giants-causeway", mandatory: GATES }, NOW).allowed, true); // the resumed "all" pause no longer does
  assert.deepEqual(r.stillActive, [doc.pauses[0].id]);
  assert.equal(resumePause(r.doc, { pauseId: doc.pauses[1].id, reason: "again" }, NOW).ok, false); // already resumed
});

test("confirmed bookings, payments in progress, webhooks, refunds and booking access are never affected", () => {
  assert.deepEqual(UNAFFECTED_KINDS.sort(), ["confirmed-booking", "customer-booking-access", "payment-in-progress", "refund", "stripe-webhook"]);
  const doc = withPause({ scope: { kind: "all" }, effect: "both" });
  assert.equal(doc.pauses.length, 1);
  // the decision API has no way to block these kinds
  const src = readFileSync(new URL("../src/controls.js", import.meta.url), "utf8");
  assert.match(src, /UNAFFECTED_KINDS\.includes\(kind\)\) return \{ kind, allowed: true, unaffected: true/);
});

test("scopes cannot target airport transfers or unknown tours", () => {
  for (const tourId of ["airport-transfer", "belfast-airport", "dublin-airport", "", "GIANTS-CAUSEWAY"]) {
    assert.equal(createPause(initialControls(), { scope: { kind: "tour", tourId }, effect: "both", reason: REASON }, NOW, "x").ok, false, tourId);
  }
  assert.equal(createPause(initialControls(), { scope: { kind: "all", airport: true }, effect: "both", reason: REASON }, NOW, "x").ok, false); // no extra scope keys
  assert.equal(createPause(initialControls(), { scope: { kind: "airport" }, effect: "both", reason: REASON }, NOW, "x").ok, false);
  assert.equal(evaluatePayment(initialControls(), { tourId: "airport-transfer", mandatory: GATES }, NOW).allowed, false); // unknown tour: new tour payment refused
});

test("public status is minimal and leaks nothing", () => {
  const doc = withPause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "both", reason: "SECRET internal reason" }, withPause({ scope: { kind: "date", from: "2027-07-01", to: "2027-07-03" }, effect: "payments", reason: "SECRET date reason" }));
  const s = publicStatus(doc, NOW);
  const text = JSON.stringify(s);
  assert.deepEqual(Object.keys(s).sort(), ["generatedAt", "informational", "ok", "tours"]);
  assert.equal(s.informational, true);
  assert.deepEqual(new Set(Object.values(s.tours)), new Set(["limited", "enquiry-only"]));
  assert.equal(s.tours["belfast-city"], "enquiry-only");
  assert.equal(s.tours["giants-causeway"], "limited"); // date pause: partial
  for (const secret of ["SECRET", "2027-07", "p1", "pause", "reason", "owner", "audit", "expectedVersion", "hash"]) assert.ok(!text.includes(secret), `leaks ${secret}`);
  assert.deepEqual(Object.values(publicStatus(initialControls(), NOW).tours), Array(TOUR_CATALOGUE.size).fill("open"));
});

test("fail-safe decisions pause NEW tour enquiries (manual review) and payments only", () => {
  const strip = ({ decidedAt, cacheable, recheckBeforeTransaction, ...rest }) => rest;
  assert.deepEqual(strip(failSafeDecision("enquiry")), { kind: "enquiry", allowed: true, manualReview: true, autoQuote: false, reserveAvailability: false, blockedBy: ["controls-unreadable"], failSafe: true });
  assert.deepEqual(strip(failSafeDecision("new-payment")), { kind: "new-payment", allowed: false, blockedBy: ["controls-unreadable"], failSafe: true });
  assert.equal(failSafeDecision("new-payment").cacheable, false);
});

test("structural validation rejects malformed or reserved fields", () => {
  assert.deepEqual(validateControls(initialControls()), []);
  assert.ok(validateControls({ ...initialControls(), ledgerReservationPause: { enabled: true } }).length); // reserved for the ledger package
  assert.ok(validateControls({ ...initialControls(), schema: "x" }).length);
  assert.ok(validateControls({ ...initialControls(), limits: { maxRangeDays: -1, maxAutoResumeDays: 1, maxOverrideHours: 1 } }).length);
  const dup = withPause({ scope: { kind: "all" }, effect: "both" });
  dup.pauses.push(structuredClone(dup.pauses[0]));
  assert.ok(validateControls(dup).length);
});

// ===== Store behaviour (Durable Object) =====
test("AC3: audit log is append-only and every change is a new immutable version", async () => {
  const c = makeControls();
  const p1 = await c.pause({ scope: { kind: "tour", tourId: "belfast-city" } });
  const v2 = (await c.call("GET", "/controls/versions/2")).body;
  const p2 = await c.pause({ scope: { kind: "cruise", cruiseScope: "all" }, effect: "payments" });
  assert.deepEqual((await c.call("GET", "/controls/versions/2")).body, v2); // version 2 never changes
  const res = await c.call("POST", "/controls/resume", { expectedVersion: await c.version(), pauseId: p1.pause.id, reason: "Fixed" });
  assert.equal(res.status, 200);
  assert.deepEqual((await c.call("GET", "/controls/versions/2")).body, v2);
  const audit = (await c.call("GET", "/controls/audit")).body.entries;
  assert.deepEqual(audit.map((e) => e.seq), audit.map((_, i) => i + 1)); // contiguous
  assert.deepEqual(audit.map((e) => e.action), ["seed", "pause", "pause", "resume"]);
  assert.ok(audit.every((e) => e.detail.version && e.detail.hash));
  assert.equal((await c.call("GET", "/controls/versions")).body.versions.length, 4);
  void p2;
  // there is no way to edit or delete audit via the API
  for (const [m, path] of [["DELETE", "/controls/audit"], ["PUT", "/controls/audit"], ["POST", "/controls/audit"], ["PATCH", "/controls"]]) {
    const r = await c.call(m, path, {});
    assert.ok([404, 405].includes(r.status), `${m} ${path} -> ${r.status}`);
  }
  assert.equal((await c.call("GET", "/controls/audit")).body.entries.length, audit.length);
});

test("AC4: stale versions are rejected (409), audited, and change nothing; parallel writers cannot both win", async () => {
  const c = makeControls();
  await c.pause();
  const before = (await c.call("GET", "/controls")).body;
  const stale = await c.call("POST", "/controls/pause", { expectedVersion: 1, scope: { kind: "all" }, effect: "both", reason: REASON });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.currentVersion, before.version);
  assert.equal((await c.call("POST", "/controls/pause", { scope: { kind: "all" }, effect: "both", reason: REASON })).status, 400); // expectedVersion required
  const after = (await c.call("GET", "/controls")).body;
  assert.deepEqual(after.controls, before.controls);
  assert.equal(after.version, before.version);
  const audit = (await c.call("GET", "/controls/audit")).body.entries;
  assert.ok(audit.some((e) => e.action === "conflict"));
  const v = await c.version();
  const [a, b] = await Promise.all([1, 2].map(() => c.call("POST", "/controls/pause", { expectedVersion: v, scope: { kind: "all" }, effect: "both", reason: REASON })));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

test("AC5: version, pointer, audit and notification intents are atomic (fault injection at every write)", async () => {
  for (let failAt = 1; failAt <= 6; failAt++) {
    const c = makeControls();
    await c.call("GET", "/controls"); // initialise
    const snapshot = JSON.stringify([...c.storage.map]);
    c.storage.failOnPut(failAt);
    const res = await c.call("POST", "/controls/pause", { expectedVersion: 1, scope: { kind: "all" }, effect: "both", reason: REASON });
    assert.equal(res.status, 500, `failAt ${failAt}`);
    // lockout counters are the only other key and are not touched on success; compare everything
    assert.equal(JSON.stringify([...c.storage.map]), snapshot, `partial write after failure at put ${failAt}`);
    const ok = await c.call("POST", "/controls/pause", { expectedVersion: 1, scope: { kind: "all" }, effect: "both", reason: REASON });
    assert.equal(ok.status, 200, "state is healthy and the retry succeeds");
    assert.equal((await c.call("GET", "/controls/audit")).body.entries.length, 2);
    assert.equal((await c.call("GET", "/controls/notifications")).body.entries.length, 1);
  }
});

test("AC6: owner authentication is enforced server-side on every owner route, with lockout, and fails closed", async () => {
  const c = makeControls();
  const routes = [["GET", "/controls"], ["GET", "/controls/versions"], ["GET", "/controls/versions/1"], ["GET", "/controls/audit"], ["GET", "/controls/notifications"],
    ["POST", "/controls/pause", { expectedVersion: 1, scope: { kind: "all" }, effect: "both", reason: REASON }], ["POST", "/controls/resume", { expectedVersion: 1 }],
    ["POST", "/controls/override", { expectedVersion: 1 }], ["POST", "/controls/override/revoke", { expectedVersion: 1 }], ["POST", "/controls/limits", { expectedVersion: 1 }],
    ["POST", "/controls/check", { kind: "new-payment", tourId: "belfast-city" }]];
  for (const [m, path, body] of routes) {
    for (const key of [null, "wrong-key-0123456789abcdefgh"]) {
      const r = await c.call(m, path, body, { key, client: `c-${m}-${path}-${key}` });
      assert.equal(r.status, 401, `${m} ${path}`);
    }
  }
  assert.equal((await c.call("GET", "/controls/audit")).body.entries.length, 1); // unauthenticated attempts changed nothing (seed only)
  for (let i = 0; i < 5; i++) await c.call("GET", "/controls", undefined, { key: "wrong-key-0123456789abcdefgh", client: "bad" });
  assert.equal((await c.call("GET", "/controls", undefined, { client: "bad" })).status, 429);
  const noKey = makeControls({ TOURS_ENVIRONMENT: "staging" });
  assert.equal((await noKey.call("GET", "/controls")).status, 503);
  assert.equal((await noKey.call("POST", "/controls/check", { kind: "new-payment", tourId: "belfast-city" })).status, 503);
  assert.equal((await noKey.call("GET", "/public-status", undefined, { key: null })).status, 200); // public status never needs the key
});

test("AC7: an unreadable or tampered state fails safe, never open", async () => {
  const c = makeControls();
  const { pause } = await c.pause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments" });
  assert.ok(pause.id);
  // tamper: change the stored controls without updating the hash
  const rec = await c.storage.get("c:00000002");
  rec.controls.pauses = [];
  await c.storage.put("c:00000002", rec);
  const pay = (await c.call("POST", "/controls/check", { kind: "new-payment", tourId: "giants-causeway", mandatory: GATES })).body.decision;
  assert.deepEqual([pay.allowed, pay.failSafe, pay.blockedBy], [false, true, ["controls-unreadable"]]);
  const enquiry = (await c.call("POST", "/controls/check", { kind: "enquiry", tourId: "giants-causeway" })).body.decision;
  assert.deepEqual([enquiry.allowed, enquiry.manualReview, enquiry.autoQuote, enquiry.reserveAvailability], [true, true, false, false]);
  const untouched = (await c.call("POST", "/controls/check", { kind: "refund", tourId: "giants-causeway" })).body.decision;
  assert.deepEqual([untouched.allowed, untouched.unaffected], [true, true]); // fail-safe never blocks existing bookings
  const status = (await c.call("GET", "/public-status", undefined, { key: null })).body;
  assert.equal(status.degraded, true);
  assert.ok(Object.values(status.tours).every((s) => s === "enquiry-only"));
  const write = await c.call("POST", "/controls/pause", { expectedVersion: 2, scope: { kind: "all" }, effect: "both", reason: REASON });
  assert.equal(write.status, 503); // no writes on top of an unreadable state
});

test("AC8: the public status endpoint leaks nothing and needs no key; owner routes are not public", async () => {
  const c = makeControls();
  await c.pause({ scope: { kind: "tour", tourId: "belfast-city" }, reason: "SECRET reason text" });
  const r = await c.call("GET", "/public-status", undefined, { key: null });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control"), /public, max-age=30/);
  assert.equal(r.headers.get("x-status-informational"), "true");
  assert.ok(!JSON.stringify(r.body).includes("SECRET"));
  assert.equal(r.body.tours["belfast-city"], "enquiry-only");
});

test("owner overrides, resumes and limits are audited, reasoned and persisted", async () => {
  const c = makeControls();
  const bad = await c.call("POST", "/controls/pause", { expectedVersion: 1, scope: { kind: "all" }, effect: "both", reason: "no" });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.some((e) => e.startsWith("reason")));
  const p = await c.pause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments" });
  const ov = await c.call("POST", "/controls/override", { expectedVersion: await c.version(), quoteId: "Q-1001", reason: "Customer already agreed", hours: 2 });
  assert.equal(ov.status, 200, JSON.stringify(ov.body));
  const check = async (quoteId) => (await c.call("POST", "/controls/check", { kind: "new-payment", tourId: "belfast-city", quoteId, mandatory: GATES })).body.decision;
  assert.equal((await check("Q-1001")).allowed, true);
  assert.equal((await check("Q-2002")).allowed, false);
  const rev = await c.call("POST", "/controls/override/revoke", { expectedVersion: await c.version(), overrideId: ov.body.override.id, reason: "Changed mind" });
  assert.equal(rev.status, 200);
  assert.equal((await check("Q-1001")).allowed, false);
  const lim = await c.call("POST", "/controls/limits", { expectedVersion: await c.version(), limits: { maxRangeDays: 200 }, reason: "Provisional change" });
  assert.equal(lim.status, 200);
  assert.equal((await c.call("GET", "/controls")).body.controls.limits.maxRangeDays, 200);
  const res = await c.call("POST", "/controls/resume", { expectedVersion: await c.version(), pauseId: p.pause.id, reason: "All done now" });
  assert.equal(res.status, 200);
  assert.equal((await check("Q-9999")).allowed, true);
  const actions = (await c.call("GET", "/controls/audit")).body.entries.map((e) => e.action);
  assert.deepEqual(actions, ["seed", "rejected", "pause", "override", "override-revoked", "limits", "resume"]);
});

test("D6: notification intents are queued atomically for dashboard and owner push; nothing is delivered in WP-B2", async () => {
  const c = makeControls();
  const p = await c.pause({ scope: { kind: "cruise", cruiseScope: "belfastOnly" }, reason: "SECRET detail" });
  await c.call("POST", "/controls/resume", { expectedVersion: await c.version(), pauseId: p.pause.id, reason: "Fixed" });
  const n = (await c.call("GET", "/controls/notifications")).body;
  assert.equal(n.delivery, "not-integrated");
  assert.deepEqual(n.entries.map((e) => e.event), ["pause-created", "pause-resumed"]);
  for (const e of n.entries) {
    assert.deepEqual(e.channels, ["dashboard", "push"]);
    assert.equal(e.delivered, false);
    assert.ok(!e.body.includes("SECRET")); // reasons stay in the owner audit, not in push text
  }
  for (const file of ["../src/controls.js", "../src/controls-do.js"]) assert.ok(!/fetch\(\s*["'`]https?:|api\.resend|pushover|web-push|sendEmail/i.test(readFileSync(new URL(file, import.meta.url), "utf8")), `${file} must not integrate delivery`);
});

test("ledger reservation pause is reserved, not implemented", () => {
  assert.equal(initialControls().ledgerReservationPause, null);
  const src = readFileSync(new URL("../src/controls-do.js", import.meta.url), "utf8") + readFileSync(new URL("../src/controls.js", import.meta.url), "utf8");
  assert.ok(!/ledger.*reserve.*\(|reserveLedger|ledger\.put/i.test(src.replace(/ledgerReservationPause/g, "")));
});

// ===== Worker routing =====
test("Worker routes: /status is public, controls need the owner key, nothing else is exposed, staging only", async () => {
  const storage = fakeStorage();
  const doInstance = new TourControlsDO({ storage }, { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging" });
  const env = (e = "staging") => ({ TOURS_ENVIRONMENT: e, TOURS_OWNER_KEY: KEY, TOUR_CONTROLS: { idFromName: () => "i", get: () => doInstance }, TOUR_SETTINGS: { idFromName: () => "s", get: () => ({ fetch: async () => new Response("{}") }) } });
  const req = (m, p, headers = {}, body) => new Request(`https://w.test${p}`, { method: m, headers, body });
  assert.equal((await worker.fetch(req("GET", "/status"), env())).status, 200);
  assert.equal((await worker.fetch(req("GET", "/status"), env("development"))).status, 503);
  assert.equal((await worker.fetch(req("GET", "/status"), env(null))).status, 503);
  assert.equal((await worker.fetch(req("GET", "/public-status"), env())).status, 404); // internal path is not routable
  assert.equal((await worker.fetch(req("POST", "/status"), env())).status, 404);
  assert.equal((await worker.fetch(req("GET", "/controls"), env())).status, 401);
  assert.equal((await worker.fetch(req("GET", "/controls", { authorization: `Bearer ${KEY}` }), env())).status, 200);
  assert.equal((await worker.fetch(req("DELETE", "/controls"), env())).status, 404);
  assert.equal((await worker.fetch(req("GET", "/controls/secret-admin"), env())).status, 404);
  assert.equal((await worker.fetch(req("GET", "/controls", { authorization: `Bearer ${KEY}` }), env("development"))).status, 503);
  // a caller cannot choose its own client id to dodge lockout
  for (let i = 0; i < 5; i++) await worker.fetch(req("GET", "/controls", { authorization: "Bearer wrong-key-0123456789abcdefgh", "x-client-id": `spoof${i}`, "cf-connecting-ip": "9.9.9.9" }), env());
  assert.equal((await worker.fetch(req("GET", "/controls", { authorization: `Bearer ${KEY}`, "cf-connecting-ip": "9.9.9.9" }), env())).status, 429);
  const post = await worker.fetch(req("POST", "/controls/check", { authorization: `Bearer ${KEY}`, "cf-connecting-ip": "1.1.1.1" }, JSON.stringify({ kind: "enquiry", tourId: "belfast-city" })), env());
  assert.equal(post.status, 200);
  assert.equal((await post.json()).decision.autoQuote, true);
});

// ===== Staging isolation =====
test("AC9: configuration stays staging-only (three own Durable Objects, no other bindings, no routes, no production)", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const production = readFileSync(new URL("../../addresses/wrangler.toml", import.meta.url), "utf8");
  assert.deepEqual(assertToursSettingsConfigIsStagingOnly({ config, productionWrangler: production }), []);
  assert.equal((config.match(/^\[\[durable_objects\.bindings\]\]/gm) || []).length, 3);
  assert.match(config, /tag = "v2"\nnew_sqlite_classes = \["TourControlsDO"\]/);
  const third = assertToursSettingsConfigIsStagingOnly({ config: config + '\n[[durable_objects.bindings]]\nname = "X"\nclass_name = "Y"\n', productionWrangler: production });
  assert.ok(third.some((p) => /exactly three/.test(p)));
  const prodOrigin = assertToursSettingsConfigIsStagingOnly({ config: config.replace(/TOURS_ALLOWED_ORIGINS = "[^"]*"/, 'TOURS_ALLOWED_ORIGINS = "https://www.myairporttaxini.co.uk"'), productionWrangler: production });
  assert.ok(prodOrigin.some((p) => /ALLOWED_ORIGINS/.test(p)));
  const kv = assertToursSettingsConfigIsStagingOnly({ config: config + '\n[[kv_namespaces]]\nbinding = "K"\nid = "' + "a".repeat(32) + '"\n', productionWrangler: production });
  assert.ok(kv.length > 0);
  assert.ok(!/availability|booking|payment|stripe|resend|push/i.test(config.replace(/^name\s*=.*$/m, "").replace(/^#.*$/gm, "")));
});

test("staging workflow exercises the controls end to end and stays staging-only", () => {
  const wf = readFileSync(new URL("../../../.github/workflows/deploy-tours-preview.yml", import.meta.url), "utf8");
  const job = wf.slice(wf.indexOf("  tours-settings:"), wf.indexOf("  stripe-sandbox:"));
  for (const label of ["Public status (no key)", "Controls need the owner key", "Create test pause", "Stale controls version", "Check payment while paused", "Check refund while paused", "Resume test pause", "Controls audit"]) assert.ok(job.includes(label), label);
  assert.match(job, /resumeAt/); // test pause cannot be left behind
  const docs = readFileSync(new URL("../../../docs/tours-controls.md", import.meta.url), "utf8");
  for (const needle of ["Europe/London", "366", "90", "failSafe", "notification intents", "ledgerReservationPause"]) assert.ok(docs.includes(needle), needle);
});

// ===== Pre-merge confirmations =====
test("CONFIRM 1a: an owner override can never lift a date or cruise pause", () => {
  const ctx = { tourId: "cruise-express", quoteId: "Q-1001", date: "2027-07-05" };
  for (const scope of [{ kind: "date", from: "2027-07-01", to: "2027-07-10" }, { kind: "cruise", cruiseScope: "belfastOnly" }, { kind: "cruise", cruiseScope: "all" }]) {
    let doc = withPause({ scope, effect: "payments" });
    doc = createOverride(doc, { quoteId: "Q-1001", reason: "Owner wants this one through" }, NOW, "ov").doc;
    const d = payOk(doc, ctx);
    assert.equal(d.allowed, false, JSON.stringify(scope));
    assert.equal(d.overrideId, null);
    assert.ok(d.blockedBy.some((b) => b.startsWith("pause:")));
  }
  // mixed: an overridable tour pause AND a date pause -> still blocked; only the tour pause -> allowed
  let mixed = withPause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments" });
  mixed = withPause({ scope: { kind: "date", from: "2027-07-01", to: "2027-07-10" }, effect: "payments" }, mixed);
  mixed = createOverride(mixed, { quoteId: "Q-1001", reason: "Owner wants this one through" }, NOW, "ov").doc;
  assert.equal(payOk(mixed, { tourId: "belfast-city", quoteId: "Q-1001", date: "2027-07-05" }).allowed, false);
  assert.equal(payOk(mixed, { tourId: "belfast-city", quoteId: "Q-1001", date: "2027-08-05" }).allowed, true); // outside the date range
  // global and single-tour pauses remain overridable (owner decision 1)
  for (const scope of [{ kind: "all" }, { kind: "tour", tourId: "belfast-city" }]) {
    let doc = withPause({ scope, effect: "payments" });
    doc = createOverride(doc, { quoteId: "Q-1001", reason: "Owner wants this one through" }, NOW, "ov").doc;
    assert.equal(payOk(doc, { tourId: "belfast-city", quoteId: "Q-1001" }).allowed, true);
  }
});

test("CONFIRM 1b: cruise safety requirements and authoritative availability are mandatory and cannot be overridden or auto-resumed", () => {
  let doc = withPause({ scope: { kind: "tour", tourId: "cruise-causeway" }, effect: "payments" });
  doc = createOverride(doc, { quoteId: "Q-3003", reason: "Owner wants this one through" }, NOW, "ov").doc;
  const base = { tourId: "cruise-causeway", quoteId: "Q-3003", mandatory: { ...GATES, cruiseRequirementsMet: true } };
  assert.equal(evaluatePayment(doc, base, NOW).allowed, true); // pause overridden, everything verified
  for (const flag of ["cruiseRequirementsMet", "availabilityConfirmed", "safetyApproved", "launchGatesPassed"]) {
    const d = evaluatePayment(doc, { ...base, mandatory: { ...base.mandatory, [flag]: false } }, NOW);
    assert.equal(d.allowed, false, flag);
    assert.ok(d.blockedBy.includes(`mandatory:${flag}`));
  }
  assert.equal(evaluatePayment(doc, { ...base, mandatory: GATES }, NOW).allowed, false); // cruise flag missing = blocked
  const open = evaluatePayment(initialControls(), { tourId: "cruise-express", mandatory: GATES }, NOW); // no pause at all, no cruise flag
  assert.ok(open.blockedBy.includes("mandatory:cruiseRequirementsMet") && !open.allowed);
  assert.equal(evaluatePayment(initialControls(), { tourId: "belfast-city", mandatory: GATES }, NOW).allowed, true); // non-cruise tours do not need it
  // auto-resume cannot satisfy them either
  const timed = withPause({ scope: { kind: "tour", tourId: "cruise-causeway" }, effect: "payments", resumeAt: new Date(NOW + 3600e3).toISOString() });
  assert.equal(evaluatePayment(timed, { tourId: "cruise-causeway", mandatory: { ...GATES, availabilityConfirmed: false, cruiseRequirementsMet: true } }, NOW + 7200e3).allowed, false);
});

test("CONFIRM 2: decisions are point-in-time and uncacheable; a pause created after an earlier answer changes the next answer", async () => {
  for (const d of [evaluateEnquiry(initialControls(), { tourId: "belfast-city" }, NOW), evaluatePayment(initialControls(), { tourId: "belfast-city", mandatory: GATES }, NOW), failSafeDecision("new-payment", NOW)]) {
    assert.equal(d.cacheable, false);
    assert.equal(d.recheckBeforeTransaction, true);
    assert.equal(d.decidedAt, new Date(NOW).toISOString());
  }
  const c = makeControls();
  const ask = async () => (await c.call("POST", "/controls/check", { kind: "new-payment", tourId: "belfast-city", mandatory: GATES })).body.decision;
  const before = await ask();
  assert.equal(before.allowed, true);
  await c.pause({ scope: { kind: "tour", tourId: "belfast-city" }, effect: "payments" });
  const after = await ask();
  assert.equal(after.allowed, false); // the earlier "allowed" must not be reused
  assert.ok(after.controlsVersion > before.controlsVersion);
  assert.match((await c.call("POST", "/controls/check", { kind: "new-payment", tourId: "belfast-city" })).headers.get("cache-control"), /no-store/);
  const pub = await c.call("GET", "/public-status", undefined, { key: null });
  assert.equal(pub.body.informational, true); // the cached public status is never a substitute for the check
});

test("CONFIRM 3: a global pause never touches pages, SEO, confirmed bookings or customer booking access", async () => {
  const c = makeControls();
  await c.pause({ scope: { kind: "all" }, effect: "both", reason: "Global emergency stop" });
  for (const kind of ["confirmed-booking", "customer-booking-access", "payment-in-progress", "stripe-webhook", "refund"]) {
    const d = (await c.call("POST", "/controls/check", { kind, tourId: "giants-causeway" })).body.decision;
    assert.deepEqual([d.allowed, d.unaffected], [true, true], kind);
  }
  const pub = (await c.call("GET", "/public-status", undefined, { key: null })).body;
  // the status vocabulary can only describe availability to buy; it has no "closed" / "removed" / "hidden" state
  assert.deepEqual([...new Set(Object.values(pub.tours))], ["enquiry-only"]);
  // the Worker serves no tour pages at all, so it cannot remove, redirect or noindex them
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8") + readFileSync(new URL("../src/controls-do.js", import.meta.url), "utf8");
  assert.ok(!/x-robots-tag|noindex|sitemap|robots\.txt|rel=.?canonical|status:\s*(301|302|307|308|410)|["'`]location["'`]/i.test(index), "controls must not touch SEO or redirect pages");
});

test("CONFIRM 4: the safeguards are documented as a contract for the later integration packages", () => {
  const docs = readFileSync(new URL("../../../docs/tours-controls.md", import.meta.url), "utf8");
  const section = docs.slice(docs.indexOf("## Contract for later integration packages")).replace(/\s+/g, " ");
  assert.ok(section.length > 500, "contract section missing");
  for (const needle of ["immediately before", "cacheable:false", "never rely on", "/status", "fail closed", "cruiseRequirementsMet", "availabilityConfirmed", "date and cruise pauses", "never overridable", "HTTP 200", "noindex", "customer-booking-access", "reservation"]) assert.ok(section.toLowerCase().includes(needle.toLowerCase()), `contract is missing: ${needle}`);
});
