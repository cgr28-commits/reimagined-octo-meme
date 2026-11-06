/**
 * Find Your Driver — rules, Worker routes and Durable Object, offline.
 * Runs the real handler + DriverLocator class against in-memory fakes of
 * KV, Durable Object namespace/storage and a controllable clock.
 *
 * Run: npx tsx scripts/check-driver-locator.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/* ---------------- controllable clock ---------------- */
const RealDate = Date;
const originalConsoleError = console.error;
let clock = RealDate.now();
class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(clock);
    else super(...(args as [string]));
  }
  static now() {
    return clock;
  }
}
(globalThis as unknown as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor;
const advance = (ms: number) => {
  clock += ms;
};

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
let passed = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`OK  ${label}`);
};

async function main() {
  const L = await import("../shared/driver-locator");
  const W = await import("../workers/addresses/src/driver-locator");
  const { OPERATING_BASE } = await import("../workers/addresses/src/operating-base");

  /* ---------------- helpers ---------------- */
  const londonLocal = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new RealDate(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  };

  class FakeKV {
    map = new Map<string, string>();
    puts = 0;
    async get(key: string, type?: string) {
      const v = this.map.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    }
    async put(key: string, value: string) {
      this.puts += 1;
      this.map.set(key, value);
    }
    async delete(key: string) {
      this.map.delete(key);
    }
    async list() {
      return { keys: [], list_complete: true };
    }
  }

  type Stored = Map<string, unknown>;
  const objects = new Map<string, { instance: InstanceType<typeof W.DriverLocator>; storage: Stored; alarm: number | null; rowsWritten: number }>();

  function makeState(entry: { storage: Stored; alarm: number | null; rowsWritten: number }) {
    return {
      blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
      storage: {
        get: async <T>(k: string) => structuredClone(entry.storage.get(k)) as T | undefined,
        put: async (k: string, v: unknown) => {
          entry.rowsWritten += 1;
          entry.storage.set(k, structuredClone(v));
        },
        delete: async (k: string) => {
          entry.rowsWritten += 1;
          return entry.storage.delete(k);
        },
        deleteAll: async () => {
          entry.storage.clear();
          entry.alarm = null;
        },
        getAlarm: async () => entry.alarm,
        setAlarm: async (t: number) => {
          entry.rowsWritten += 1;
          entry.alarm = t;
        },
      },
    };
  }

  let failObjects = false;
  const kv = new FakeKV();
  const ns = {
    idFromName(name: string) {
      const hex = createHash("sha256").update(`ns:${name}`).digest("hex");
      return { toString: () => hex, name };
    },
    idFromString(hex: string) {
      if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("Invalid id");
      return { toString: () => hex };
    },
    get(id: { toString(): string }) {
      const key = id.toString();
      return {
        id,
        fetch: async (_url: string, init: { body: string }) => {
          if (failObjects) throw new Error("Durable Object request limit exceeded");
          let entry = objects.get(key);
          if (!entry) {
            const shell = { storage: new Map(), alarm: null as number | null, rowsWritten: 0 };
            const instance = new W.DriverLocator(makeState(shell) as never, { TRACKING_STORE: kv as never });
            entry = { ...shell, instance };
            objects.set(key, entry);
            // keep the shell and entry in sync
            Object.defineProperty(entry, "storage", { get: () => shell.storage });
            Object.defineProperty(entry, "alarm", { get: () => shell.alarm, set: (v) => (shell.alarm = v) });
            Object.defineProperty(entry, "rowsWritten", { get: () => shell.rowsWritten });
          }
          return entry.instance.fetch(new Request("https://driver-locator/op", { method: "POST", body: init.body }));
        },
      };
    },
  };

  const OWNER = "owner-key-123";
  const DRIVER = "driver-key-456";
  const env = {
    TRACKING_STORE: kv,
    DRIVER_LOCATOR: ns,
    DRIVER_LOCATOR_MODE: "on",
    OWNER_ACCESS_KEY: OWNER,
    DRIVER_ACCESS_KEY: DRIVER,
    DRIVER_NAME: "Sean Murphy",
  } as Record<string, unknown>;

  const tokenFor = (n: number) => n.toString(16).padStart(32, "a");
  function job(n: number, patch: Record<string, unknown> = {}) {
    const record = {
      token: tokenFor(n),
      createdAt: new RealDate(clock).toISOString(),
      customerName: "Aoife Gallagher",
      customerMobile: "07700900123",
      customerEmail: "aoife@example.com",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 Secret Street, Lisburn",
      tripDate: "",
      tripTime: "",
      pickupAt: londonLocal(clock + 30 * 60_000),
      sharingActive: false,
      isAirportTrip: true,
      isFromAirport: true,
      airportCode: "BFS",
      assignedDriverName: "Sean Murphy",
      assignmentStatus: "accepted",
      paymentReference: undefined,
      ...patch,
    };
    kv.map.set(`track:job:${record.token}`, JSON.stringify(record));
    return record;
  }

  const SITE = "https://www.myairporttaxini.co.uk";
  async function call(route: string, body: Record<string, unknown>, key?: string, extraEnv: Record<string, unknown> = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers[key.startsWith("dps_") ? "X-Driver-Session" : "X-Driver-Key"] = key;
    const response = await W.handleLocatorRequest(
      route,
      new Request(`https://w.example/locator/${route}`, { method: "POST", headers, body: JSON.stringify(body) }),
      { ...env, ...extraEnv } as never,
      SITE,
      SITE,
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, headers: response.headers };
  }

  const BFS = L.LOCATOR_AIRPORTS.BFS;
  const nearBFS = { lat: BFS.lat + 0.001, lng: BFS.lng + 0.001, accuracy: 12 };

  const logs: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  /* ================================================================ */
  console.log("=== 1. Pure rules ===");
  {
    const pickup = londonLocal(clock + 2 * 60 * 60_000);
    assert.equal(L.locatorWindow(pickup).state, "too_early", "no sharing before the collection window");
    assert.equal(L.locatorWindow(londonLocal(clock + 30 * 60_000)).state, "open");
    assert.equal(L.locatorWindow(londonLocal(clock - 4 * 60 * 60_000)).state, "closed", "no sharing after window");
    assert.equal(L.locatorWindow("not a date").state, "invalid");

    assert.equal(L.validateFix({ lat: 91, lng: 0, accuracy: 5 }).ok, false);
    assert.equal(L.validateFix({ lat: 54, lng: -6, accuracy: 0 }).ok, false, "accuracy required");
    assert.equal(L.validateFix({ lat: 54, lng: -6, accuracy: 5000 }).ok, false, "very poor GPS rejected");
    assert.equal(L.validateFix({ lat: 54, lng: -6, accuracy: 5, at: clock - 10 * 60_000 }).ok, false, "old fixes rejected");
    const v = L.validateFix({ lat: 54.123456789, lng: -6.987654321, accuracy: 7.6 });
    assert.ok(v.ok && v.fix.lat === 54.12346 && v.fix.accuracy === 8 && v.fix.at === clock, "rounded, server time");

    const a = { lat: 54, lng: -6, accuracy: 10, at: 0 };
    assert.equal(L.shouldSendFix(null, a), true);
    assert.equal(L.shouldSendFix(a, { ...a, at: 10_000, lat: 54.01 }), false, "never more often than 15 s");
    assert.equal(L.shouldSendFix(a, { ...a, at: 16_000 }), false, "stationary: wait for heartbeat");
    assert.equal(L.shouldSendFix(a, { ...a, at: 16_000, lat: 54.001 }), true, "moved ≥ 20 m");
    assert.equal(L.shouldSendFix(a, { ...a, at: 30_000 }), true, "30 s heartbeat");

    assert.equal(L.accuracyBand(10), "good");
    assert.equal(L.accuracyBand(100), "approximate");
    assert.equal(L.accuracyBand(400), "poor");

    assert.equal(L.parseLinkFragment("#" + "a".repeat(64) + "." + "B".repeat(43))?.objectId, "a".repeat(64));
    assert.equal(L.parseLinkFragment("a".repeat(64) + ".short"), null);
    assert.equal(L.parseLinkFragment("../../etc"), null);
    const secret = L.generateLinkSecret();
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/, "256-bit base64url secret");
    assert.notEqual(secret, L.generateLinkSecret());
    assert.equal(L.timingSafeEqualHex("ab", "ab"), true);
    assert.equal(L.timingSafeEqualHex("ab", "ac"), false);

    assert.equal(L.customerDriverDisplayName("Sean Murphy", true), "Sean", "first name only");
    assert.equal(L.customerDriverDisplayName("Sean Murphy", false), "Your driver");
    assert.equal(L.customerDriverDisplayName("", true), "Your driver");
    assert.equal(L.sanitizeMeetingNote("<b>By Costa</b>\n" + "x".repeat(400)).length, 240);
    assert.doesNotMatch(L.sanitizeMeetingNote("<script>"), /[<>]/);
    ok("window, GPS validation, throttling, accuracy bands, link format, display name");
  }

  console.log("\n=== 2. Link strip script runs before analytics ===");
  {
    const store = new Map<string, string>();
    let replaced = "";
    const fragment = "c".repeat(64) + "." + "D".repeat(43);
    const sandbox = {
      location: { pathname: "/find-your-driver/", hash: `#${fragment}` },
      history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => (replaced = url) },
      sessionStorage: { setItem: (k: string, v: string) => store.set(k, v) },
    };
    vm.runInNewContext(L.FIND_DRIVER_LINK_STRIP_SCRIPT, sandbox);
    assert.equal(replaced, "/find-your-driver/", "fragment removed from the address bar");
    assert.equal(store.get(L.LOCATOR_FRAGMENT_STORAGE_KEY), fragment, "kept for this tab only");
    const other = { ...sandbox, location: { pathname: "/", hash: `#${fragment}` } };
    replaced = "";
    vm.runInNewContext(L.FIND_DRIVER_LINK_STRIP_SCRIPT, other);
    assert.equal(replaced, "", "other pages untouched");
    const layout = read("src/app/layout.tsx");
    assert.ok(
      layout.indexOf("strip-find-driver-link") < layout.indexOf("<GoogleAdsTag"),
      "strip script is placed before the Google tag",
    );
    assert.match(layout, /id="strip-find-driver-link" strategy="beforeInteractive"/);
    ok("link moves from URL to sessionStorage before Google tag; only on /find-your-driver");
  }

  console.log("\n=== 3. Switched off by default ===");
  {
    job(1);
    for (const route of ["driver/status", "driver/start", "driver/position", "driver/stop", "owner/link", "view"]) {
      const res = await call(route, { jobToken: tokenFor(1) }, OWNER, { DRIVER_LOCATOR_MODE: undefined });
      assert.equal(res.status, 404, `${route} hidden when mode unset`);
    }
    const noBinding = await call("driver/status", {}, OWNER, { DRIVER_LOCATOR: undefined });
    assert.equal(noBinding.status, 404, "hidden without the Durable Object binding");
    assert.equal(W.parseLocatorRoute("/track/abc"), null, "never handles retired /track routes");
    assert.equal(W.parseLocatorRoute("/locator/view"), "view");
    assert.equal(W.parseLocatorRoute("/api/locator/driver/start/"), "driver/start");
    assert.equal(W.parseLocatorRoute("/locator/secret"), null);
    ok("every route 404s unless DRIVER_LOCATOR_MODE is set; /track untouched");
  }

  console.log("\n=== 4. Authorisation and eligibility (server-side) ===");
  {
    job(2);
    assert.equal((await call("driver/start", { jobToken: tokenFor(2) })).status, 401, "no key");
    assert.equal((await call("driver/start", { jobToken: tokenFor(2) }, "wrong-key")).status, 401, "wrong key");
    const testMode = await call("driver/start", { jobToken: tokenFor(2) }, DRIVER, { DRIVER_LOCATOR_MODE: "owner-test" });
    assert.equal(testMode.status, 403, "owner-test mode blocks drivers");

    job(3, { assignedDriverName: "Someone Else" });
    const notMine = await call("driver/start", { jobToken: tokenFor(3) }, DRIVER);
    assert.equal(notMine.status, 403, "driver not assigned");
    job(4, { assignmentStatus: "pending" });
    assert.equal((await call("driver/start", { jobToken: tokenFor(4) }, DRIVER)).status, 403, "pending assignment");

    // Saved-driver portal session for another driver.
    kv.map.set(
      "driver-portal-session:dps_" + "1".repeat(48),
      JSON.stringify({ profileKey: "other", driverName: "Other Driver", expiresAt: new RealDate(clock + 864e5).toISOString() }),
    );
    assert.equal((await call("driver/start", { jobToken: tokenFor(2) }, "dps_" + "1".repeat(48))).status, 403, "other portal driver");
    const expiredSession = "dps_" + "2".repeat(48);
    kv.map.set(
      `driver-portal-session:${expiredSession}`,
      JSON.stringify({ profileKey: "sean", driverName: "Sean Murphy", expiresAt: new RealDate(clock - 1000).toISOString() }),
    );
    assert.equal((await call("driver/start", { jobToken: tokenFor(2) }, expiredSession)).status, 401, "expired portal session");

    job(5, { isFromAirport: false, pickupLabel: "Lisburn" });
    assert.equal((await call("driver/start", { jobToken: tokenFor(5) }, OWNER)).body.code, "not_airport");
    job(6, { airportCode: "LDY" });
    assert.equal((await call("driver/start", { jobToken: tokenFor(6) }, OWNER)).body.code, "not_airport", "BFS/BHD/DUB only");
    job(7, { refundedAt: new RealDate(clock).toISOString() });
    assert.equal((await call("driver/start", { jobToken: tokenFor(7) }, OWNER)).status, 410, "cancelled booking");
    job(8, { pickupAt: londonLocal(clock + 3 * 60 * 60_000) });
    const early = await call("driver/start", { jobToken: tokenFor(8) }, OWNER);
    assert.equal(early.body.code, "too_early", "before collection window");
    job(9, { pickupAt: londonLocal(clock - 4 * 60 * 60_000) });
    assert.equal((await call("driver/start", { jobToken: tokenFor(9) }, OWNER)).body.code, "closed", "after window");
    job(10, { journeyStatus: "completed" });
    assert.equal((await call("driver/start", { jobToken: tokenFor(10) }, OWNER)).body.code, "collected", "after collection");
    assert.equal((await call("driver/start", { jobToken: "../../x" }, OWNER)).status, 400);
    assert.equal((await call("driver/start", { jobToken: tokenFor(999) }, OWNER)).status, 404);

    const driverLink = await call("owner/link", { jobToken: tokenFor(2) }, DRIVER);
    assert.equal(driverLink.status, 403, "drivers cannot create customer links");
    const probeDriverTest = await call("driver/status", {}, DRIVER, { DRIVER_LOCATOR_MODE: "owner-test" });
    assert.equal(probeDriverTest.body.enabled, false, "controls hidden for drivers in owner-test");
    ok("keys, portal sessions, assignment, airport, cancellation, window and collection all enforced server-side");
  }

  console.log("\n=== 5. Sharing: latest position only, no KV writes, home privacy ===");
  let customerLink = "";
  {
    const putsBefore = kv.puts;
    const j = job(20);
    const start = await call("driver/start", { jobToken: j.token }, DRIVER);
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.equal(start.headers.get("Cache-Control"), "no-store");
    assert.equal(start.headers.get("X-Robots-Tag"), "noindex, nofollow");

    const p1 = await call("driver/position", { jobToken: j.token, ...nearBFS }, DRIVER);
    assert.equal(p1.body.stored, true);
    advance(3_000);
    const p2 = await call("driver/position", { jobToken: j.token, ...nearBFS, lat: nearBFS.lat + 0.0005 }, DRIVER);
    assert.equal(p2.body.stored, false, "server ignores uploads < 8 s apart (no write)");
    advance(9_000);
    await call("driver/position", { jobToken: j.token, ...nearBFS, lat: nearBFS.lat + 0.002 }, DRIVER);

    const entry = objects.get(ns.idFromName(`job:${j.token}`).toString())!;
    assert.deepEqual([...entry.storage.keys()].sort(), ["meta", "pos"], "only meta + latest pos stored");
    assert.equal((entry.storage.get("pos") as { lat: number }).lat, Math.round((nearBFS.lat + 0.002) * 1e5) / 1e5, "overwritten, not appended");
    assert.ok(entry.alarm && entry.alarm > clock, "cleanup alarm set for window close");

    // Home privacy zone: never stored.
    advance(9_000);
    const home = await call("driver/position", { jobToken: j.token, lat: OPERATING_BASE.lat + 0.005, lng: OPERATING_BASE.lng, accuracy: 20 }, DRIVER);
    assert.equal(home.body.withheld, true, "position near home base withheld");
    assert.notEqual((entry.storage.get("pos") as { lat: number }).lat, OPERATING_BASE.lat + 0.005);
    assert.ok(!JSON.stringify([...entry.storage.values()]).includes(String(OPERATING_BASE.lat).slice(0, 6)), "home coords never stored");

    // Upload rate ceiling (in memory, no writes).
    let limited = 0;
    for (let i = 0; i < 15; i += 1) {
      const r = await call("driver/position", { jobToken: j.token, ...nearBFS }, DRIVER);
      if (r.status === 429) limited += 1;
    }
    assert.ok(limited > 0, "upload rate limit applies");

    assert.equal(kv.puts, putsBefore, "zero KV writes for start + positions");

    // Bad input.
    advance(61_000);
    assert.equal((await call("driver/position", { jobToken: j.token, lat: "x", lng: 1, accuracy: 5 }, DRIVER)).status, 400);

    // Owner creates the customer link.
    const link = await call("owner/link", { jobToken: j.token, meetingNote: "Beside the Costa <b>" }, OWNER);
    assert.equal(link.status, 200);
    customerLink = String(link.body.fragment);
    assert.match(String(link.body.url), /^https:\/\/www\.myairporttaxini\.co\.uk\/find-your-driver\/#[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/);
    assert.ok(!String(link.body.url).includes(j.token), "link never contains the booking token");
    const stored = entry.storage.get("meta") as Record<string, unknown>;
    assert.ok(!JSON.stringify(stored).includes(customerLink.split(".")[1]), "secret stored only as a hash");
    assert.equal(kv.puts, putsBefore, "link creation writes no KV");
    ok("opt-in start, latest-only overwrite, 8 s server throttle, rate limit, home zone withheld, 0 KV writes");
  }

  console.log("\n=== 6. Customer view: data minimisation, isolation, staleness ===");
  {
    advance(2_000);
    await call("driver/position", { jobToken: tokenFor(20), ...nearBFS }, DRIVER);
    const view = await call("view", { link: customerLink });
    assert.equal(view.status, 200);
    assert.equal(view.body.status, "sharing");
    assert.equal(view.body.driverName, "Sean");
    assert.deepEqual(
      Object.keys(view.body).sort(),
      ["airport", "driverName", "expiresAt", "meetingInstruction", "meetingMapImage", "meetingNote", "ok", "pollAfterMs", "position", "status"],
      "only the customer view fields",
    );
    const text = JSON.stringify(view.body);
    for (const secret of [tokenFor(20), "Aoife", "07700900123", "aoife@example.com", "Secret Street", "Murphy"]) {
      assert.ok(!text.includes(secret), `view must not expose ${secret}`);
    }
    assert.equal(view.body.meetingNote, "Beside the Costa b", "owner note sanitised");
    assert.ok((view.body.position as { accuracyM: number }).accuracyM === 12);

    // Wrong secret, other booking's object with this secret, junk.
    const [objectId, secret] = customerLink.split(".");
    const wrong = await call("view", { link: `${objectId}.${"A".repeat(43)}` });
    assert.equal(wrong.status, 404, "wrong secret");
    job(21);
    await call("driver/start", { jobToken: tokenFor(21) }, OWNER);
    const other = await call("owner/link", { jobToken: tokenFor(21) }, OWNER);
    const otherId = String(other.body.fragment).split(".")[0];
    assert.equal((await call("view", { link: `${otherId}.${secret}` })).status, 404, "secret can't open another booking");
    assert.equal((await call("view", { link: "nonsense" })).status, 404);
    assert.equal(wrong.body.error, (await call("view", { link: "nonsense" })).body.error, "same answer for every failure");

    // Stale: no updates for > 75 s → last known, clearly marked.
    advance(80_000);
    const stale = await call("view", { link: customerLink });
    assert.equal(stale.body.status, "stale");
    assert.equal((stale.body.position as { lastKnown: boolean }).lastKnown, true);
    assert.ok((stale.body.position as { ageSeconds: number }).ageSeconds >= 80, "age shown, nothing fabricated");

    // Poor accuracy near airport → hidden, meeting point fallback.
    await call("driver/position", { jobToken: tokenFor(20), ...nearBFS, accuracy: 900 }, DRIVER);
    const poor = await call("view", { link: customerLink });
    assert.equal(poor.body.status, "unavailable");
    assert.equal(poor.body.position, null, "poor GPS not shown on map");

    // Far from the airport → on the way, no position.
    advance(9_000);
    await call("driver/position", { jobToken: tokenFor(20), lat: 54.597, lng: -5.93, accuracy: 10 }, DRIVER);
    const far = await call("view", { link: customerLink });
    assert.equal(far.body.status, "on_the_way");
    assert.equal(far.body.position, null, "no driver position away from the airport");

    // View rate limit.
    let limited = 0;
    for (let i = 0; i < 40; i += 1) if ((await call("view", { link: customerLink })).status === 429) limited += 1;
    assert.ok(limited > 0, "customer view rate limit");
    advance(61_000);

    // Revoke → link dead; new link replaces old.
    await call("owner/link", { jobToken: tokenFor(20), action: "revoke" }, OWNER);
    assert.equal((await call("view", { link: customerLink })).status, 404, "revoked link");
    const again = await call("owner/link", { jobToken: tokenFor(20) }, OWNER);
    const replacement = String(again.body.fragment);
    assert.equal((await call("view", { link: customerLink })).status, 404, "old link stays dead");
    assert.equal((await call("view", { link: replacement })).status, 200);
    customerLink = replacement;
    ok("minimal view, no booking data, wrong/foreign/junk links 404 alike, stale marked, poor GPS hidden, revocable");
  }

  console.log("\n=== 7. Auto-stop: collection, cancellation, expiry; cleanup ===");
  {
    // Collected by the driver.
    advance(9_000);
    await call("driver/position", { jobToken: tokenFor(20), ...nearBFS }, DRIVER);
    await call("driver/stop", { jobToken: tokenFor(20), reason: "collected" }, DRIVER);
    const entry = objects.get(ns.idFromName(`job:${tokenFor(20)}`).toString())!;
    assert.equal(entry.storage.has("pos"), false, "position deleted on collection");
    const collected = await call("view", { link: customerLink });
    assert.equal(collected.body.status, "collected");
    assert.equal(collected.body.position, null);
    advance(9_000);
    assert.equal((await call("driver/start", { jobToken: tokenFor(20) }, DRIVER)).status, 409, "can't restart after collection");

    // Cancellation noticed by the locator itself (recheck every 5 min).
    const j = job(30);
    await call("driver/start", { jobToken: j.token }, OWNER);
    await call("driver/position", { jobToken: j.token, ...nearBFS }, OWNER);
    const link = String((await call("owner/link", { jobToken: j.token }, OWNER)).body.fragment);
    kv.map.set(`track:job:${j.token}`, JSON.stringify({ ...j, refundedAt: new RealDate(clock).toISOString() }));
    advance(5 * 60_000 + 1);
    const cancelled = await call("view", { link });
    assert.equal(cancelled.body.status, "cancelled", "cancellation stops sharing");
    assert.equal(objects.get(ns.idFromName(`job:${j.token}`).toString())!.storage.has("pos"), false);

    // Collection marked elsewhere (journey status) is also noticed.
    const k = job(31);
    await call("driver/start", { jobToken: k.token }, OWNER);
    const kLink = String((await call("owner/link", { jobToken: k.token }, OWNER)).body.fragment);
    kv.map.set(`track:job:${k.token}`, JSON.stringify({ ...k, journeyStatus: "en_route" }));
    advance(5 * 60_000 + 1);
    assert.equal((await call("view", { link: kLink })).body.status, "collected");

    // Expiry: window closes → expired, then the alarm deletes everything.
    const e = job(32);
    await call("driver/start", { jobToken: e.token }, OWNER);
    const eLink = String((await call("owner/link", { jobToken: e.token }, OWNER)).body.fragment);
    const eEntry = objects.get(ns.idFromName(`job:${e.token}`).toString())!;
    advance(4 * 60 * 60_000);
    assert.equal((await call("view", { link: eLink })).status, 404, "expired link no longer opens");
    await eEntry.instance.alarm();
    assert.equal(eEntry.storage.size, 0, "alarm deletes all stored data");
    const after = await call("driver/position", { jobToken: e.token, ...nearBFS }, OWNER);
    assert.equal(after.status, 409, "no sharing after the window");
    ok("stops on collection (driver or journey), cancellation and expiry; alarm wipes storage");
  }

  console.log("\n=== 8. Limits and failure behaviour ===");
  {
    const j = job(40, { pickupAt: londonLocal(clock + 10 * 60_000) });
    failObjects = true;
    const res = await call("driver/start", { jobToken: j.token }, OWNER);
    assert.equal(res.status, 503);
    assert.equal(res.body.retryable, true);
    assert.doesNotMatch(JSON.stringify(res.body), /limit exceeded|Durable/i, "no internal details");
    const view = await call("view", { link: "a".repeat(64) + "." + "b".repeat(43) });
    assert.equal(view.status, 503, "customer page falls back to meeting point");
    failObjects = false;
    for (const line of logs) {
      assert.doesNotMatch(line, /[0-9a-f]{32}|[A-Za-z0-9_-]{43}|54\.\d{3}/, "logs carry no tokens, secrets or coordinates");
    }
    ok("Durable Object failure/limit → 503 retryable, generic text, clean logs");
  }

  console.log("\n=== 9. Isolation from the retired tracking system ===");
  {
    const src = read("workers/addresses/src/driver-locator.ts");
    for (const banned of [
      "saveTrackingJob",
      "appendDriverLocationHistory",
      "driverHistoryKey",
      "buildPublicTrackUrl",
      "publicTrackPayload",
      "TRACKING_STORE.put",
      ".put(`track",
      "sharingActive =",
      "console.log",
    ]) {
      assert.ok(!src.includes(banned), `locator must not use ${banned}`);
    }
    const shared = read("shared/tracking.ts");
    assert.match(shared, /DEFAULT_GPS_HISTORY_TTL_SECONDS = 60 \* 60 \* 24 \* 400/, "old retention not migrated or changed here");
    const data = read("src/lib/data.ts");
    assert.match(data, /liveDriverTracking: false/, "retired customer tracking stays off");
    const index = read("workers/addresses/src/index.ts");
    assert.ok(index.indexOf("parseLocatorRoute(url.pathname)") < index.indexOf("parseTrackSubRoute(url.pathname)"));
    const toml = read("workers/addresses/wrangler.toml");
    assert.match(toml, /tag = "v5-driver-locator"\nnew_sqlite_classes = \["DriverLocator"\]/, "SQLite-backed (Free-plan compatible)");
    assert.doesNotMatch(toml, /^\s*DRIVER_LOCATOR_MODE\s*=/m, "production config leaves it off");
    ok("no KV writes, no history, no /track reuse; old flag stays off; prod config leaves locator off");
  }

  console.error = realError;
  console.log(`\nAll ${passed} Find Your Driver checks passed.`);
}

main().catch((error) => {
  originalConsoleError(error);
  process.exit(1);
});
