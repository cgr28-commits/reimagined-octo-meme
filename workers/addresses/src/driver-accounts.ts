/**
 * Stage 1 — individual driver accounts (staging only).
 *
 * Scope: invite / apply, documents with expiry, owner approve / decline / suspend /
 * reinstate / remove, availability flag, single-use sign-in links, individual sessions,
 * Contact Office message fallback, private driver-support number, permanent audit log.
 *
 * Out of scope (later stages): jobs, offers, money, notifications, file uploads.
 *
 * Only active when the Worker has a DRIVER_DB (D1) binding. Production has none, so
 * every route here answers 404 there.
 */

export type D1Result<T> = { results?: T[] };
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1PreparedLike;
  batch(statements: D1PreparedLike[]): Promise<unknown[]>;
}

export type DriverAccountsEnv = {
  DRIVER_DB?: D1Like;
};

/** An upcoming confirmed booking the driver is assigned to (read-only view). */
export type DriverUpcomingBooking = {
  reference: string;
  tripDate: string;
  tripTime: string;
  pickup: string;
  customerName: string;
  leg: "outbound" | "return";
};

export type DriverAccountsDeps = {
  ownerAuthorized: (request: Request) => boolean;
  /**
   * Read-only lookup of upcoming confirmed bookings assigned to this driver.
   * Must never change a booking. Used to raise an owner alert on suspension.
   */
  findUpcomingBookingsForDriver?: (driver: { id: string; name: string; email: string; mobile: string }) => Promise<DriverUpcomingBooking[]>;
  corsHeaders: (origin: string | null) => HeadersInit;
  now?: () => Date;
  randomToken?: (prefix: string) => string;
};

export const DRIVER_ACCOUNT_SESSION_HEADER = "X-Driver-Account-Session";

export const DRIVER_STATUSES = ["invited", "applied", "approved", "declined", "suspended", "removed"] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DOCUMENT_KINDS = [
  "operator_licence",
  "phv_driver_licence",
  "dvla_licence",
  "vehicle_licence",
  "insurance",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Documents that must be accepted and in date before a driver can be approved. */
export const REQUIRED_FOR_APPROVAL: DocumentKind[] = [
  "operator_licence",
  "phv_driver_licence",
  "vehicle_licence",
  "insurance",
];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  operator_licence: "Taxi operator licence",
  phv_driver_licence: "Taxi driver licence",
  dvla_licence: "DVA/DVLA driving licence",
  vehicle_licence: "Vehicle licence",
  insurance: "Hire & reward insurance",
};

/** The customer-facing AI receptionist line — never usable as the driver-support number. */
export const AI_RECEPTIONIST_DIGITS = "02896022952";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGN_IN_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 30;

export const MESSAGE_CATEGORIES = {
  general: { label: "Message", urgent: false },
  running_late: { label: "Running late", urgent: false },
  breakdown: { label: "Vehicle breakdown", urgent: true },
  accident: { label: "Accident", urgent: true },
  cant_complete: { label: "Can't complete a job", urgent: true },
} as const;
export type MessageCategory = keyof typeof MESSAGE_CATEGORIES;
const MAX_OFFICE_MESSAGES_PER_DAY = 20;

