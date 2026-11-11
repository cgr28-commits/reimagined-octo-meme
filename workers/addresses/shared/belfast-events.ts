/**
 * Belfast event listings (hand-entered by the owner, published only after approval).
 *
 * Rules enforced here, used by the Worker and the website:
 * - Belfast only: a listed venue, or another venue whose address has a Belfast
 *   postcode (BT1–BT17).
 * - Six categories: concerts, sport, theatre, comedy, festivals, exhibitions.
 * - No images, and no imported text. The summary is written by the owner, who
 *   must confirm that before publishing ("ownWordsConfirmed").
 * - Drafts are never public. Publishing is a separate owner action.
 * - Owner notes and the source note are private and never in the public view.
 */

export const BELFAST_EVENT_SCHEMA_VERSION = 1;

export const BELFAST_EVENT_CATEGORIES = ["concert", "sport", "theatre", "comedy", "festival", "exhibition"] as const;
export type BelfastEventCategory = (typeof BELFAST_EVENT_CATEGORIES)[number];

export const BELFAST_EVENT_CATEGORY_LABELS: Record<BelfastEventCategory, string> = {
  concert: "Concerts",
  sport: "Sport",
  theatre: "Theatre",
  comedy: "Comedy",
  festival: "Festivals",
  exhibition: "Exhibitions",
};

/** Singular labels for an individual listing. */
export const BELFAST_EVENT_CATEGORY_SINGULAR: Record<BelfastEventCategory, string> = {
  concert: "Concert",
  sport: "Sport",
  theatre: "Theatre",
  comedy: "Comedy",
  festival: "Festival",
  exhibition: "Exhibition",
};

export type BelfastVenue = {
  id: string;
  name: string;
  /** Short public address line (area + postcode district). */
  area: string;
};

/**
 * Belfast venues the owner can pick from. Facts only (name and area); no venue
 * descriptions or logos. Venue names change (e.g. SSE Arena → The O2 Belfast),
 * so "other" lets the owner enter a current name with a Belfast postcode.
 */
export const BELFAST_VENUES: readonly BelfastVenue[] = [
  { id: "the-o2-belfast", name: "The O2 Belfast", area: "Titanic Quarter, Belfast BT3" },
  { id: "ulster-hall", name: "Ulster Hall", area: "Bedford Street, Belfast BT2" },
  { id: "waterfront-hall", name: "Belfast Waterfront", area: "Lanyon Place, Belfast BT1" },
  { id: "grand-opera-house", name: "Grand Opera House", area: "Great Victoria Street, Belfast BT2" },
  { id: "lyric-theatre", name: "Lyric Theatre", area: "Ridgeway Street, Belfast BT9" },
  { id: "mac-belfast", name: "The MAC", area: "Cathedral Quarter, Belfast BT1" },
  { id: "the-empire", name: "The Empire Music Hall", area: "Botanic Avenue, Belfast BT7" },
  { id: "limelight", name: "Limelight Belfast", area: "Ormeau Avenue, Belfast BT2" },
  { id: "national-stadium-windsor-park", name: "National Football Stadium at Windsor Park", area: "Donegall Avenue, Belfast BT12" },
  { id: "kingspan-stadium", name: "Kingspan Stadium", area: "Ravenhill Park, Belfast BT6" },
  { id: "casement-park", name: "Casement Park", area: "Andersonstown Road, Belfast BT11" },
  { id: "the-oval", name: "The Oval", area: "Mersey Street, Belfast BT4" },
  { id: "titanic-exhibition-centre", name: "Titanic Exhibition Centre", area: "Titanic Quarter, Belfast BT3" },
  { id: "titanic-belfast", name: "Titanic Belfast", area: "Titanic Quarter, Belfast BT3" },
  { id: "botanic-gardens", name: "Botanic Gardens", area: "Stranmillis Road, Belfast BT7" },
  { id: "ormeau-park", name: "Ormeau Park", area: "Ormeau Road, Belfast BT7" },
  { id: "belfast-city-hall", name: "Belfast City Hall grounds", area: "Donegall Square, Belfast BT1" },
  { id: "ulster-museum", name: "Ulster Museum", area: "Botanic Gardens, Belfast BT9" },
];

export const BELFAST_VENUE_OTHER = "other";

export const BELFAST_EVENT_STATUSES = ["draft", "published", "postponed", "cancelled"] as const;
export type BelfastEventStatus = (typeof BELFAST_EVENT_STATUSES)[number];

export const BELFAST_EVENT_STATUS_LABELS: Record<BelfastEventStatus, string> = {
  draft: "Draft (not public)",
  published: "Published",
  postponed: "Postponed",
  cancelled: "Cancelled",
};

const LIMITS = {
  title: 120,
  summary: 400,
  venueName: 120,
  venueArea: 160,
  url: 300,
  note: 1000,
} as const;

