/**
 * Find Your Driver — real-browser checks (Chromium via Playwright).
 *
 * Driver (iPhone viewport): Start sharing + Name Board on the same page with GPS
 * continuing while the board is displayed; permission denial; poor accuracy;
 * locked-phone / network interruption → stale → resume; server-ended session.
 *
 * Customer (iPhone portrait/landscape): link moved out of the URL, only sent in
 * a POST body; status copy for sharing / stale / poor / waiting / collected /
 * invalid / outage; accuracy and age shown; meeting-point fallback; privacy
 * notice; OpenStreetMap attribution + origin-only referrer (with real Leaflet).
 *
 * Worker responses are mocked with Playwright routes (the Worker itself is
 * covered by scripts/check-driver-locator.ts). Prints SKIP when Playwright or
 * esbuild is unavailable. Screenshots: test-results/find-your-driver/
 *
 * Run: npx tsx scripts/check-driver-locator-browser.ts
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const require = createRequire(join(root, "package.json"));
const shots = join(root, "test-results", "find-your-driver");

function tryRequire<T>(names: (string | undefined)[]): T | null {
  for (const name of names) {
    if (!name) continue;
    try {
      return require(name) as T;
    } catch {
      // next
    }
  }
  return null;
}
type Esbuild = typeof import("esbuild");
type Playwright = typeof import("playwright");
const esbuild = tryRequire<Esbuild>(["esbuild", process.env.ESBUILD_PATH]);
const playwright = tryRequire<Playwright>(["playwright", process.env.PLAYWRIGHT_PATH]);
if (!esbuild || !playwright) {
  console.log(`SKIP  Find Your Driver browser checks — ${!playwright ? "playwright" : "esbuild"} not installed.`);
  process.exit(0);
}
let realLeaflet = false;
try {
  require.resolve("leaflet");
  realLeaflet = true;
} catch {
  realLeaflet = false;
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const BFS = { lat: 54.6575, lng: -6.2158 };
const LINK = "e".repeat(64) + "." + "F".repeat(43);
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function bundle(outDir: string) {
  const harness = join(root, "scripts/locator-harness");
  const alias: Record<string, string> = { "next/dynamic": join(harness, "next-dynamic-shim.tsx") };
  if (!realLeaflet) {
    alias.leaflet = join(harness, "leaflet-stub.ts");
    alias["leaflet/dist/leaflet.css"] = join(harness, "leaflet-stub.css");
  }
  await esbuild!.build({
    entryPoints: { driver: join(harness, "driver.tsx"), customer: join(harness, "customer.tsx") },
    bundle: true,
    outdir: outDir,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    alias,
    loader: { ".png": "file" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_BOOKINGS_API_URL": '"https://worker.test/bookings"',
      "process.env.NEXT_PUBLIC_MAP_TILE_URL": '""',
    },
    nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(":") : [],
    logLevel: "silent",
  });
  const page = (name: string, title: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="strict-origin"><title>${title}</title>
<link rel="stylesheet" href="/${name}.css">
<style>html,body{margin:0;background:#071c38;color:#fff;font-family:system-ui,sans-serif}
.min-h-screen{min-height:100vh}.mx-auto{margin:0 auto}.max-w-xl{max-width:36rem}.px-4{padding:0 1rem}.mt-4,.mt-5,.mt-6{margin-top:1rem}.p-4{padding:1rem}.rounded-2xl{border-radius:1rem}.border{border:1px solid rgba(255,255,255,.12)}.text-emerald{color:#2fbf4a}.font-bold{font-weight:700}.text-2xl{font-size:1.5rem}.grid{display:grid}.gap-2{gap:.5rem}.bg-emerald{background:#2fbf4a;color:#071c38}.min-h-12{min-height:3rem}.inline-flex{display:inline-flex;align-items:center;justify-content:center}.rounded-xl{border-radius:.75rem}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.w-full{width:100%}a{color:inherit}.flex{display:flex}.items-center{align-items:center}.gap-3{gap:.75rem}.border-b-2{border-bottom:2px solid #2fbf4a}.pb-3{padding-bottom:.75rem}.text-amber-200{color:#fde68a}.mt-1,.mt-2,.mt-3{margin-top:.5rem}.flex-wrap{flex-wrap:wrap}.min-h-11{min-height:2.75rem}.px-4{padding-left:1rem;padding-right:1rem}button{font:inherit;color:inherit;background:transparent;border:1px solid rgba(255,255,255,.25);border-radius:12px}button.bg-emerald{color:#071c38;border:0}</style>
</head><body><div id="root"></div><script type="module" src="/${name}.js"></script></body></html>`;
  writeFileSync(join(outDir, "driver.html"), page("driver", "Owner dashboard | My Airport Taxi NI"));
  mkdirSync(join(outDir, "find-your-driver"), { recursive: true });
  writeFileSync(join(outDir, "find-your-driver", "index.html"), page("customer", "Find Your Driver | My Airport Taxi NI"));
}

function serve(outDir: string): Promise<{ server: Server; origin: string }> {
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const rel = path.endsWith("/") ? `${path}index.html` : path;
    const file = [join(outDir, normalize(rel)), join(root, "public", normalize(rel))].find((c) => existsSync(c) && !c.endsWith("/"));
    if (!file) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      resolve({ server, origin: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}` });
    }),
  );
}

async function launch() {
  const executablePath = process.env.NAME_BOARD_CHROME || process.env.LOCATOR_CHROME;
  if (executablePath) return playwright!.chromium.launch({ executablePath });
  try {
    return await playwright!.chromium.launch();
  } catch {
    return playwright!.chromium.launch({ channel: "chrome" });
  }
}

let passed = 0;
const ok = (label: string) => {
  passed += 1;
  console.log(`OK  ${label}`);
};

type Req = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

async function main() {
  const outDir = mkdtempSync(join(tmpdir(), "locator-"));
  mkdirSync(shots, { recursive: true });
  await bundle(outDir);
  const { server, origin } = await serve(outDir);
  const raw = await launch();
  const newContext = async (options: Parameters<typeof raw.newContext>[0]) => {
    const ctx = await raw.newContext(options);
    await ctx.addInitScript("window.__name = window.__name || ((fn) => fn);");
    // Never hit the real OpenStreetMap servers from tests: serve a blank tile, record headers.
    await ctx.route(/tile\.openstreetmap\.org/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX, headers: { "Cache-Control": "max-age=604800" } }),
    );
    return ctx;
  };

  try {
    /* ================= DRIVER ================= */
    console.log("=== 1. Combined Name Board + live sharing on one page ===");
    {
      const ctx = await newContext({
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
        geolocation: { latitude: BFS.lat + 0.001, longitude: BFS.lng, accuracy: 12 },
        permissions: ["geolocation"],
      });
      const page = await ctx.newPage();
      await page.clock.install();
      const calls: Req[] = [];
      let failPositions = false;
      await page.route("https://worker.test/locator/**", async (route) => {
        const req = route.request();
        const body = JSON.parse(req.postData() || "{}");
        const path = new URL(req.url()).pathname.replace("/locator/", "");
        calls.push({ url: req.url(), body, headers: req.headers() });
        if (path === "driver/position" && failPositions) return route.abort("internetdisconnected");
        const reply: Record<string, unknown> =
          path === "driver/status" ? { ok: true, enabled: true, mode: "on", role: "driver" }
          : path === "driver/start" ? { ok: true, phase: "sharing", closesAt: new Date(Date.now() + 3 * 3600e3).toISOString() }
          : path === "driver/position" ? { ok: true, stored: true }
          : { ok: true, phase: "paused" };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply), headers: { "Access-Control-Allow-Origin": "*" } });
      });
      await page.goto(`${origin}/driver.html?role=driver`);
      await page.getByTestId("locator-controls").waitFor();
      assert.match((await page.getByTestId("locator-controls").textContent()) ?? "", /Only shared when you tap Start/);
      assert.equal(calls.filter((c) => c.url.endsWith("driver/position")).length, 0, "nothing sent before Start");

      await page.getByTestId("locator-start-board").click();
      await page.getByTestId("name-board-panel").waitFor();
      await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value === "Mrs Aoife Gallagher");
      assert.equal(await page.getByLabel("Passenger name").inputValue(), "Mrs Aoife Gallagher", "board pre-filled from booking");
      await page.waitForFunction(() => document.querySelector("[data-testid=locator-status]")?.textContent?.includes("Sharing live location"));
      const positionsBefore = calls.filter((c) => c.url.endsWith("driver/position")).length;
      assert.ok(positionsBefore >= 1, "first fix sent after Start");
      const first = calls.find((c) => c.url.endsWith("driver/position"))!;
      assert.equal(first.headers["x-driver-key"], "driver-test-key", "credential in header");
      assert.ok(!first.url.includes("key="), "credential never in URL");

      // Show the board, then move the phone: GPS keeps flowing with the board on screen.
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-overlay").waitFor();
      await page.getByTestId("locator-board-badge").waitFor();
      for (let i = 1; i <= 3; i += 1) {
        await page.clock.fastForward(31_000);
        await ctx.setGeolocation({ latitude: BFS.lat + 0.001 + i * 0.0005, longitude: BFS.lng, accuracy: 12 });
        await page.waitForTimeout(150);
      }
      const during = calls.filter((c) => c.url.endsWith("driver/position")).length;
      assert.ok(during >= positionsBefore + 2, `GPS updates continue while the Name Board is displayed (${positionsBefore} → ${during})`);
      assert.match((await page.getByTestId("locator-board-badge").textContent()) ?? "", /Sharing live location/);
      await page.screenshot({ path: join(shots, "driver-name-board-with-sharing-portrait.png") });

      // Locked phone / no signal: uploads fail → badge says paused with age; never fabricated.
      failPositions = true;
      await page.clock.fastForward(90_000);
      await ctx.setGeolocation({ latitude: BFS.lat + 0.004, longitude: BFS.lng, accuracy: 15 });
      await page.waitForTimeout(150);
      await page.clock.fastForward(15_000);
      await page.waitForTimeout(150);
      assert.match((await page.getByTestId("locator-board-badge").textContent()) ?? "", /Updates paused · last sent/, "stale shown on board");
      // Back online and page visible again: resume immediately.
      failPositions = false;
      await page.clock.fastForward(11_000);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForFunction(() => document.querySelector("[data-testid=locator-board-badge]")?.textContent?.includes("Sharing live location"));
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();

      // Exiting the board does not stop sharing; Passenger collected does.
      assert.match((await page.getByTestId("locator-status").textContent()) ?? "", /Sharing live location/);
      await page.getByTestId("locator-collected").click();
      await page.waitForTimeout(100);
      const stop = calls.find((c) => c.url.endsWith("driver/stop"));
      assert.equal(stop?.body.reason, "collected");
      const afterStop = calls.filter((c) => c.url.endsWith("driver/position")).length;
      await page.clock.fastForward(60_000);
      await ctx.setGeolocation({ latitude: BFS.lat + 0.01, longitude: BFS.lng, accuracy: 10 });
      await page.waitForTimeout(150);
      assert.equal(calls.filter((c) => c.url.endsWith("driver/position")).length, afterStop, "nothing sent after stopping");
      for (const c of calls) {
        const all = JSON.stringify(c);
        assert.ok(!/Aoife|Gallagher/.test(all), "passenger name never sent to the locator API");
      }
      await ctx.close();
    }
    ok("Start sharing + Name Board: GPS continues under the board, stale → resume, collected stops uploads");

    console.log("\n=== 2. Permission denied, poor accuracy, server ends session ===");
    {
      const ctx = await newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
      // No geolocation permission granted → browser denies.
      const page = await ctx.newPage();
      const calls: Req[] = [];
      await page.route("https://worker.test/locator/**", async (route) => {
        const req = route.request();
        calls.push({ url: req.url(), body: JSON.parse(req.postData() || "{}"), headers: req.headers() });
        const path = new URL(req.url()).pathname.replace("/locator/", "");
        const reply = path === "driver/status" ? { ok: true, enabled: true, mode: "on", role: "driver" } : { ok: true, phase: "sharing" };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply), headers: { "Access-Control-Allow-Origin": "*" } });
      });
      await page.goto(`${origin}/driver.html?role=driver`);
      await page.getByTestId("locator-start").click();
      await page.waitForFunction(() => document.querySelector("[data-testid=locator-status]")?.textContent?.includes("Location permission is off"));
      assert.match((await page.getByTestId("locator-status").textContent()) ?? "", /Settings › Privacy & Security › Location Services/);
      await page.waitForTimeout(100);
      assert.ok(calls.some((c) => c.url.endsWith("driver/stop")), "server told to stop when permission denied");
      await page.screenshot({ path: join(shots, "driver-permission-denied-landscape.png") });
      await ctx.close();
    }
    {
      const ctx = await newContext({
        viewport: { width: 393, height: 852 },
        geolocation: { latitude: BFS.lat, longitude: BFS.lng, accuracy: 400 },
        permissions: ["geolocation"],
      });
      const page = await ctx.newPage();
      let positions = 0;
      await page.route("https://worker.test/locator/**", async (route) => {
        const path = new URL(route.request().url()).pathname.replace("/locator/", "");
        if (path === "driver/position") positions += 1;
        const reply =
          path === "driver/status" ? { ok: true, enabled: true, mode: "on", role: "owner" }
          : path === "driver/position" && positions > 1 ? { error: "This passenger has already been collected", code: "collected" }
          : { ok: true, stored: true, phase: "sharing" };
        return route.fulfill({
          status: "error" in reply ? 409 : 200,
          contentType: "application/json",
          body: JSON.stringify(reply),
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      });
      await page.clock.install();
      await page.goto(`${origin}/driver.html?role=owner`);
      await page.getByTestId("locator-start").click();
      await page.waitForFunction(() => document.querySelector("[data-testid=locator-status]")?.textContent?.includes("±400 m"));
      assert.match((await page.getByTestId("locator-status").textContent()) ?? "", /poor — customer sees the meeting point/);
      assert.equal(await page.getByTestId("locator-create-link").count(), 1, "owner can create a customer link");
      await page.clock.fastForward(31_000);
      await page.waitForFunction(() => document.querySelector("[data-testid=locator-status]")?.textContent?.includes("already been collected"));
      await ctx.close();
    }
    {
      const ctx = await newContext({ viewport: { width: 393, height: 852 } });
      const page = await ctx.newPage();
      await page.route("https://worker.test/locator/**", (route) =>
        route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Not found"}', headers: { "Access-Control-Allow-Origin": "*" } }),
      );
      await page.goto(`${origin}/driver.html?role=driver`);
      await page.waitForTimeout(300);
      assert.equal(await page.getByTestId("locator-controls").count(), 0, "controls hidden while the Worker has it switched off");
      await ctx.close();
    }
    ok("denied permission explained + server stopped; poor accuracy flagged; server end stops; hidden when off");

    /* ================= CUSTOMER ================= */
    console.log("\n=== 3. Customer page states ===");
    const now = Date.now();
    const base = {
      ok: true,
      driverName: "Sean",
      airport: { code: "BFS", name: "Belfast International Airport", ...BFS },
      meetingInstruction: "Please make your way to Express Pick-Up.",
      meetingNote: "Beside the Costa in Arrivals",
      meetingMapImage: "/maps/belfast-international-pick-up-drop-off.jpg",
      pollAfterMs: 15000,
      expiresAt: new Date(now + 3 * 3600e3).toISOString(),
    };
    const scenarios: Record<string, { status: number; body: Record<string, unknown> }> = {
      sharing: { status: 200, body: { ...base, status: "sharing", position: { lat: BFS.lat + 0.001, lng: BFS.lng + 0.001, accuracyM: 12, band: "good", updatedAt: new Date(now).toISOString(), ageSeconds: 5, lastKnown: false } } },
      stale: { status: 200, body: { ...base, status: "stale", position: { lat: BFS.lat + 0.001, lng: BFS.lng, accuracyM: 20, band: "good", updatedAt: new Date(now - 240e3).toISOString(), ageSeconds: 240, lastKnown: true } } },
      approximate: { status: 200, body: { ...base, status: "sharing", position: { lat: BFS.lat, lng: BFS.lng, accuracyM: 140, band: "approximate", updatedAt: new Date(now).toISOString(), ageSeconds: 3, lastKnown: false } } },
      waiting: { status: 200, body: { ...base, status: "waiting", position: null } },
      unavailable: { status: 200, body: { ...base, status: "unavailable", position: null } },
      collected: { status: 200, body: { ...base, status: "collected", position: null, pollAfterMs: 0 } },
      invalid: { status: 404, body: { error: "This link is not valid or has expired." } },
      outage: { status: 503, body: { error: "Live location is temporarily unavailable.", retryable: true } },
    };
    const expectations: Record<string, RegExp> = {
      sharing: /Sharing live location/,
      stale: /Location updates have paused/,
      approximate: /This position is approximate/,
      waiting: /hasn't started sharing yet/,
      unavailable: /Live location isn't available right now/,
      collected: /Collection complete/,
      invalid: /not valid or has expired/,
      outage: /temporarily unavailable — retrying/,
    };
    for (const [name, scenario] of Object.entries(scenarios)) {
      for (const vp of name === "sharing" || name === "stale" ? [{ w: 393, h: 852, tag: "portrait" }, { w: 852, h: 393, tag: "landscape" }] : [{ w: 393, h: 852, tag: "portrait" }]) {
        const ctx = await newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        const views: Req[] = [];
        const tiles: Record<string, string>[] = [];
        page.on("request", (r) => {
          if (/tile\.openstreetmap\.org/.test(r.url())) tiles.push(r.headers());
        });
        await page.route("https://worker.test/locator/view", async (route) => {
          const req = route.request();
          views.push({ url: req.url(), body: JSON.parse(req.postData() || "{}"), headers: req.headers() });
          await route.fulfill({ status: scenario.status, contentType: "application/json", body: JSON.stringify(scenario.body), headers: { "Access-Control-Allow-Origin": "*" } });
        });
        await page.goto(`${origin}/find-your-driver/#${LINK}`);
        await page.waitForFunction((re) => new RegExp(re).test(document.body.innerText), expectations[name].source);
        const tag = `${name}/${vp.tag}`;
        assert.equal(new URL(page.url()).hash, "", `${tag}: link removed from address bar`);
        assert.equal(views[0]?.body.link, LINK, `${tag}: link sent only in POST body`);
        assert.ok(!views[0].url.includes(LINK.slice(0, 20)), `${tag}: link not in request URL`);
        assert.ok(!views[0].headers.referer?.includes("#"), `${tag}: no fragment in referrer`);
        const text = await page.locator("body").innerText();
        assert.match(text, /Find Your Driver/);
        assert.match(text, /MY AIRPORT TAXI NI/);
        assert.match(text, /latest position only/i, `${tag}: privacy notice`);
        assert.match(text, /OpenStreetMap/, `${tag}: OSM privacy disclosure`);
        assert.match(text, /Message us on WhatsApp/);
        if (name !== "invalid" && name !== "outage" && name !== "collected") {
          assert.match(text, /Please make your way to Express Pick-Up/, `${tag}: meeting point fallback`);
          assert.match(text, /Beside the Costa/);
        }
        if (name === "sharing") {
          assert.match(text, /GPS accuracy/);
          assert.match(text, /±12 m \(good\)/);
          assert.match(text, /Driver: Sean/);
          await page.getByTestId("find-driver-map").waitFor();
          if (realLeaflet) {
            await page.waitForTimeout(500);
            assert.ok(tiles.length > 0, "map tiles requested");
            for (const h of tiles) {
              assert.equal(h.referer, `${origin}/`, "OSM gets an origin-only referrer");
            }
            assert.match(await page.locator(".leaflet-control-attribution").innerText(), /OpenStreetMap/, "OSM attribution visible");
          }
        }
        if (name === "stale") {
          assert.match(text, /Last known location/);
          assert.match(text, /4 minutes ago/);
          assert.equal(await page.getByTestId("find-driver-status").getAttribute("data-status"), "stale");
        }
        if (name === "collected") {
          assert.equal(await page.getByTestId("find-driver-map").count(), 0, "no map after collection");
        }
        await page.screenshot({ path: join(shots, `customer-${name}-${vp.tag}.png`), fullPage: true });
        await ctx.close();
      }
    }
    ok("sharing / stale / approximate / waiting / unavailable / collected / invalid / outage; link never in URL or referrer");

    console.log("\n=== 4. Live age keeps counting; outage keeps last view, marked ===");
    {
      const ctx = await newContext({ viewport: { width: 393, height: 852 } });
      const page = await ctx.newPage();
      await page.clock.install();
      let mode: "ok" | "down" = "ok";
      await page.route("https://worker.test/locator/view", (route) =>
        mode === "ok"
          ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenarios.sharing.body), headers: { "Access-Control-Allow-Origin": "*" } })
          : route.abort("internetdisconnected"),
      );
      await page.goto(`${origin}/find-your-driver/#${LINK}`);
      await page.getByTestId("find-driver-age").waitFor();
      mode = "down";
      await page.clock.fastForward(90_000);
      await page.waitForTimeout(200);
      const age = await page.getByTestId("find-driver-age").textContent();
      assert.match(age ?? "", /minute/, "age keeps counting with no new data");
      assert.equal(await page.getByTestId("find-driver-status").getAttribute("data-status"), "stale", "becomes last-known after 75 s");
      assert.match(await page.locator("body").innerText(), /No connection — retrying/);
      await page.reload();
      await page.waitForTimeout(300);
      assert.equal(new URL(page.url()).hash, "", "reload keeps the link out of the URL");
      await ctx.close();
    }
    ok("client never shows an old position as live; outage notice; reload safe");
  } finally {
    await raw.close();
    server.close();
    rmSync(outDir, { recursive: true, force: true });
  }
  console.log(`\nAll ${passed} Find Your Driver browser checks passed${realLeaflet ? "" : " (map library stubbed locally; real Leaflet + OSM checks run in CI)"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