type DriverRow = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  status: DriverStatus;
  status_reason: string;
  available: number;
  operator_name: string;
  operator_licence_number: string;
  vehicle_summary: string;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  driver_id: string;
  kind: DocumentKind;
  reference: string;
  expires_on: string;
  file_key: string | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  review_note: string;
  submitted_at: string;
  reviewed_at: string | null;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ---------- small helpers ----------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function defaultRandomToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}${bytesToBase64Url(bytes)}`;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Normalise a UK phone number to digits starting 0 (e.g. 07700900123). Empty if invalid. */
export function normaliseUkPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+44")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0044")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("44") && digits.length === 12) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, "");
  return /^0\d{10}$/.test(digits) ? digits : "";
}

function isYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000,
  );
}

export type DocumentState = "missing" | "pending" | "rejected" | "expired" | "expiring" | "valid";

export function documentState(doc: Pick<DocumentRow, "status" | "expires_on"> | undefined, today: string): DocumentState {
  if (!doc) return "missing";
  if (doc.status === "pending") return "pending";
  if (doc.status === "rejected") return "rejected";
  const days = daysBetween(today, doc.expires_on);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
}

/** Latest relevant document per kind (accepted beats pending beats rejected; newest first). */
export function currentDocuments(docs: DocumentRow[]): Partial<Record<DocumentKind, DocumentRow>> {
  const rank = { accepted: 3, pending: 2, rejected: 1, superseded: 0 } as const;
  const out: Partial<Record<DocumentKind, DocumentRow>> = {};
  for (const doc of docs) {
    if (doc.status === "superseded") continue;
    const existing = out[doc.kind];
    if (
      !existing ||
      rank[doc.status] > rank[existing.status] ||
      (rank[doc.status] === rank[existing.status] && doc.submitted_at > existing.submitted_at)
    ) {
      out[doc.kind] = doc;
    }
  }
  return out;
}

export function missingForApproval(docs: DocumentRow[], today: string): DocumentKind[] {
  const current = currentDocuments(docs);
  return REQUIRED_FOR_APPROVAL.filter((kind) => {
    const doc = current[kind];
    if (!doc || doc.status !== "accepted") return true;
    return daysBetween(today, doc.expires_on) < 0;
  });
}

/**
 * Whether a driver may be sent new work offers (Stage 2 uses this as its gate).
 * Suspended, declined, removed, unavailable or out-of-date drivers never qualify.
 */
export function canReceiveOffers(
  driver: Pick<DriverRow, "status" | "available">,
  docs: DocumentRow[],
  today: string,
): boolean {
  return driver.status === "approved" && driver.available === 1 && missingForApproval(docs, today).length === 0;
}

function publicDocument(doc: DocumentRow, today: string) {
  return {
    id: doc.id,
    kind: doc.kind,
    label: DOCUMENT_LABELS[doc.kind],
    reference: doc.reference,
    expiresOn: doc.expires_on,
    status: doc.status,
    state: documentState(doc, today),
    reviewNote: doc.review_note,
    submittedAt: doc.submitted_at,
    reviewedAt: doc.reviewed_at,
    hasFile: Boolean(doc.file_key),
  };
}

function documentSummary(docs: DocumentRow[], today: string) {
  const current = currentDocuments(docs);
  return DOCUMENT_KINDS.map((kind) => ({
    kind,
    label: DOCUMENT_LABELS[kind],
    required: REQUIRED_FOR_APPROVAL.includes(kind),
    state: documentState(current[kind], today),
    expiresOn: current[kind]?.expires_on ?? null,
  }));
}

function attentionFor(driver: DriverRow, docs: DocumentRow[], today: string): string[] {
  const notes: string[] = [];
  if (driver.status === "applied") notes.push("Waiting for your review");
  for (const item of documentSummary(docs, today)) {
    if (!item.required && item.state === "missing") continue;
    if (item.state === "pending") notes.push(`${item.label} to check`);
    if (driver.status !== "approved" && driver.status !== "suspended") continue;
    if (item.state === "expired") notes.push(`${item.label} expired`);
    if (item.state === "expiring") notes.push(`${item.label} expires ${item.expiresOn}`);
    if (item.state === "missing" || item.state === "rejected") notes.push(`${item.label} missing`);
  }
  return notes;
}

// ---------- data access ----------

function auditStatement(
  db: D1Like,
  at: string,
  actorType: "owner" | "driver" | "system",
  actorId: string,
  action: string,
  driverId: string | null,
  detail: Record<string, unknown> = {},
): D1PreparedLike {
  return db
    .prepare("INSERT INTO audit_log (at, actor_type, actor_id, action, driver_id, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(at, actorType, actorId, action, driverId, JSON.stringify(detail));
}

async function getDriver(db: D1Like, id: string): Promise<DriverRow | null> {
  return db.prepare("SELECT * FROM drivers WHERE id = ?").bind(id).first<DriverRow>();
}

async function getDocuments(db: D1Like, driverId: string): Promise<DocumentRow[]> {
  const res = await db
    .prepare("SELECT * FROM driver_documents WHERE driver_id = ? ORDER BY submitted_at DESC")
    .bind(driverId)
    .all<DocumentRow>();
  return res.results ?? [];
}

function revokeSessionsStatement(db: D1Like, driverId: string, at: string): D1PreparedLike {
  return db
    .prepare("UPDATE driver_sessions SET revoked_at = ? WHERE driver_id = ? AND revoked_at IS NULL")
    .bind(at, driverId);
}

function expireLinksStatement(db: D1Like, driverId: string, at: string): D1PreparedLike {
  return db
    .prepare("UPDATE driver_links SET used_at = ? WHERE driver_id = ? AND used_at IS NULL")
    .bind(at, driverId);
}

async function getSetting(db: D1Like, key: string): Promise<string> {
  const row = await db.prepare("SELECT value FROM owner_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? "";
}

// ---------- request handling ----------

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function json(body: unknown, status: number, cors: HeadersInit): Response {
  const headers = new Headers(cors);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function corsWithSessionHeader(cors: HeadersInit): HeadersInit {
  const headers = new Headers(cors);
  const allow = headers.get("Access-Control-Allow-Headers") || "";
  if (!allow.toLowerCase().includes(DRIVER_ACCOUNT_SESSION_HEADER.toLowerCase())) {
    headers.set("Access-Control-Allow-Headers", allow ? `${allow}, ${DRIVER_ACCOUNT_SESSION_HEADER}` : DRIVER_ACCOUNT_SESSION_HEADER);
  }
  return headers;
}

export function isDriverAccountsPath(pathname: string): boolean {
  return pathname.startsWith("/owner/driver-accounts") || pathname.startsWith("/driver-portal/account");
}

/**
 * Returns a Response for Stage 1 routes, or null if the path is not one of them.
 */
export async function handleDriverAccountsRequest(
  request: Request,
  env: DriverAccountsEnv,
  deps: DriverAccountsDeps,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isDriverAccountsPath(url.pathname)) return null;
  const cors = corsWithSessionHeader(deps.corsHeaders(request.headers.get("Origin")));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const db = env.DRIVER_DB;
  if (!db) return json({ ok: false, error: "Not found." }, 404, cors);
  const ctx: Ctx = {
    db,
    cors,
    now: deps.now ?? (() => new Date()),
    token: deps.randomToken ?? defaultRandomToken,
    findUpcomingBookingsForDriver: deps.findUpcomingBookingsForDriver,
  };
  try {
    if (url.pathname.startsWith("/owner/driver-accounts")) {
      if (!deps.ownerAuthorized(request)) throw new HttpError(401, "Owner sign-in required.");
      return await ownerRoute(request, url, ctx);
    }
    return await driverRoute(request, url, ctx);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ ok: false, error: error.message, ...error.extra }, error.status, cors);
    }
    console.error("driver-accounts error", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Something went wrong." }, 500, cors);
  }
}

type Ctx = {
  db: D1Like;
  cors: HeadersInit;
  now: () => Date;
  token: (prefix: string) => string;
  findUpcomingBookingsForDriver?: DriverAccountsDeps["findUpcomingBookingsForDriver"];
};

// ---------- owner routes ----------

async function ownerRoute(request: Request, url: URL, ctx: Ctx): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const { db, cors } = ctx;
  const at = ctx.now().toISOString();
  const today = ymd(ctx.now());

  if (path === "/owner/driver-accounts" && request.method === "GET") {
    const drivers = (await db.prepare("SELECT * FROM drivers WHERE status <> 'removed' ORDER BY created_at DESC").all<DriverRow>()).results ?? [];
    const docs = (await db.prepare("SELECT * FROM driver_documents WHERE status <> 'superseded'").all<DocumentRow>()).results ?? [];
    const unread = (await db
      .prepare(
        "SELECT driver_id, COUNT(*) AS n, SUM(CASE WHEN priority = 'urgent' AND handled_at IS NULL THEN 1 ELSE 0 END) AS urgent FROM driver_office_messages WHERE read_at IS NULL OR (priority = 'urgent' AND handled_at IS NULL) GROUP BY driver_id",
      )
      .all<{ driver_id: string; n: number; urgent: number }>()).results ?? [];
    const unreadBy = new Map(unread.map((r) => [r.driver_id, { n: Number(r.n), urgent: Number(r.urgent ?? 0) }]));
    const rows = drivers.map((d) => {
      const mine = docs.filter((doc) => doc.driver_id === d.id);
      const counts = unreadBy.get(d.id) ?? { n: 0, urgent: 0 };
      return {
        ...ownerDriverView(d),
        documents: documentSummary(mine, today),
        attention: attentionFor(d, mine, today),
        unreadMessages: counts.n,
        urgentMessages: counts.urgent,
        canReceiveOffers: canReceiveOffers(d, mine, today),
      };
    });
    // Urgent reports first, then unread messages, then anything needing attention.
    const rank = (r: (typeof rows)[number]) => (r.urgentMessages ? 0 : r.unreadMessages ? 1 : r.attention.length ? 2 : 3);
    rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return json({ ok: true, drivers: rows, alerts: await openAlerts(db) }, 200, cors);
  }

  if (path === "/owner/driver-accounts/summary" && request.method === "GET") {
    const urgent = (await db
      .prepare(
        "SELECT m.id, m.driver_id, d.name AS driver_name, m.category, m.body, m.created_at FROM driver_office_messages m JOIN drivers d ON d.id = m.driver_id WHERE m.priority = 'urgent' AND m.handled_at IS NULL AND d.status <> 'removed' ORDER BY m.created_at DESC LIMIT 20",
      )
      .all<{ id: string; driver_id: string; driver_name: string; category: string; body: string; created_at: string }>()).results ?? [];
    const unread = await db
      .prepare("SELECT COUNT(*) AS n FROM driver_office_messages m JOIN drivers d ON d.id = m.driver_id WHERE m.read_at IS NULL AND d.status <> 'removed'")
      .first<{ n: number }>();
    return json(
      {
        ok: true,
        unreadMessages: Number(unread?.n ?? 0),
        urgent: urgent.map((m) => ({
          id: m.id,
          driverId: m.driver_id,
          driverName: m.driver_name,
          category: m.category,
          categoryLabel: categoryLabel(m.category),
          body: m.body,
          createdAt: m.created_at,
        })),
        alerts: await openAlerts(db),
      },
      200,
      cors,
    );
  }

  if (path === "/owner/driver-accounts/detail" && request.method === "GET") {
    const id = text(url.searchParams.get("id"), 64);
    const driver = await getDriver(db, id);
    if (!driver) throw new HttpError(404, "Driver not found.");
    const docs = await getDocuments(db, id);
    const audit = (await db
      .prepare("SELECT seq, at, actor_type, action, detail FROM audit_log WHERE driver_id = ? ORDER BY seq DESC LIMIT 100")
      .bind(id)
      .all<{ seq: number; at: string; actor_type: string; action: string; detail: string }>()).results ?? [];
    const messages = (await db
      .prepare(
        "SELECT id, body, created_at, read_at, priority, category, handled_at FROM driver_office_messages WHERE driver_id = ? ORDER BY CASE WHEN priority = 'urgent' AND handled_at IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 50",
      )
      .bind(id)
      .all<{ id: string; body: string; created_at: string; read_at: string | null; priority: string; category: string; handled_at: string | null }>()).results ?? [];
    return json(
      {
        ok: true,
        driver: ownerDriverView(driver),
        documents: docs.map((d) => publicDocument(d, today)),
        summary: documentSummary(docs, today),
        attention: attentionFor(driver, docs, today),
        missingForApproval: missingForApproval(docs, today),
        audit: audit.map((a) => ({ ...a, detail: safeParse(a.detail) })),
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.created_at,
          readAt: m.read_at,
          urgent: m.priority === "urgent",
          category: m.category,
          categoryLabel: categoryLabel(m.category),
          handledAt: m.handled_at,
        })),
        canReceiveOffers: canReceiveOffers(driver, docs, today),
        alerts: (await openAlerts(db)).filter((a) => a.driverId === id),
      },
      200,
      cors,
    );
  }

  if (path === "/owner/driver-accounts/invite" && request.method === "POST") {
    const body = await readJson(request);
    const name = text(body.name, 80);
    const email = text(body.email, 120).toLowerCase();
    const mobileRaw = text(body.mobile, 30);
    const mobile = mobileRaw ? normaliseUkPhone(mobileRaw) : "";
    if (!name) throw new HttpError(400, "Enter the driver's name.");
    if (!isEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    if (mobileRaw && !mobile) throw new HttpError(400, "Enter a valid UK mobile number.");
    const existing = await db
      .prepare("SELECT id FROM drivers WHERE lower(email) = ? AND status <> 'removed'")
      .bind(email)
      .first<{ id: string }>();
    if (existing) throw new HttpError(409, "A driver with this email already exists.", { driverId: existing.id });
    const id = newId("drv");
    const token = ctx.token("dinv_");
    const expires = new Date(ctx.now().getTime() + INVITE_TTL_MS).toISOString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO drivers (id, name, email, mobile, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'invited', ?, ?)",
        )
        .bind(id, name, email, mobile, at, at),
      db
        .prepare("INSERT INTO driver_links (token_hash, driver_id, purpose, created_at, expires_at) VALUES (?, ?, 'invite', ?, ?)")
        .bind(await hashToken(token), id, at, expires),
      auditStatement(db, at, "owner", "owner", "driver.invited", id, { name, email }),
    ]);
    // Stage 1 sends nothing: the owner copies the link and shares it personally.
    return json({ ok: true, driverId: id, inviteToken: token, expiresAt: expires }, 201, cors);
  }

  if (path === "/owner/driver-accounts/sign-in-link" && request.method === "POST") {
    const body = await readJson(request);
    const driver = await getDriver(db, text(body.driverId, 64));
    if (!driver) throw new HttpError(404, "Driver not found.");
    if (driver.status !== "approved" && driver.status !== "applied") {
      throw new HttpError(409, `A ${driver.status} driver cannot sign in.`);
    }
    const token = ctx.token("dsig_");
    const expires = new Date(ctx.now().getTime() + SIGN_IN_TTL_MS).toISOString();
    await db.batch([
      // Only the newest sign-in link works.
      db
        .prepare("UPDATE driver_links SET used_at = ? WHERE driver_id = ? AND purpose = 'sign_in' AND used_at IS NULL")
        .bind(at, driver.id),
      db
        .prepare("INSERT INTO driver_links (token_hash, driver_id, purpose, created_at, expires_at) VALUES (?, ?, 'sign_in', ?, ?)")
        .bind(await hashToken(token), driver.id, at, expires),
      auditStatement(db, at, "owner", "owner", "driver.sign_in_link_created", driver.id),
    ]);
    return json({ ok: true, signInToken: token, expiresAt: expires }, 201, cors);
  }

  if (path === "/owner/driver-accounts/status" && request.method === "POST") {
    const body = await readJson(request);
    const action = text(body.action, 20);
    const reason = text(body.reason, 300);
    const driver = await getDriver(db, text(body.driverId, 64));
    if (!driver) throw new HttpError(404, "Driver not found.");
    return json(await changeStatus(ctx, driver, action, reason), 200, cors);
  }

  if (path === "/owner/driver-accounts/document-review" && request.method === "POST") {
    const body = await readJson(request);
    const decision = text(body.decision, 10);
    const note = text(body.note, 300);
    if (decision !== "accept" && decision !== "reject") throw new HttpError(400, "Choose accept or reject.");
    if (decision === "reject" && !note) throw new HttpError(400, "Give a reason so the driver knows what to fix.");
    const doc = await db
      .prepare("SELECT * FROM driver_documents WHERE id = ?")
      .bind(text(body.documentId, 64))
      .first<DocumentRow>();
    if (!doc) throw new HttpError(404, "Document not found.");
    if (doc.status !== "pending") throw new HttpError(409, "This document has already been reviewed.");
    if (decision === "accept" && daysBetween(today, doc.expires_on) < 0) {
      throw new HttpError(409, "This document has expired and cannot be accepted.");
    }
    const statements = [
      db
        .prepare("UPDATE driver_documents SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
        .bind(decision === "accept" ? "accepted" : "rejected", note, at, doc.id),
      auditStatement(db, at, "owner", "owner", `document.${decision === "accept" ? "accepted" : "rejected"}`, doc.driver_id, {
        documentId: doc.id,
        kind: doc.kind,
        expiresOn: doc.expires_on,
        note,
      }),
    ];
    if (decision === "accept") {
      statements.unshift(
        db
          .prepare(
            "UPDATE driver_documents SET status = 'superseded' WHERE driver_id = ? AND kind = ? AND id <> ? AND status IN ('accepted','pending','rejected')",
          )
          .bind(doc.driver_id, doc.kind, doc.id),
      );
    }
    await db.batch(statements);
    return json({ ok: true }, 200, cors);
  }

  if (path === "/owner/driver-accounts/messages/read" && request.method === "POST") {
    const body = await readJson(request);
    const driverId = text(body.driverId, 64);
    await db
      .prepare("UPDATE driver_office_messages SET read_at = ? WHERE driver_id = ? AND read_at IS NULL")
      .bind(at, driverId)
      .run();
    // Urgent reports stay at the top until marked handled.
    return json({ ok: true }, 200, cors);
  }

  if (path === "/owner/driver-accounts/messages/handled" && request.method === "POST") {
    const body = await readJson(request);
    const messageId = text(body.messageId, 64);
    const msg = await db
      .prepare("SELECT id, driver_id, priority, handled_at FROM driver_office_messages WHERE id = ?")
      .bind(messageId)
      .first<{ id: string; driver_id: string; priority: string; handled_at: string | null }>();
    if (!msg) throw new HttpError(404, "Message not found.");
    if (msg.handled_at) return json({ ok: true }, 200, cors);
    await db.batch([
      db.prepare("UPDATE driver_office_messages SET handled_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ?").bind(at, at, msg.id),
      auditStatement(db, at, "owner", "owner", "message.handled", msg.driver_id, { messageId: msg.id, priority: msg.priority }),
    ]);
    return json({ ok: true }, 200, cors);
  }

  if (path === "/owner/driver-accounts/alerts/resolve" && request.method === "POST") {
    const body = await readJson(request);
    const alertId = text(body.alertId, 64);
    const note = text(body.note, 300);
    const alert = await db
      .prepare("SELECT id, driver_id, kind, resolved_at FROM owner_alerts WHERE id = ?")
      .bind(alertId)
      .first<{ id: string; driver_id: string | null; kind: string; resolved_at: string | null }>();
    if (!alert) throw new HttpError(404, "Alert not found.");
    if (alert.resolved_at) return json({ ok: true }, 200, cors);
    await db.batch([
      db.prepare("UPDATE owner_alerts SET resolved_at = ?, resolution_note = ? WHERE id = ? AND resolved_at IS NULL").bind(at, note, alert.id),
      auditStatement(db, at, "owner", "owner", "alert.reviewed", alert.driver_id, { alertId: alert.id, kind: alert.kind, note }),
    ]);
    return json({ ok: true }, 200, cors);
  }

  if (path === "/owner/driver-accounts/audit" && request.method === "GET") {
    const rows = (await db
      .prepare("SELECT seq, at, actor_type, actor_id, action, driver_id, detail FROM audit_log ORDER BY seq DESC LIMIT 200")
      .all<Record<string, unknown> & { detail: string }>()).results ?? [];
    return json({ ok: true, audit: rows.map((r) => ({ ...r, detail: safeParse(r.detail) })) }, 200, cors);
  }

  if (path === "/owner/driver-accounts/support-contact") {
    if (request.method === "GET") {
      return json({ ok: true, phone: await getSetting(db, "driver_support_phone") }, 200, cors);
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const raw = text(body.phone, 30);
      const phone = raw ? normaliseUkPhone(raw) : "";
      if (raw && !phone) throw new HttpError(400, "Enter a valid UK phone number.");
      if (phone === AI_RECEPTIONIST_DIGITS) {
        throw new HttpError(400, "That is the customer AI receptionist line. Use a separate driver-support number.");
      }
      const statements = [
        phone
          ? db
              .prepare(
                "INSERT INTO owner_settings (key, value, updated_at) VALUES ('driver_support_phone', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
              )
              .bind(phone, at)
          : db.prepare("DELETE FROM owner_settings WHERE key = 'driver_support_phone'"),
        // The number itself is not written to the audit log.
        auditStatement(db, at, "owner", "owner", phone ? "settings.driver_support_set" : "settings.driver_support_cleared", null),
      ];
      await db.batch(statements);
      return json({ ok: true, phone }, 200, cors);
    }
  }

  throw new HttpError(404, "Not found.");
}

function categoryLabel(category: string): string {
  return (MESSAGE_CATEGORIES as Record<string, { label: string }>)[category]?.label ?? "Message";
}

type AlertRow = { id: string; kind: string; driver_id: string | null; title: string; detail: string; created_at: string };

async function openAlerts(db: D1Like) {
  const rows = (await db
    .prepare("SELECT id, kind, driver_id, title, detail, created_at FROM owner_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 50")
    .all<AlertRow>()).results ?? [];
  return rows.map((r) => ({ id: r.id, kind: r.kind, driverId: r.driver_id, title: r.title, detail: safeParse(r.detail), createdAt: r.created_at }));
}

function ownerDriverView(d: DriverRow) {
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    mobile: d.mobile,
    status: d.status,
    statusReason: d.status_reason,
    available: d.available === 1,
    operatorName: d.operator_name,
    operatorLicenceNumber: d.operator_licence_number,
    vehicleSummary: d.vehicle_summary,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

const TRANSITIONS: Record<string, { from: DriverStatus[]; to: DriverStatus; needsReason: boolean; needsDocs: boolean; revoke: boolean }> = {
  approve: { from: ["applied"], to: "approved", needsReason: false, needsDocs: true, revoke: false },
  reinstate: { from: ["suspended"], to: "approved", needsReason: false, needsDocs: true, revoke: false },
  decline: { from: ["invited", "applied"], to: "declined", needsReason: true, needsDocs: false, revoke: true },
  suspend: { from: ["approved"], to: "suspended", needsReason: true, needsDocs: false, revoke: true },
  remove: { from: ["invited", "applied", "approved", "declined", "suspended"], to: "removed", needsReason: true, needsDocs: false, revoke: true },
};

async function changeStatus(ctx: Ctx, driver: DriverRow, action: string, reason: string) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new HttpError(400, "Unknown action.");
  if (!rule.from.includes(driver.status)) {
    throw new HttpError(409, `Cannot ${action} a driver who is ${driver.status}.`);
  }
  if (rule.needsReason && !reason) throw new HttpError(400, "Add a short reason. It is kept in the audit log.");
  const { db } = ctx;
  const at = ctx.now().toISOString();
  if (rule.needsDocs) {
    const missing = missingForApproval(await getDocuments(db, driver.id), ymd(ctx.now()));
    if (missing.length) {
      throw new HttpError(409, "Accept these in-date documents first.", {
        missing: missing.map((k) => ({ kind: k, label: DOCUMENT_LABELS[k] })),
      });
    }
  }
  const statements = [
    db
      .prepare(
        "UPDATE drivers SET status = ?, status_reason = ?, available = CASE WHEN ? = 'approved' THEN available ELSE 0 END, updated_at = ? WHERE id = ? AND status = ?",
      )
      .bind(rule.to, reason, rule.to, at, driver.id, driver.status),
    auditStatement(db, at, "owner", "owner", `driver.${rule.to}`, driver.id, {
      from: driver.status,
      reason,
      by: "Owner (owner sign-in)",
      at,
      ...(rule.revoke ? { sessionsRevoked: true, offersBlocked: true } : {}),
    }),
  ];
  if (rule.revoke) {
    statements.push(revokeSessionsStatement(db, driver.id, at), expireLinksStatement(db, driver.id, at));
  }
  await db.batch(statements);

  // Suspending or removing an approved driver: list their upcoming confirmed bookings for manual
  // review. Bookings are only read here — never cancelled, reassigned or refunded.
  let reviewBookings: DriverUpcomingBooking[] = [];
  if ((rule.to === "suspended" || rule.to === "removed") && driver.status === "approved") {
    let lookupFailed = false;
    try {
      reviewBookings = ctx.findUpcomingBookingsForDriver
        ? await ctx.findUpcomingBookingsForDriver({ id: driver.id, name: driver.name, email: driver.email, mobile: driver.mobile })
        : [];
    } catch (error) {
      lookupFailed = true;
      console.error("driver booking lookup failed", error instanceof Error ? error.message : error);
    }
    if (reviewBookings.length || lookupFailed) {
      const alertId = newId("alr");
      const verb = rule.to === "suspended" ? "suspended" : "removed";
      const title = lookupFailed
        ? `${driver.name} was ${verb} — check their upcoming bookings by hand`
        : `${driver.name} was ${verb} with ${reviewBookings.length} upcoming booking${reviewBookings.length === 1 ? "" : "s"}`;
      await db.batch([
        db
          .prepare("INSERT INTO owner_alerts (id, kind, driver_id, title, detail, created_at) VALUES (?, 'driver_bookings_review', ?, ?, ?, ?)")
          .bind(alertId, driver.id, title, JSON.stringify({ bookings: reviewBookings, lookupFailed, reason }), at),
        auditStatement(db, at, "system", "", "alert.raised", driver.id, {
          alertId,
          bookings: reviewBookings.map((b) => b.reference),
          lookupFailed,
        }),
      ]);
    }
  }
  return { ok: true, status: rule.to, reviewBookings };
}

// ---------- driver routes ----------

async function driverRoute(request: Request, url: URL, ctx: Ctx): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const { db, cors } = ctx;
  const at = ctx.now().toISOString();
  const today = ymd(ctx.now());

  if (path === "/driver-portal/account/accept-invite" && request.method === "POST") {
    const body = await readJson(request);
    const link = await peekLink(ctx, text(body.token, 200), "invite");
    const driver = await getDriver(db, link.driver_id);
    if (!driver || driver.status !== "invited") throw new HttpError(409, "This invitation is no longer valid.");
    const mobileRaw = text(body.mobile, 30);
    const mobile = mobileRaw ? normaliseUkPhone(mobileRaw) : driver.mobile;
    if (!mobile) throw new HttpError(400, "Enter a valid UK mobile number.");
    const operatorName = text(body.operatorName, 120);
    const operatorLicenceNumber = text(body.operatorLicenceNumber, 60);
    if (!operatorName || !operatorLicenceNumber) {
      throw new HttpError(400, "Enter your operator name and operator licence number.");
    }
    if (body.confirmOwnOperatorLicence !== true) {
      throw new HttpError(400, "Confirm that you hold your own taxi operator licence.");
    }
    await claimLink(ctx, link.tokenHash);
    const session = await createSessionStatements(ctx, driver.id);
    await db.batch([
      db
        .prepare(
          "UPDATE drivers SET status = 'applied', mobile = ?, operator_name = ?, operator_licence_number = ?, vehicle_summary = ?, updated_at = ? WHERE id = ? AND status = 'invited'",
        )
        .bind(mobile, operatorName, operatorLicenceNumber, text(body.vehicleSummary, 120), at, driver.id),
      ...session.statements,
      auditStatement(db, at, "driver", driver.id, "driver.applied", driver.id, { operatorName, operatorLicenceNumber }),
    ]);
    return json({ ok: true, sessionToken: session.token, expiresAt: session.expiresAt }, 200, cors);
  }

  if (path === "/driver-portal/account/sign-in" && request.method === "POST") {
    const body = await readJson(request);
    const link = await peekLink(ctx, text(body.token, 200), "sign_in");
    const driver = await getDriver(db, link.driver_id);
    if (!driver || (driver.status !== "approved" && driver.status !== "applied")) {
      throw new HttpError(403, "This account cannot sign in. Please contact the office.");
    }
    await claimLink(ctx, link.tokenHash);
    const session = await createSessionStatements(ctx, driver.id);
    await db.batch([...session.statements, auditStatement(db, at, "driver", driver.id, "driver.signed_in", driver.id)]);
    return json({ ok: true, sessionToken: session.token, expiresAt: session.expiresAt }, 200, cors);
  }

  // Everything below needs a valid individual session.
  const { driver, tokenHash } = await requireSession(request, ctx);

  if (path === "/driver-portal/account/me" && request.method === "GET") {
    const docs = await getDocuments(db, driver.id);
    const supportPhone = driver.status === "approved" ? await getSetting(db, "driver_support_phone") : "";
    return json(
      {
        ok: true,
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          mobile: driver.mobile,
          status: driver.status,
          available: driver.available === 1,
          operatorName: driver.operator_name,
          operatorLicenceNumber: driver.operator_licence_number,
          vehicleSummary: driver.vehicle_summary,
        },
        documents: docs.filter((d) => d.status !== "superseded").map((d) => publicDocument(d, today)),
        summary: documentSummary(docs, today),
        // Shown only to approved, signed-in drivers. Falls back to an in-app message.
        contactOffice: supportPhone ? { mode: "phone", phone: supportPhone } : { mode: "message" },
      },
      200,
      cors,
    );
  }

  if (path === "/driver-portal/account/availability" && request.method === "POST") {
    if (driver.status !== "approved") throw new HttpError(403, "Availability opens once your account is approved.");
    const body = await readJson(request);
    if (typeof body.available !== "boolean") throw new HttpError(400, "Choose available or unavailable.");
    const value = body.available ? 1 : 0;
    if (value !== driver.available) {
      await db.batch([
        db.prepare("UPDATE drivers SET available = ?, updated_at = ? WHERE id = ? AND status = 'approved'").bind(value, at, driver.id),
        auditStatement(db, at, "driver", driver.id, body.available ? "driver.available" : "driver.unavailable", driver.id),
      ]);
    }
    return json({ ok: true, available: body.available }, 200, cors);
  }

  if (path === "/driver-portal/account/documents" && request.method === "POST") {
    if (driver.status !== "approved" && driver.status !== "applied") throw new HttpError(403, "Not allowed.");
    const body = await readJson(request);
    const kind = text(body.kind, 40) as DocumentKind;
    const expiresOn = text(body.expiresOn, 10);
    if (!DOCUMENT_KINDS.includes(kind)) throw new HttpError(400, "Choose a document type.");
    if (!isYmd(expiresOn)) throw new HttpError(400, "Enter the expiry date.");
    if (daysBetween(today, expiresOn) < 0) throw new HttpError(400, "This document has already expired.");
    const id = newId("doc");
    await db.batch([
      // A newer submission replaces any earlier one still waiting for review.
      db
        .prepare("UPDATE driver_documents SET status = 'superseded' WHERE driver_id = ? AND kind = ? AND status = 'pending'")
        .bind(driver.id, kind),
      db
        .prepare(
          "INSERT INTO driver_documents (id, driver_id, kind, reference, expires_on, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        )
        .bind(id, driver.id, kind, text(body.reference, 60), expiresOn, at),
      auditStatement(db, at, "driver", driver.id, "document.submitted", driver.id, { documentId: id, kind, expiresOn }),
    ]);
    return json({ ok: true, documentId: id }, 201, cors);
  }

  if (path === "/driver-portal/account/contact-office" && request.method === "POST") {
    if (driver.status !== "approved") throw new HttpError(403, "Not allowed.");
    const body = await readJson(request);
    const message = text(body.message, 1000);
    if (!message) throw new HttpError(400, "Type a message.");
    const category = (text(body.category, 30) || "general") as MessageCategory;
    if (!(category in MESSAGE_CATEGORIES)) throw new HttpError(400, "Choose what the message is about.");
    const priority = MESSAGE_CATEGORIES[category].urgent ? "urgent" : "normal";
    const since = new Date(ctx.now().getTime() - 86_400_000).toISOString();
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM driver_office_messages WHERE driver_id = ? AND created_at > ?")
      .bind(driver.id, since)
      .first<{ n: number }>();
    // Urgent reports are never blocked by the daily limit.
    if (priority === "normal" && Number(count?.n ?? 0) >= MAX_OFFICE_MESSAGES_PER_DAY) {
      throw new HttpError(429, "Too many messages today. Please phone the office.");
    }
    const id = newId("msg");
    await db.batch([
      db
        .prepare("INSERT INTO driver_office_messages (id, driver_id, body, created_at, priority, category) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, driver.id, message, at, priority, category),
      auditStatement(db, at, "driver", driver.id, priority === "urgent" ? "driver.urgent_report" : "driver.office_message", driver.id, {
        messageId: id,
        category,
      }),
    ]);
    // Stage 1: stored for the Owner Dashboard only. No notification is sent.
    return json({ ok: true, messageId: id, priority }, 201, cors);
  }

  if (path === "/driver-portal/account/sign-out" && request.method === "POST") {
    await db.batch([
      db.prepare("UPDATE driver_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").bind(at, tokenHash),
      auditStatement(db, at, "driver", driver.id, "driver.signed_out", driver.id),
    ]);
    return json({ ok: true }, 200, cors);
  }

  throw new HttpError(404, "Not found.");
}

/** Check a single-use link without using it up (so a form error does not burn the link). */
async function peekLink(ctx: Ctx, token: string, purpose: "invite" | "sign_in") {
  const prefix = purpose === "invite" ? "dinv_" : "dsig_";
  if (!token.startsWith(prefix)) throw new HttpError(400, "This link is not valid.");
  const tokenHash = await hashToken(token);
  const at = ctx.now().toISOString();
  const link = await ctx.db
    .prepare("SELECT driver_id, expires_at, used_at FROM driver_links WHERE token_hash = ? AND purpose = ?")
    .bind(tokenHash, purpose)
    .first<{ driver_id: string; expires_at: string; used_at: string | null }>();
  if (!link || link.used_at) throw new HttpError(410, "This link has already been used. Ask the office for a new one.");
  if (link.expires_at <= at) throw new HttpError(410, "This link has expired. Ask the office for a new one.");
  return { ...link, tokenHash };
}

/** Claim a link atomically so it can only ever be used once. */
async function claimLink(ctx: Ctx, tokenHash: string): Promise<void> {
  const claimed = await ctx.db
    .prepare("UPDATE driver_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL RETURNING driver_id")
    .bind(ctx.now().toISOString(), tokenHash)
    .first<{ driver_id: string }>();
  if (!claimed) throw new HttpError(410, "This link has already been used. Ask the office for a new one.");
}

async function createSessionStatements(ctx: Ctx, driverId: string) {
  const token = ctx.token("dacc_");
  const at = ctx.now().toISOString();
  const expiresAt = new Date(ctx.now().getTime() + SESSION_TTL_MS).toISOString();
  return {
    token,
    expiresAt,
    statements: [
      ctx.db
        .prepare("INSERT INTO driver_sessions (token_hash, driver_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(await hashToken(token), driverId, at, expiresAt),
    ],
  };
}

async function requireSession(request: Request, ctx: Ctx): Promise<{ driver: DriverRow; tokenHash: string }> {
  const token = request.headers.get(DRIVER_ACCOUNT_SESSION_HEADER)?.trim() || "";
  if (!token.startsWith("dacc_")) throw new HttpError(401, "Please sign in.");
  const tokenHash = await hashToken(token);
  const at = ctx.now().toISOString();
  const session = await ctx.db
    .prepare("SELECT driver_id, expires_at, revoked_at FROM driver_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ driver_id: string; expires_at: string; revoked_at: string | null }>();
  if (!session || session.revoked_at || session.expires_at <= at) throw new HttpError(401, "Please sign in again.");
  const driver = await getDriver(ctx.db, session.driver_id);
  if (!driver || (driver.status !== "approved" && driver.status !== "applied")) {
    throw new HttpError(403, "This account cannot sign in. Please contact the office.");
  }
  return { driver, tokenHash };
}
