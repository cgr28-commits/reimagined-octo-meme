/**
 * Belfast events hub + public request pages: model, Worker routes and page guards.
 * Run: npx tsx scripts/check-belfast-events.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BELFAST_EVENT_CATEGORIES,
  BELFAST_VENUES,
  applyBelfastEventAction,
  belfastEventSlug,
  createBelfastEvent,
  toBelfastEventPublic,
  validateBelfastEventInput,
  type BelfastEventRecord,
} from "../shared/belfast-events";
import { handleBelfastEventsRoute, isBelfastEventsPath } from "../workers/addresses/src/belfast-events-handlers";

const root = join(new URL(".", import.meta.url).pathname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + n * 86400000));

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Belfast Giants home game",
    category: "sport",
    venueId: "the-o2-belfast",
    date: day(10),
    startTime: "19:00",
    summary: "Ice hockey in the Titanic Quarter.",
    ownWordsConfirmed: true,
    sourceNote: "club newsletter",
    ownerNotes: "busy night",
    ...overrides,
  };
}

function created(overrides: Record<string, unknown> = {}): BelfastEventRecord {
  const r = createBelfastEvent(valid(overrides));
  assert.ok(r.ok, JSON.stringify(r));
  return r.record;
}

async function main(): Promise<void> {
  console.log("=== Model ===");
  assert.deepEqual([...BELFAST_EVENT_CATEGORIES], ["concert", "sport", "theatre", "comedy", "festival", "exhibition"]);
  for (const v of BELFAST_VENUES) assert.match(v.area, /Belfast BT(?:[1-9]|1[0-7])\b/, `${v.name} is a Belfast venue`);
  const draft = created();
  assert.equal(draft.status, "draft", "new events are drafts");
  assert.equal(toBelfastEventPublic(draft), null, "drafts are never public");
  assert.equal(draft.id, belfastEventSlug("Belfast Giants home game", day(10)));
  assert.match(draft.id, /^[a-z0-9][a-z0-9-]{0,119}$/);
  // Belfast only.
  assert.ok(!validateBelfastEventInput(valid({ venueId: "nowhere" })).ok);
  const lisburn = validateBelfastEventInput(valid({ venueId: "other", venueName: "Lagan Valley LeisurePlex", venueArea: "Lisburn BT28 1LP" }));
  assert.ok(!lisburn.ok && /Belfast/.test(lisburn.errors.venueArea), "non-Belfast postcode refused");
  assert.ok(validateBelfastEventInput(valid({ venueId: "other", venueName: "Custom House Square", venueArea: "Belfast BT1 3ET" })).ok);
  // Plain text only; https links only.
  assert.ok(!validateBelfastEventInput(valid({ summary: "<img src=x onerror=alert(1)>" })).ok);
  assert.ok(!validateBelfastEventInput(valid({ officialUrl: "http://example.com" })).ok);
  assert.ok(!validateBelfastEventInput(valid({ officialUrl: "javascript:alert(1)" })).ok);
  assert.ok(!validateBelfastEventInput(valid({ summary: "x".repeat(401) })).ok);
  // No image field exists anywhere in the model.
  const typeBlock = read("shared/belfast-events.ts").match(/export type BelfastEventRecord = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.ok(typeBlock.includes("summary"), "record type found");
  assert.ok(!/image|photo|picture|logo/i.test(typeBlock), "no image fields in the record");
  assert.ok(!Object.keys(created({ image: "https://x/y.jpg", imageUrl: "https://x/y.jpg" })).some((k) => /image/i.test(k)), "image input ignored");

  console.log("=== Approval gate ===");
  const notConfirmed = created({ ownWordsConfirmed: false });
  const refused = applyBelfastEventAction(notConfirmed, { type: "publish" });
  assert.ok(!refused.ok && /own words/.test(refused.error), "cannot publish without own-words confirmation");
  const pub = applyBelfastEventAction(draft, { type: "publish" });
  assert.ok(pub.ok);
  const published = pub.record;
  assert.equal(published.status, "published");
  assert.equal(published.version, draft.version + 1);
  const view = toBelfastEventPublic(published)!;
  assert.ok(view);
  for (const key of ["sourceNote", "ownerNotes", "version", "ownWordsConfirmed", "createdAt"]) {
    assert.ok(!(key in view), `public view hides ${key}`);
  }
  // Editing a published event needs a fresh confirmation; the id never changes.
  const edit = applyBelfastEventAction(published, { type: "save", fields: valid({ title: "Renamed", ownWordsConfirmed: false }) });
  assert.ok(!edit.ok);
  const edit2 = applyBelfastEventAction(published, { type: "save", fields: valid({ title: "Renamed" }) });
  assert.ok(edit2.ok && edit2.record.id === published.id && edit2.record.title === "Renamed");
  // Past events cannot be published and are not public.
  const past = { ...draft, date: day(-1) };
  assert.ok(!applyBelfastEventAction(past, { type: "publish" }).ok);
  assert.equal(toBelfastEventPublic({ ...published, date: day(-1) }), null);
  // Postponed / cancelled stay visible but are flagged.
  const pp = applyBelfastEventAction(published, { type: "postpone" });
  assert.ok(pp.ok && toBelfastEventPublic(pp.record)?.status === "postponed");
  const un = applyBelfastEventAction(published, { type: "unpublish" });
  assert.ok(un.ok && toBelfastEventPublic(un.record) === null);

  console.log("=== Worker routes ===");
  assert.ok(isBelfastEventsPath("/events/public"));
  assert.ok(isBelfastEventsPath("/owner/belfast-events"));
  assert.ok(isBelfastEventsPath("/owner/belfast-events/action"));
  assert.ok(!isBelfastEventsPath("/events/emerge-belfast-taxi"));
  const kv = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const v = kv.get(key) ?? null;
      return v !== null && type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      kv.set(key, value);
    },
    async list(opts: { prefix?: string }) {
      return { keys: [...kv.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).map((name) => ({ name })), list_complete: true };
    },
  } as unknown as KVNamespace;
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "owner-key-123", DRIVER_ACCESS_KEY: "driver-key-456", BESPOKE_QUOTES_ENABLED: "1" };
  const call = async (path: string, init: { method?: string; body?: unknown; owner?: string; env?: Record<string, unknown> } = {}) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (init.owner) headers["X-Owner-Key"] = init.owner;
    const res = await handleBelfastEventsRoute(
      new Request(`https://worker.example${path}`, { method: init.method ?? "GET", headers, ...(init.body ? { body: JSON.stringify(init.body) } : {}) }),
      { ...env, ...init.env } as never,
      "https://www.myairporttaxini.co.uk",
    );
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text, headers: res.headers };
  };
  const OWNER = "owner-key-123";
  // Public endpoint is off unless the switch is exactly "1".
  assert.equal((await call("/events/public", { env: { BESPOKE_QUOTES_ENABLED: undefined } })).status, 404);
  assert.equal((await call("/events/public", { env: { BESPOKE_QUOTES_ENABLED: "true" } })).status, 404);
  // Owner auth: header only.
  assert.equal((await call("/owner/belfast-events")).status, 401);
  assert.equal((await call("/owner/belfast-events?key=owner-key-123")).status, 400);
  // Create → draft, invisible publicly.
  const c1 = await call("/owner/belfast-events/action", { method: "POST", owner: OWNER, body: { action: "create", fields: valid() } });
  assert.equal(c1.status, 201, c1.text);
  const id = c1.json.record.id as string;
  assert.equal((await call("/events/public")).json.events.length, 0, "drafts not public");
  assert.equal((await call("/owner/belfast-events/action", { method: "POST", owner: OWNER, body: { action: "create", fields: valid() } })).status, 409, "no duplicate ids");
  // Stale version is refused.
  const stale = await call("/owner/belfast-events/action", { method: "POST", owner: OWNER, body: { action: "publish", id, expectedVersion: 99 } });
  assert.equal(stale.status, 409);
  const p1 = await call("/owner/belfast-events/action", { method: "POST", owner: OWNER, body: { action: "publish", id, expectedVersion: 1 } });
  assert.equal(p1.status, 200, p1.text);
  const pub1 = await call("/events/public");
  assert.equal(pub1.json.events.length, 1);
  assert.equal(pub1.headers.get("Cache-Control"), "public, max-age=300");
  assert.ok(!/club newsletter|busy night|ownWordsConfirmed|sourceNote/.test(pub1.text), "private fields never public");
  const ownerList = await call("/owner/belfast-events", { owner: OWNER });
  assert.match(ownerList.text, /club newsletter/, "owner sees private notes");
  // Cancelled stays listed with its status.
  await call("/owner/belfast-events/action", { method: "POST", owner: OWNER, body: { action: "cancel", id, expectedVersion: 2 } });
  assert.equal((await call("/events/public")).json.events[0].status, "cancelled");
  assert.ok(![...kv.keys()].some((k) => !k.startsWith("bevt:")), "only the bevt: KV prefix is used");

  console.log("=== Public pages stay off until approved ===");
  const flag = read("src/lib/bespoke-public.ts");
  assert.match(flag, /BESPOKE_PUBLIC_PAGES_ENABLED = process\.env\.NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES === "1"/);
  for (const page of ["src/app/events/page.tsx", "src/app/events/transfer-request/page.tsx", "src/app/business-class-request/page.tsx"]) {
    const src = read(page);
    assert.match(src, /if \(!BESPOKE_PUBLIC_PAGES_ENABLED\) notFound\(\);/, `${page} 404s while off`);
    assert.match(src, /robots: \{ index: false/, `${page} noindex while off`);
  }
  assert.match(read("scripts/generate-sitemap.mjs"), /\.\.\.\(BESPOKE_PUBLIC_PAGES_ENABLED\s*\?/, "sitemap entries gated");
  assert.match(read("scripts/build-bespoke-preview-site.mjs"), /NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES: "1"/, "only the preview build enables them");
  for (const wf of ["deploy-pages.yml", "site-watchdog.yml"]) {
    let text = "";
    try {
      text = read(`.github/workflows/${wf}`);
    } catch {
      continue;
    }
    assert.ok(!/NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES/.test(text), `${wf} never enables the pages`);
  }
  assert.ok(!/NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES/.test(read("src/components/Header.tsx") + read("src/components/Footer.tsx")), "no nav links added");

  console.log("=== Copy, capacity and SEO guards ===");
  const pageCopy = [
    "src/lib/belfast-events-content.ts",
    "src/app/events/page.tsx",
    "src/app/events/transfer-request/page.tsx",
    "src/app/business-class-request/page.tsx",
    "src/components/BespokeRequestForm.tsx",
    "src/components/BelfastEventsList.tsx",
  ]
    .map(read)
    .join("\n");
  assert.ok(!/guarantee/i.test(pageCopy), "never promise a vehicle");
  assert.ok(!/minibus|coach|16[- ]seater|people carrier|limousine|stretch/i.test(pageCopy), "no vehicles we do not run");
  assert.match(pageCopy, /7-seater[\s\S]{0,40}subject to availability/i, "7-seater always subject to availability");
  assert.match(read("src/lib/bespoke-public.ts"), /EVENT_REQUEST_MAX_PASSENGERS = 7/);
  const form = read("src/components/BespokeRequestForm.tsx");
  assert.match(form, /BUSINESS_CLASS_MAX_PASSENGERS : EVENT_REQUEST_MAX_PASSENGERS/, "Business Class form capped by the shared 3-passenger limit");
  assert.match(form, /\/bespoke-quotes\/request|submitBespokeRequest/, "uses the existing bespoke backend");
  assert.match(form, /website/, "honeypot present");
  assert.match(form, /BESPOKE_TURNSTILE_ACTION/);
  assert.equal(read("src/lib/bespoke-public.ts").match(/BESPOKE_TURNSTILE_ACTION = "([^"]+)"/)?.[1], "bespoke_quote_request", "Turnstile action matches the Worker");
  assert.ok(!/"@type":\s*"Event"|@type": "Event"/.test(read("src/app/events/page.tsx")), "no Event rich-result markup pointing at our service");
  // Airport instant quote and automatic Business Class untouched by this feature.
  for (const file of ["src/components/QuoteCard.tsx", "shared/executive-vehicle.ts", "shared/business-class-minimum.ts", "workers/addresses/src/main-quote-pricing.ts"]) {
    assert.ok(!/belfast-events|bespoke-public|BespokeRequestForm/.test(read(file)), `${file} unchanged by events feature`);
  }

  console.log("\nAll Belfast events checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
