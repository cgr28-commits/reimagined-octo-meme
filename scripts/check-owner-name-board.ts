/**
 * Owner Dashboard → Name Board: logic, privacy, access and regression checks.
 * Offline only — no network, no browser.
 * Run: npx tsx scripts/check-owner-name-board.ts
 *
 * Browser layout / long-name / runtime privacy checks live in
 * scripts/check-owner-name-board-browser.ts.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  NAME_BOARD_COLOURS,
  NAME_BOARD_DEFAULTS,
  NAME_BOARD_IPHONE_TIPS,
  NAME_BOARD_MAX_CHARS,
  NAME_BOARD_MAX_LINES,
  NAME_BOARD_STORAGE_KEY,
  clampBoardInput,
  clearNameBoardSettings,
  detectNameBoardEnvironment,
  largestFittingSize,
  loadNameBoardSettings,
  normalizeBoardName,
  saveNameBoardSettings,
  wakeLockMessage,
} from "../src/lib/name-board";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`OK  ${label}`);
}

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

console.log("=== 1. Name normalisation ===");
{
  assert.equal(normalizeBoardName("  john   smith  "), "john smith");
  assert.equal(normalizeBoardName("Mr & Mrs O'Neill\r\nAcme Ltd"), "Mr & Mrs O'Neill\nAcme Ltd");
  assert.equal(normalizeBoardName("\n\n  \nSeán Ó Briain\n\n"), "Seán Ó Briain");
  assert.equal(normalizeBoardName("a\nb\nc\nd\ne").split("\n").length, NAME_BOARD_MAX_LINES);
  assert.ok(normalizeBoardName("x".repeat(500)).length <= NAME_BOARD_MAX_CHARS);
  assert.equal(normalizeBoardName("   "), "");
  assert.equal(clampBoardInput("one\ntwo\nthree\nfour"), "one\ntwo\nthree");
  assert.equal(clampBoardInput("y".repeat(200)).length, NAME_BOARD_MAX_CHARS);
  assert.equal(clampBoardInput("Mr \n"), "Mr \n", "keeps a newline the driver is still typing");
  ok("trims, collapses spaces, keeps up to 3 lines, caps length, keeps accents/apostrophes");
}

console.log("\n=== 2. Fit search ===");
{
  // Simulated text: fits while size*chars <= width and lines*size <= height.
  const fitsFor = (chars: number, width: number, height: number) => (size: number) =>
    size * chars * 0.6 <= width && size * 1.04 <= height;
  const short = largestFittingSize(fitsFor(4, 800, 300), 10, 300);
  const long = largestFittingSize(fitsFor(40, 800, 300), 10, 300);
  assert.ok(short > long, "long names get a smaller size");
  assert.ok(fitsFor(40, 800, 300)(long) && !fitsFor(40, 800, 300)(long + 1), "largest fitting size");
  assert.equal(largestFittingSize(() => true, 10, 300), 300);
  assert.equal(largestFittingSize(() => false, 10, 300), 10, "returns min when nothing fits");
  let calls = 0;
  largestFittingSize((s) => {
    calls += 1;
    return s < 137;
  }, 10, 1000);
  assert.ok(calls <= 14, `binary search stays cheap (${calls} measurements)`);
  ok("binary search finds the largest size that fits and stays cheap");
}

console.log("\n=== 3. Local-only storage + Reset ===");
{
  const store = new MemoryStorage();
  assert.deepEqual(loadNameBoardSettings(store), NAME_BOARD_DEFAULTS);
  assert.equal(saveNameBoardSettings({ name: "Ms Kelly", theme: "light", showWelcome: false }, store), true);
  assert.deepEqual([...store.map.keys()], [NAME_BOARD_STORAGE_KEY], "one key only");
  assert.deepEqual(loadNameBoardSettings(store), { name: "Ms Kelly", theme: "light", showWelcome: false });
  store.setItem(NAME_BOARD_STORAGE_KEY, "{not json");
  assert.deepEqual(loadNameBoardSettings(store), NAME_BOARD_DEFAULTS, "corrupt data falls back safely");
  store.setItem(NAME_BOARD_STORAGE_KEY, JSON.stringify({ name: 42, theme: "pink" }));
  assert.deepEqual(loadNameBoardSettings(store), NAME_BOARD_DEFAULTS);
  saveNameBoardSettings({ name: "Reset me", theme: "dark", showWelcome: true }, store);
  clearNameBoardSettings(store);
  assert.equal(store.map.size, 0, "Reset removes everything");
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadNameBoardSettings(throwing), NAME_BOARD_DEFAULTS);
  assert.equal(saveNameBoardSettings({ ...NAME_BOARD_DEFAULTS, name: "x" }, throwing), false);
  clearNameBoardSettings(throwing);
  ok("saves to one localStorage key, survives corrupt/blocked storage, Reset clears");
}

console.log("\n=== 4. Honest device messaging ===");
{
  const all = [
    wakeLockMessage("active"),
    wakeLockMessage("unsupported"),
    wakeLockMessage("failed"),
    wakeLockMessage("released"),
    ...NAME_BOARD_IPHONE_TIPS,
  ].join(" ");
  assert.doesNotMatch(all, /\b(will|always|guarantee[sd]?)\b[^.]*\b(stay awake|landscape|brightness|full ?screen)/i);
  assert.match(all, /can't be forced into landscape/i);
  assert.match(all, /can't change screen brightness/i);
  assert.match(wakeLockMessage("unsupported"), /Auto-Lock/);
  const panel = read("src/components/NameBoardPanel.tsx");
  assert.doesNotMatch(panel, /guarantee/i);
  assert.doesNotMatch(panel, /forces? (landscape|brightness)/i);
  assert.match(panel, /can&rsquo;t go true full screen/);
  const noWindow = detectNameBoardEnvironment(undefined);
  assert.deepEqual(noWindow, { wakeLock: false, fullscreen: false, iosLike: false, standalone: false });
  ok("no promises about iOS landscape, brightness, wake lock or fullscreen");
}

console.log("\n=== 5. Brand colours ===");
{
  assert.equal(NAME_BOARD_COLOURS.navy, "#071C38");
  assert.equal(NAME_BOARD_COLOURS.emerald, "#2FBF4A");
  const css = read("src/components/NameBoardPanel.module.css").toLowerCase();
  assert.match(css, /#071c38/);
  assert.match(css, /#2fbf4a/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /@media \(orientation: portrait\)/);
  assert.match(css, /white-space: pre-line/, "multi-line names");
  assert.doesNotMatch(css, /url\(\s*["']?https?:/, "no external assets");
  assert.doesNotMatch(css, /@import/);
  ok("navy / emerald / white, safe areas, dvh, orientation-aware, no external CSS");
}

console.log("\n=== 6. Privacy: name never leaves the device ===");
{
  const sources = {
    panel: read("src/components/NameBoardPanel.tsx"),
    lib: read("src/lib/name-board.ts"),
  };
  for (const [file, src] of Object.entries(sources)) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /sendBeacon/,
      /WebSocket/,
      /EventSource/,
      /\bgtag\b/,
      /dataLayer/,
      /trackContactClick|trackEvent|recordAdFraudBehaviour|quote-funnel-analytics|google-ads/,
      /history\.(push|replace)State/,
      /location\.(href|search|hash)\s*=/,
      /URLSearchParams/,
      /document\.title/,
      /console\.(log|info|warn|error|debug)/,
      /sessionStorage/,
      /document\.cookie/,
      /from\s+["']@\/lib\/(api|tracking-api|smart-ops-api|bookings)/,
      /https?:\/\//,
    ]) {
      assert.doesNotMatch(code, banned, `${file} must not use ${banned}`);
    }
  }
  // The panel takes no owner key / props: it cannot call the Worker.
  assert.match(
    sources.panel,
    /export default function NameBoardPanel\(\{ prefill = null \}: \{ prefill\?: NameBoardPrefill \| null \}\)/,
    "no owner key / API props: the board cannot call the Worker",
  );
  assert.match(sources.panel, /autoComplete="off"/);
  ok("no network, analytics, URL, title, console, cookie or sessionStorage use");
}

console.log("\n=== 7. Access: signed-in dashboard / driver portal only, no public route ===");
{
  const page = read("src/app/driver/DriverPageClient.tsx");
  // Owner: More → Name Board tab, only after the owner key is verified.
  assert.match(
    page,
    /isOwnerView && savedKey && ownerToolTab === "name-board" \? \(\s*<div id="owner-tool-panel-name-board"[\s\S]{0,300}<NameBoardPanel prefill=\{nameBoardPrefill\} \/>/,
  );
  // Driver: only with a verified driver key/session, opened from their own job card.
  assert.match(
    page,
    /savedKey && !isOwnerView && driverNameBoardOpen \? \(\s*<div id="driver-name-board"[\s\S]{0,500}<NameBoardPanel prefill=\{nameBoardPrefill\} \/>/,
  );
  assert.equal((page.match(/<NameBoardPanel\b/g) ?? []).length, 2, "rendered in exactly two gated places");
  // Job-card launcher is only provided when signed in.
  assert.match(page, /<NameBoardLauncherContext\.Provider value=\{savedKey \? openNameBoardFromJob : null\}>/);
  // Button only for airport pickups the driver can act on (not pending, not cancelled).
  assert.match(
    page,
    /openNameBoard &&\s*job\.isAirportPickup &&\s*!isRefunded &&\s*!isPendingForDriver &&\s*job\.customerName\?\.trim\(\)/,
  );
  // The passenger name comes from the job the driver already sees — no new API, no Worker change.
  assert.match(read("shared/driver-job-sanitize.ts"), /"customerName",/);
  assert.match(read("shared/driver-job-sanitize.ts"), /"isAirportPickup",/);

  // No route of its own anywhere under src/app.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/name-?board/i.test(full) || /NameBoardPanel/.test(readFileSync(full, "utf8")))
        offenders.push(relative(root, full));
    }
  };
  walk(join(root, "src/app"));
  assert.deepEqual(offenders, ["src/app/driver/DriverPageClient.tsx"], "only the gated portal imports it");
  assert.equal(existsSync(join(root, "src/app/owner/name-board")), false);
  assert.equal(existsSync(join(root, "src/app/driver/name-board")), false);
  assert.equal(existsSync(join(root, "public/name-board.html")), false);

  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  assert.match(switcher, /\| "name-board"/);
  assert.match(switcher, /id: "name-board",\s*label: "Name Board"/);
  ok("owner (More → Name Board / booking) and accepted drivers only; no public route; no new API");
}

console.log("\n=== 8. Accessible controls ===");
{
  const panel = read("src/components/NameBoardPanel.tsx");
  assert.match(panel, />\s*Display Name Board\s*</);
  assert.match(panel, /<label htmlFor=\{inputId\}/);
  assert.match(panel, /aria-describedby=/);
  assert.match(panel, /aria-invalid=/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-label="Exit name board and return to editing"/);
  assert.match(panel, /aria-pressed=\{settings\.theme === "dark"\}/);
  assert.match(panel, /aria-pressed=\{settings\.theme === "light"\}/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /exitButtonRef\.current\?\.focus\(\)/);
  assert.match(panel, /displayButtonRef\.current\?\.focus\(\)/);
  assert.match(panel, /WELCOME TO BELFAST/);
  assert.match(panel, /MY AIRPORT TAXI <span className=\{styles\.wordmarkNi\}>NI<\/span>/);
  assert.match(panel, /navigator as Navigator[\s\S]*wakeLock/);
  assert.match(panel, /requestFullscreen/);
  assert.match(panel, /webkitRequestFullscreen/);
  ok("labelled input, error alert, dialog semantics, focus handling, Escape, pressed states");
}

console.log("\n=== 9. Regression: existing dashboard tools unchanged ===");
{
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  for (const id of [
    "jobs",
    "past",
    "availability",
    "more",
    "pricing",
    "postcode-pricing",
    "a2a-quotes",
    "personal-quotes",
    "same-fare",
    "admin",
    "money",
    "requests",
    "enquiries",
    "tracking",
    "whatsapp",
    "inbox",
    "marketing",
    "google-ads",
    "empty-legs",
  ]) {
    assert.match(switcher, new RegExp(`\\| "${id}"`), `tab ${id} still exists`);
  }
  const order = [...switcher.matchAll(/\{ id: "([a-z0-9-]+)", label:/g)].map((m) => m[1]);
  assert.deepEqual(
    order.filter((id) => !["jobs", "past", "availability", "more"].includes(id)),
    [
      "inbox",
      "admin",
      "money",
      "requests",
      "enquiries",
      "whatsapp",
      "marketing",
      "google-ads",
      "tracking",
      "pricing",
      "postcode-pricing",
      "a2a-quotes",
      "personal-quotes",
      "same-fare",
    ],
    "existing More entries keep their order",
  );
  assert.match(switcher, /\{ id: "jobs", label: "Jobs" \}/);
  const page = read("src/app/driver/DriverPageClient.tsx");
  assert.match(page, /useState<OwnerDashboardToolTab>\("jobs"\)/, "Jobs is still the default tab");
  for (const tool of [
    "OwnerSmartAvailabilityPanel",
    "OwnerPricingPanel",
    "OwnerEmptyLegsPanel",
    "OwnerPostcodePricingPanel",
    "OwnerGoogleAdsFeedPanel",
    "OwnerInboxPanel",
    "OwnerMarketingPanel",
    "OwnerWhatsAppChatsPanel",
    "OwnerA2aQuotesPanel",
    "OwnerPersonalQuotesPanel",
    "OwnerPaidBookingsPanel",
    "OwnerShortNoticePanel",
    "OwnerBookingJobsPanel",
    "OwnerFinancialSummaryPanel",
  ]) {
    assert.match(page, new RegExp(`<${tool}\\b`), `${tool} still rendered`);
  }
  // Public pages and booking / payment / WhatsApp code do not reference the board.
  const publicFiles = [
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "src/app/book-quote/BookQuoteCustomerClient.tsx",
    "src/app/quick-quote/page.tsx",
    "src/components/WhatsAppQrLauncher.tsx",
    "src/components/GoogleAdsTag.tsx",
    "src/lib/owner-portal.ts",
  ];
  for (const file of publicFiles) {
    if (existsSync(join(root, file))) assert.doesNotMatch(read(file), /name-board|NameBoard/i, file);
  }
  // Owner/driver portals still hide the public sales widgets.
  const portal = read("src/lib/owner-portal.ts");
  assert.match(portal, /isOwnerPortalPath\(pathname\)/);
  ok("existing tabs, order, default, panels and public routes untouched");
}

console.log(`\nAll ${passed} name board checks passed.`);
