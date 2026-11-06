/**
 * Owner Dashboard → Name Board: real-browser checks (Chromium via Playwright).
 *
 * Bundles the real NameBoardPanel + CSS module with esbuild into a local
 * harness page, serves it from 127.0.0.1 and checks, on iPhone-sized
 * viewports in landscape and portrait:
 *   - long / multi-line names fit without clipping or overlapping the branding
 *   - theme switching, exit control, Escape, focus return
 *   - wake lock request/release + graceful unsupported message
 *   - Fullscreen API when available, fixed-overlay fallback when not (iPhone Safari)
 *   - privacy: the name never appears in any network request, URL, title,
 *     cookie or sessionStorage; only one localStorage key; Reset clears it
 *   - keeps working offline once loaded
 *
 * Run: npx tsx scripts/check-owner-name-board-browser.ts
 * Safari engine: NAME_BOARD_BROWSER=webkit npx tsx scripts/check-owner-name-board-browser.ts
 * Needs `playwright` (+ a Chromium: `npx playwright install chromium`, or set
 * NAME_BOARD_CHROME=/path/to/chrome). Prints SKIP and exits 0 when Playwright
 * is not installed, so it never blocks unrelated work.
 * Screenshots: test-results/name-board/*.png
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(join(root, "package.json"));
const ENGINE = process.env.NAME_BOARD_BROWSER === "webkit" ? "webkit" : "chromium";
const shotsDir = join(root, "test-results", ENGINE === "webkit" ? "name-board-webkit" : "name-board");

function tryRequire<T>(names: string[]): T | null {
  for (const name of names) {
    try {
      return require(name) as T;
    } catch {
      // try next
    }
  }
  return null;
}

type Esbuild = typeof import("esbuild");
type Playwright = typeof import("playwright");

const esbuild = tryRequire<Esbuild>(["esbuild", ...(process.env.ESBUILD_PATH ? [process.env.ESBUILD_PATH] : [])]);
const playwright = tryRequire<Playwright>([
  "playwright",
  ...(process.env.PLAYWRIGHT_PATH ? [process.env.PLAYWRIGHT_PATH] : []),
]);

if (!esbuild || !playwright) {
  console.log(
    `SKIP  name board browser checks — ${!playwright ? "playwright" : "esbuild"} is not installed.`,
  );
  process.exit(0);
}

const PRIVATE_NAME = "Zebedee Quixoteprivacy";

const CASES: { label: string; name: string }[] = [
  { label: "short", name: "Smith" },
  { label: "typical", name: "Mr & Mrs O'Neill" },
  { label: "long", name: "Mr & Mrs Christopher Alexander Montgomery-Fitzgerald" },
  { label: "one-long-word", name: "Wolfeschlegelsteinhausenbergerdorff" },
  { label: "two-line", name: "Dr Siobhán Ní Mhaoldomhnaigh\nQueen's University Belfast" },
  { label: "max-length", name: "W".repeat(80) },
];

const VIEWPORTS = [
  { label: "iphone-se-landscape", width: 667, height: 375 },
  { label: "iphone-15-landscape", width: 852, height: 393 },
  { label: "iphone-15-pro-max-landscape", width: 932, height: 430 },
  { label: "iphone-15-portrait", width: 393, height: 852 },
];

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

async function bundle(outDir: string) {
  await esbuild!.build({
    entryPoints: [join(root, "scripts/name-board-harness/entry.tsx")],
    bundle: true,
    outdir: outDir,
    format: "esm",
    platform: "browser",
    target: ["safari16", "chrome110"],
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    loader: { ".png": "file" },
    define: { "process.env.NODE_ENV": '"production"' },
    nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(":") : [],
    logLevel: "silent",
  });
  writeFileSync(
    join(outDir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Owner dashboard | My Airport Taxi NI</title>
<link rel="stylesheet" href="/entry.css">
<style>html,body{margin:0;background:#071c38;color:#e8edf5}</style>
</head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`,
  );
}

function serve(outDir: string): Promise<{ server: Server; origin: string }> {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const candidates = [join(outDir, normalize(path)), join(root, "public", normalize(path))];
    const file = candidates.find((c) => existsSync(c) && !c.endsWith("/"));
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    }),
  );
}

async function launch() {
  if (ENGINE === "webkit") return playwright!.webkit.launch();
  const executablePath = process.env.NAME_BOARD_CHROME;
  if (executablePath) return playwright!.chromium.launch({ executablePath });
  try {
    return await playwright!.chromium.launch();
  } catch {
    return playwright!.chromium.launch({ channel: "chrome" });
  }
}

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`OK  ${label}`);
}

async function main() {
  const outDir = mkdtempSync(join(tmpdir(), "name-board-"));
  mkdirSync(shotsDir, { recursive: true });
  await bundle(outDir);
  const { server, origin } = await serve(outDir);
  const rawBrowser = await launch();
  // tsx (esbuild keepNames) wraps functions in __name(); define it in the page so
  // functions passed to page.evaluate() run unchanged.
  const browser = {
    async newContext(options?: Parameters<typeof rawBrowser.newContext>[0]) {
      const context = await rawBrowser.newContext(options);
      await context.addInitScript("window.__name = window.__name || ((fn) => fn);");
      return context;
    },
    close: () => rawBrowser.close(),
  };

  try {
    /* ---------- Layout: every viewport × every name ---------- */
    console.log("=== 1. Fit without clipping on iPhone sizes ===");
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
      });
      const page = await context.newPage();
      await page.goto(origin);
      const sizes: Record<string, number> = {};
      for (const sample of CASES) {
        await page.getByLabel("Passenger name").fill(sample.name);
        const expectedText = sample.name.replace(/\s*\n\s*/g, "\n");
        // The editor's live preview proves the typed name is in state before Display is tapped.
        try {
          await page.waitForFunction(
            (want) => document.querySelector("[data-testid=name-board-preview-name]")?.textContent === want,
            expectedText,
            { timeout: 5_000 },
          );
        } catch (error) {
          const state = await page.evaluate(() => ({
            textarea: (document.querySelector("textarea") as HTMLTextAreaElement).value,
            preview: document.querySelector("[data-testid=name-board-preview-name]")?.textContent,
            stored: localStorage.getItem("matni-name-board-v1"),
          }));
          console.log(`DIAG ${vp.label} · ${sample.label}: ${JSON.stringify(state)}`);
          throw error;
        }
        await page.getByRole("button", { name: "Display Name Board" }).click();
        const dialog = page.getByRole("dialog", { name: "Pickup name board" });
        await dialog.waitFor();
        await page.waitForTimeout(80);
        // Then the full-screen board must show that same name (fails if it ever opens stale).
        const shown = await page.getByTestId("name-board-name").textContent();
        assert.equal(shown, expectedText, `${vp.label} · ${sample.label}: board opens with the name just typed`);
        const m = await page.evaluate(() => {
          const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
          const overlay = q("name-board-overlay").getBoundingClientRect();
          const box = q("name-board-box");
          const name = q("name-board-name");
          const brand = q("name-board-brand").getBoundingClientRect();
          const welcome = q("name-board-welcome")?.getBoundingClientRect() ?? null;
          const exit = q("name-board-exit").getBoundingClientRect();
          const toggle = q("name-board-theme-toggle").getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(name);
          const textRects = Array.from(range.getClientRects());
          const text = range.getBoundingClientRect();
          const lineTops = new Set(textRects.map((r) => Math.round(r.top)));
          return {
            overlay: { w: overlay.width, h: overlay.height, x: overlay.x, y: overlay.y },
            vw: window.innerWidth,
            vh: window.innerHeight,
            boxW: box.clientWidth,
            boxH: box.clientHeight,
            boxRect: box.getBoundingClientRect().toJSON(),
            nameScrollW: name.scrollWidth,
            nameScrollH: name.scrollHeight,
            text: text.toJSON(),
            lines: lineTops.size,
            fontSize: parseFloat(getComputedStyle(name).fontSize),
            brand: brand.toJSON(),
            welcome: welcome ? welcome.toJSON() : null,
            exit: exit.toJSON(),
            toggle: toggle.toJSON(),
            content: name.textContent,
            transform: getComputedStyle(name).textTransform,
          };
        });
        const tag = `${vp.label} · ${sample.label}`;
        assert.ok(Math.abs(m.overlay.w - m.vw) < 1 && Math.abs(m.overlay.h - m.vh) < 1, `${tag}: board fills screen`);
        assert.ok(m.nameScrollW <= m.boxW + 1, `${tag}: no horizontal overflow (${m.nameScrollW} > ${m.boxW})`);
        assert.ok(m.nameScrollH <= m.boxH + 1, `${tag}: no vertical overflow (${m.nameScrollH} > ${m.boxH})`);
        assert.ok(m.text.left >= -0.5 && m.text.right <= m.vw + 0.5, `${tag}: text inside screen width`);
        assert.ok(m.text.top >= m.boxRect.top - 1 && m.text.bottom <= m.boxRect.bottom + 1, `${tag}: text inside name area`);
        assert.ok(m.text.top >= m.brand.bottom - 0.5, `${tag}: name does not overlap branding`);
        if (m.welcome) assert.ok(m.text.bottom <= m.welcome.top + 0.5, `${tag}: name does not overlap welcome`);
        if (m.welcome)
          assert.ok(Math.abs((m.welcome.left + m.welcome.right) / 2 - m.vw / 2) < 2, `${tag}: welcome message centred`);
        assert.ok(Math.abs((m.brand.left + m.brand.right) / 2 - m.vw / 2) < 2, `${tag}: branding centred`);
        for (const [label, r] of [
          ["exit", m.exit],
          ["theme toggle", m.toggle],
        ] as const) {
          assert.ok(r.width >= 44 && r.height >= 44, `${tag}: ${label} is a 44px touch target`);
          assert.ok(r.left >= 0 && r.right <= m.vw && r.top >= 0 && r.bottom <= m.vh, `${tag}: ${label} on screen`);
          assert.ok(r.bottom <= m.brand.top + 0.5 || r.right <= m.brand.left || r.left >= m.brand.right, `${tag}: ${label} clear of brand`);
        }
        assert.equal(m.content, sample.name.replace(/\s*\n\s*/g, "\n"), `${tag}: shows exactly the entered name`);
        assert.equal(m.transform, "uppercase");
        if (sample.label === "two-line") assert.ok(m.lines >= 2, `${tag}: multi-line name keeps its line break`);
        sizes[sample.label] = m.fontSize;
        if (vp.label === "iphone-15-landscape" || (vp.label === "iphone-15-portrait" && sample.label !== "short")) {
          await page.screenshot({ path: join(shotsDir, `${vp.label}-${sample.label}.png`) });
        }
        await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
        await dialog.waitFor({ state: "detached" });
      }
      const landscape = vp.width > vp.height;
      assert.ok(sizes.short > sizes.long, `${vp.label}: long names scale down`);
      if (landscape) {
        assert.ok(sizes.short >= vp.height * 0.3, `${vp.label}: short name is very large (${sizes.short}px)`);
        assert.ok(sizes.typical >= 48, `${vp.label}: typical name ≥ 48px (${sizes.typical}px)`);
        assert.ok(sizes.long >= 28, `${vp.label}: long name still readable (${sizes.long}px)`);
        assert.ok(Math.min(...Object.values(sizes)) >= 24, `${vp.label}: every name ≥ 24px in landscape`);
      }
      console.log(
        `    ${vp.label}: ${Object.entries(sizes)
          .map(([k, v]) => `${k} ${v}px`)
          .join(" · ")}`,
      );
      await context.close();
    }
    ok("all names fit inside the board on 4 iPhone viewports, with no overlap of brand, welcome or controls");

    /* ---------- Orientation change while open ---------- */
    console.log("\n=== 2. Responds to rotation while open ===");
    {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel("Passenger name").fill("Mr & Mrs O'Neill");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-overlay").waitFor();
      const portraitSize = await page.getByTestId("name-board-name").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.equal(await page.getByTestId("name-board-rotate-hint").isVisible(), true, "portrait shows rotate hint");
      await page.setViewportSize({ width: 852, height: 393 });
      await page.waitForTimeout(150);
      const landscapeSize = await page.getByTestId("name-board-name").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.equal(await page.getByTestId("name-board-rotate-hint").isVisible(), false, "landscape hides rotate hint");
      assert.ok(landscapeSize > portraitSize, `re-fits after rotation (${portraitSize} → ${landscapeSize})`);
      await context.close();
    }
    ok("re-fits on rotation; rotate hint only in portrait");

    /* ---------- Themes, exit, Escape, focus ---------- */
    console.log("\n=== 3. Themes, exit control, Escape, focus ===");
    {
      const context = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel("Passenger name").fill("Ms Kelly");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      const face = page.getByTestId("name-board-face");
      const colours = () =>
        face.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el.querySelector("[data-testid=name-board-name]")!).color }));
      assert.deepEqual(await colours(), { bg: "rgb(7, 28, 56)", fg: "rgb(255, 255, 255)" });
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.testid), "name-board-exit", "exit focused on open");
      await page.getByTestId("name-board-theme-toggle").click();
      assert.deepEqual(await colours(), { bg: "rgb(255, 255, 255)", fg: "rgb(7, 28, 56)" });
      const opacity = await page.getByTestId("name-board-overlay").evaluate((el) => getComputedStyle(el).opacity);
      assert.equal(opacity, "1", "board is fully opaque — nothing behind shows through");
      await page.screenshot({ path: join(shotsDir, "iphone-15-landscape-white-theme.png") });
      await page.keyboard.press("Escape");
      await page.getByTestId("name-board-overlay").waitFor({ state: "detached" });
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.testid), "name-board-display", "focus returns to Display button");
      assert.equal(await page.getByTestId("name-board-theme-light").getAttribute("aria-pressed"), "true", "theme choice kept in editor");
      await page.getByTestId("name-board-theme-dark").click();
      await page.getByTestId("name-board-welcome-toggle").uncheck();
      await page.getByRole("button", { name: "Display Name Board" }).click();
      assert.equal(await page.getByTestId("name-board-welcome").count(), 0, "welcome message is optional");
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      // Empty name: error, no board.
      await page.getByLabel("Passenger name").fill("   ");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      assert.equal(await page.getByRole("alert").textContent(), "Enter the passenger's name first.");
      assert.equal(await page.getByTestId("name-board-overlay").count(), 0);
      assert.equal(await page.getByLabel("Passenger name").getAttribute("aria-invalid"), "true");
      await page.screenshot({ path: join(shotsDir, "editor-empty-error.png"), fullPage: true });
      await context.close();
    }
    ok("navy/white switch on board + editor, Exit and Escape return focus, empty name blocked with alert");

    /* ---------- Wake lock + fullscreen ---------- */
    console.log("\n=== 4. Wake lock and fullscreen ===");
    {
      const context = await browser.newContext({ viewport: { width: 852, height: 393 } });
      await context.addInitScript(() => {
        const log: string[] = [];
        (window as unknown as { __wake: string[] }).__wake = log;
        const listeners: (() => void)[] = [];
        Object.defineProperty(navigator, "wakeLock", {
          configurable: true,
          value: {
            request: async () => {
              log.push("request");
              const s = {
                released: false,
                release: async () => {
                  if (s.released) return;
                  s.released = true;
                  log.push("release");
                  listeners.forEach((l) => l());
                },
                addEventListener: (_: string, l: () => void) => listeners.push(l),
              };
              return s;
            },
          },
        });
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel("Passenger name").fill("Ms Kelly");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-overlay").waitFor();
      await page.waitForTimeout(100);
      const fs = await page.evaluate(() => Boolean(document.fullscreenElement));
      // Headless WebKit on Linux doesn't grant element fullscreen; the overlay covers the screen either way.
      if (ENGINE === "chromium") assert.equal(fs, true, "uses Fullscreen API where the browser supports it");
      assert.deepEqual(await page.evaluate(() => (window as unknown as { __wake: string[] }).__wake), ["request"]);
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(() => (window as unknown as { __wake: string[] }).__wake), ["request", "release"]);
      await page.waitForFunction(() => !document.fullscreenElement);
      await context.close();
    }
    {
      // iPhone Safari-like: no wakeLock, no element fullscreen.
      const context = await browser.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "wakeLock", { configurable: true, get: () => undefined });
        delete (Navigator.prototype as unknown as { wakeLock?: unknown }).wakeLock;
        Object.defineProperty(Document.prototype, "fullscreenEnabled", { configurable: true, get: () => false });
        Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: undefined });
        Object.defineProperty(Document.prototype, "webkitFullscreenEnabled", { configurable: true, get: () => false });
        Object.defineProperty(Element.prototype, "webkitRequestFullscreen", { configurable: true, value: undefined });
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByText("Phone tips & privacy").click();
      const tips = await page.getByTestId("name-board-panel").textContent();
      assert.match(tips ?? "", /can't keep the screen awake|can’t keep the screen awake/);
      assert.match(tips ?? "", /Auto-Lock/);
      assert.match(tips ?? "", /can’t go true full screen/);
      await page.getByLabel("Passenger name").fill("Ms Kelly");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-overlay").waitFor();
      const state = await page.evaluate(() => {
        const o = document.querySelector("[data-testid=name-board-overlay]")!;
        const s = getComputedStyle(o);
        return {
          position: s.position,
          zIndex: s.zIndex,
          htmlOverflow: document.documentElement.style.overflow,
          fs: Boolean(document.fullscreenElement),
        };
      });
      assert.deepEqual(state, { position: "fixed", zIndex: "2147483000", htmlOverflow: "hidden", fs: false });
      // Swiping on the board must not scroll the page behind it (iPhone rubber-banding).
      const swipeBlocked = await page.evaluate(() => {
        const overlay = document.querySelector("[data-testid=name-board-overlay]")!;
        // Portable one-finger swipe (WebKit forbids constructing Touch objects from script).
        const event = new Event("touchmove", { cancelable: true, bubbles: true });
        Object.defineProperty(event, "touches", { value: [{ clientX: 100, clientY: 100 }] });
        return overlay.dispatchEvent(event) ? "not-blocked" : "blocked";
      });
      assert.equal(swipeBlocked, "blocked", "one-finger swipe on the board doesn't scroll the page behind");
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "", "scroll restored");
      await context.close();
    }
    ok("wake lock requested + released; Fullscreen API used where supported; iPhone fallback overlay + honest messages");

    /* ---------- Booking prefill ---------- */
    console.log("\n=== 5. Name filled in from a booking, still editable ===");
    {
      const context = await browser.newContext({ viewport: { width: 852, height: 393 } });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel("Passenger name").fill("Manual Name");
      await page.getByTestId("harness-job-button").click();
      await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement).value !== "Manual Name");
      assert.equal(await page.getByLabel("Passenger name").inputValue(), "Mrs Aoife Gallagher", "prefilled from booking");
      assert.match((await page.getByTestId("name-board-status").textContent()) ?? "", /filled in from the booking/);
      await page.getByLabel("Passenger name").fill("Aoife Gallagher\nHoliday Group");
      await page.getByRole("button", { name: "Display Name Board" }).click();
      assert.equal(await page.getByTestId("name-board-name").textContent(), "Aoife Gallagher\nHoliday Group", "driver edit wins");
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      await page.getByTestId("harness-job-button").click();
      await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement).value === "Mrs Aoife Gallagher");
      assert.equal(await page.getByLabel("Passenger name").inputValue(), "Mrs Aoife Gallagher", "tapping the booking again re-applies its name");
      await context.close();
    }
    ok("booking name fills the input, driver can edit or type manually, re-tap re-applies");

    /* ---------- Privacy + offline ---------- */
    console.log("\n=== 6. Privacy and offline ===");
    {
      const context = await browser.newContext({ viewport: { width: 852, height: 393 } });
      const requests: { url: string; body: string; headers: string }[] = [];
      context.on("request", (req) =>
        requests.push({ url: req.url(), body: req.postData() ?? "", headers: JSON.stringify(req.headers()) }),
      );
      const page = await context.newPage();
      await page.goto(origin);
      const startUrl = page.url();
      const startTitle = await page.title();
      await page.getByLabel("Passenger name").fill(PRIVATE_NAME);
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-theme-toggle").click();
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      assert.equal(page.url(), startUrl, "URL unchanged");
      assert.equal(await page.title(), startTitle, "title unchanged");

      // Saved locally, restored after reload.
      await page.reload();
      assert.equal(await page.getByLabel("Passenger name").inputValue(), PRIVATE_NAME, "last name restored on this device");
      const storage = await page.evaluate(() => ({
        local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
        session: JSON.stringify(sessionStorage),
        cookie: document.cookie,
      }));
      assert.deepEqual(Object.keys(storage.local), ["matni-name-board-v1"], "one localStorage key only");
      assert.ok(!storage.session.includes("Zebedee") && !storage.cookie.includes("Zebedee"));

      // Offline after load: board still works, with logo.
      await context.setOffline(true);
      await page.getByRole("button", { name: "Display Name Board" }).click();
      await page.getByTestId("name-board-overlay").waitFor();
      const emblemOk = await page.evaluate(() => {
        const img = document.querySelector("[data-testid=name-board-brand] img") as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
      });
      assert.equal(emblemOk, true, "logo shows offline");
      assert.match((await page.getByTestId("name-board-name").textContent()) ?? "", /Zebedee/);
      await page.getByRole("button", { name: "Exit name board and return to editing" }).click();
      await context.setOffline(false);

      // Reset clears it.
      await page.getByRole("button", { name: "Reset" }).click();
      assert.equal(await page.getByLabel("Passenger name").inputValue(), "");
      assert.equal(await page.evaluate(() => localStorage.getItem("matni-name-board-v1")), null, "Reset removes stored name");
      await page.reload();
      assert.equal(await page.getByLabel("Passenger name").inputValue(), "", "still cleared after reload");

      const leaks = requests.filter((r) =>
        [PRIVATE_NAME, PRIVATE_NAME.toUpperCase(), encodeURIComponent(PRIVATE_NAME), "Zebedee", "Quixote"].some(
          (needle) => r.url.includes(needle) || r.body.includes(needle) || r.headers.includes(needle),
        ),
      );
      assert.deepEqual(leaks, [], "name never sent in any request");
      const foreign = requests.filter((r) => !r.url.startsWith(origin));
      assert.deepEqual(foreign.map((r) => r.url), [], "no third-party requests from the tool");
      console.log(`    ${requests.length} requests checked, all same-origin static files, none contain the name`);
      await context.close();
    }
    ok("name only in one localStorage key, never in requests/URL/title/cookies; Reset clears; works offline");
  } finally {
    await browser.close();
    server.close();
    rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\nAll ${passed} name board browser checks passed on ${ENGINE}. Screenshots: ${shotsDir.replace(root + "/", "")}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