export type BelfastEventRecord = {
  schemaVersion: number;
  /** URL-safe id, e.g. "belfast-giants-v-cardiff-devils-2026-12-05". Matches the request EVENT_ID pattern. */
  id: string;
  version: number;
  status: BelfastEventStatus;
  title: string;
  category: BelfastEventCategory;
  venueId: string;
  venueName: string;
  venueArea: string;
  /** Europe/London YYYY-MM-DD */
  date: string;
  /** Optional Europe/London HH:MM start time. */
  startTime?: string;
  /** Optional approximate finish time, to help plan return pickups. */
  endTime?: string;
  /** Owner-written summary (plain text). */
  summary: string;
  /** Optional official information link (https). */
  officialUrl?: string;
  /** Owner confirmed the summary is in their own words (required to publish). */
  ownWordsConfirmed: boolean;
  /** PRIVATE: where the owner found the event (never public). */
  sourceNote?: string;
  /** PRIVATE: owner notes (never public). */
  ownerNotes?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

/** What the website may show. No private notes, no source, no version. */
export type BelfastEventPublic = {
  id: string;
  status: Exclude<BelfastEventStatus, "draft">;
  title: string;
  category: BelfastEventCategory;
  categoryLabel: string;
  venueName: string;
  venueArea: string;
  date: string;
  startTime?: string;
  endTime?: string;
  summary: string;
  officialUrl?: string;
};

export type BelfastEventInput = Record<string, unknown>;

export type BelfastEventValidation =
  | { ok: true; value: Omit<BelfastEventRecord, "schemaVersion" | "id" | "version" | "status" | "createdAt" | "updatedAt" | "publishedAt"> }
  | { ok: false; errors: Record<string, string> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const BELFAST_EVENT_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
/** Belfast postcode districts BT1–BT17. */
const BELFAST_POSTCODE = /\bBT(?:[1-9]|1[0-7])\b/i;

function clean(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  // Plain text only: strip control characters, collapse whitespace, no markup.
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? null : text;
}

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayInLondon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export function belfastEventSlug(title: string, date: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
  return `${base || "event"}-${date}`;
}

export function validateBelfastEventInput(input: BelfastEventInput): BelfastEventValidation {
  const errors: Record<string, string> = {};
  const field = (key: string, max: number, required: boolean, label: string): string => {
    const value = clean(input[key], max);
    if (value === null) {
      errors[key] = `${label} is too long (maximum ${max} characters).`;
      return "";
    }
    if (required && !value) errors[key] = `${label} is required.`;
    return value;
  };

  const title = field("title", LIMITS.title, true, "Event name");
  if (/[<>]/.test(title)) errors.title = "Use plain text only.";

  const category = input.category;
  if (typeof category !== "string" || !(BELFAST_EVENT_CATEGORIES as readonly string[]).includes(category)) {
    errors.category = "Choose a category.";
  }

  const venueId = typeof input.venueId === "string" ? input.venueId : "";
  let venueName = "";
  let venueArea = "";
  const listed = BELFAST_VENUES.find((v) => v.id === venueId);
  if (listed) {
    venueName = listed.name;
    venueArea = listed.area;
  } else if (venueId === BELFAST_VENUE_OTHER) {
    venueName = field("venueName", LIMITS.venueName, true, "Venue name");
    venueArea = field("venueArea", LIMITS.venueArea, true, "Venue address");
    if (venueArea && !BELFAST_POSTCODE.test(venueArea)) {
      errors.venueArea = "Belfast events only: include a Belfast postcode (BT1–BT17).";
    }
  } else {
    errors.venueId = "Choose a Belfast venue.";
  }

  const date = field("date", 10, true, "Date");
  if (date && !isRealDate(date)) errors.date = "Enter a valid date.";
  const startTime = field("startTime", 5, false, "Start time");
  if (startTime && !TIME.test(startTime)) errors.startTime = "Use HH:MM.";
  const endTime = field("endTime", 5, false, "Finish time");
  if (endTime && !TIME.test(endTime)) errors.endTime = "Use HH:MM.";

  const summary = field("summary", LIMITS.summary, true, "Summary");
  if (/[<>]/.test(summary)) errors.summary = "Use plain text only.";

  const officialUrl = field("officialUrl", LIMITS.url, false, "Official link");
  if (officialUrl) {
    try {
      const url = new URL(officialUrl);
      if (url.protocol !== "https:" || url.username || url.password) errors.officialUrl = "Use an https:// link.";
    } catch {
      errors.officialUrl = "Enter a full link starting https://";
    }
  }

  const sourceNote = field("sourceNote", LIMITS.note, false, "Source note");
  const ownerNotes = field("ownerNotes", LIMITS.note, false, "Notes");
  const ownWordsConfirmed = input.ownWordsConfirmed === true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      category: category as BelfastEventCategory,
      venueId: listed ? listed.id : BELFAST_VENUE_OTHER,
      venueName,
      venueArea,
      date,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      summary,
      ...(officialUrl ? { officialUrl } : {}),
      ownWordsConfirmed,
      ...(sourceNote ? { sourceNote } : {}),
      ...(ownerNotes ? { ownerNotes } : {}),
    },
  };
}

export type BelfastEventAction =
  | { type: "save"; fields: BelfastEventInput }
  | { type: "publish" }
  | { type: "unpublish" }
  | { type: "postpone" }
  | { type: "cancel" };

export type BelfastEventActionResult =
  | { ok: true; record: BelfastEventRecord }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Create a new DRAFT. New events are never public until published. */
export function createBelfastEvent(input: BelfastEventInput, now = new Date()): BelfastEventActionResult {
  const v = validateBelfastEventInput(input);
  if (!v.ok) return { ok: false, error: "Please check the highlighted fields.", errors: v.errors };
  const at = now.toISOString();
  return {
    ok: true,
    record: {
      schemaVersion: BELFAST_EVENT_SCHEMA_VERSION,
      id: belfastEventSlug(v.value.title, v.value.date),
      version: 1,
      status: "draft",
      ...v.value,
      createdAt: at,
      updatedAt: at,
    },
  };
}

export function applyBelfastEventAction(
  record: BelfastEventRecord,
  action: BelfastEventAction,
  now = new Date(),
): BelfastEventActionResult {
  const at = now.toISOString();
  const next = (patch: Partial<BelfastEventRecord>): BelfastEventActionResult => ({
    ok: true,
    record: { ...record, ...patch, version: record.version + 1, updatedAt: at },
  });
  switch (action.type) {
    case "save": {
      const v = validateBelfastEventInput(action.fields);
      if (!v.ok) return { ok: false, error: "Please check the highlighted fields.", errors: v.errors };
      // The id never changes once created, so links and requests keep working.
      const patch: Partial<BelfastEventRecord> = { ...v.value };
      if (!v.value.startTime) patch.startTime = undefined;
      if (!v.value.endTime) patch.endTime = undefined;
      if (!v.value.officialUrl) patch.officialUrl = undefined;
      if (!v.value.sourceNote) patch.sourceNote = undefined;
      if (!v.value.ownerNotes) patch.ownerNotes = undefined;
      // Editing the public text of a live listing needs the own-words confirmation again.
      if (record.status !== "draft" && !v.value.ownWordsConfirmed) {
        return { ok: false, error: "Confirm the summary is in your own words before saving a published event.", errors: { ownWordsConfirmed: "Required for published events." } };
      }
      return next(patch);
    }
    case "publish": {
      if (record.status === "published") return { ok: false, error: "This event is already published." };
      if (!record.ownWordsConfirmed) {
        return { ok: false, error: "Confirm the summary is in your own words (no copied text or images) before publishing." };
      }
      if (record.date < todayInLondon(now)) return { ok: false, error: "This event date has passed." };
      return next({ status: "published", publishedAt: record.publishedAt ?? at });
    }
    case "unpublish":
      if (record.status === "draft") return { ok: false, error: "This event is not published." };
      return next({ status: "draft" });
    case "postpone":
      if (record.status === "draft") return { ok: false, error: "Publish the event first, or keep it as a draft." };
      return next({ status: "postponed" });
    case "cancel":
      if (record.status === "draft") return { ok: false, error: "Drafts are not public; edit or leave it instead." };
      return next({ status: "cancelled" });
    default:
      return { ok: false, error: "Unknown action." };
  }
}

/** Public projection, or null when the event must not be shown (drafts, past events). */
export function toBelfastEventPublic(record: BelfastEventRecord, now = new Date()): BelfastEventPublic | null {
  if (record.status === "draft") return null;
  if (record.date < todayInLondon(now)) return null;
  return {
    id: record.id,
    status: record.status,
    title: record.title,
    category: record.category,
    categoryLabel: BELFAST_EVENT_CATEGORY_SINGULAR[record.category],
    venueName: record.venueName,
    venueArea: record.venueArea,
    date: record.date,
    ...(record.startTime ? { startTime: record.startTime } : {}),
    ...(record.endTime ? { endTime: record.endTime } : {}),
    summary: record.summary,
    ...(record.officialUrl ? { officialUrl: record.officialUrl } : {}),
  };
}

export function sortBelfastEvents<T extends { date: string; startTime?: string; title: string }>(events: T[]): T[] {
  return [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.startTime ?? "99").localeCompare(b.startTime ?? "99") || a.title.localeCompare(b.title),
  );
}

/** Customers may request a transfer for a listed event only while it is published (not postponed/cancelled). */
export function belfastEventAcceptsRequests(event: Pick<BelfastEventPublic, "status">): boolean {
  return event.status === "published";
}
