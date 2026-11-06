/**
 * Find Your Driver — booking-specific live driver locator.
 *
 * Pure rules shared by the Worker (driver-locator-handlers.ts / DriverLocator
 * Durable Object), the driver dashboard and the customer page. No I/O here.
 *
 * Design (approved Nov 2026):
 *  - Latest position only. No movement history. Stored in one SQLite-backed
 *    Durable Object per booking leg — never in KV — and wiped by an alarm when
 *    the collection window closes, and immediately on stop/collection/cancel.
 *  - Strictly opt-in per collection; only inside the collection window; never
 *    near the driver's home base; customer sees the driver only near the airport.
 *  - Customer access by an unguessable, expiring, revocable link secret that is
 *    kept in the URL fragment (never sent to servers, logs or referrers).
 *  - Separate from the retired /track system: no shared tokens, storage or routes.
 */

import { CUSTOMER_TRACKING_OPEN_BEFORE_MS, getTrackingWindow } from "./tracking";

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

/** Sharing may start this long before the booked pickup time. */
export const LOCATOR_OPEN_BEFORE_MS = 60 * 60 * 1000;
/** Hard close after the booked pickup time (allows for flight delays). */
export const LOCATOR_CLOSE_AFTER_MS = 3 * 60 * 60 * 1000;
/** A single sharing session never runs longer than this. */
export const LOCATOR_MAX_SESSION_MS = 3 * 60 * 60 * 1000;

/** Driver phone: send at most this often… */
export const LOCATOR_CLIENT_MIN_INTERVAL_MS = 15_000;
/** …unless it moved this far, and at least this often while stationary. */
export const LOCATOR_CLIENT_MIN_MOVE_METERS = 20;
export const LOCATOR_CLIENT_HEARTBEAT_MS = 30_000;
/** Server rejects (without storing) uploads closer together than this. */
export const LOCATOR_SERVER_MIN_INTERVAL_MS = 8_000;

/** After this with no accepted update the customer sees "last known location". */
export const LOCATOR_STALE_AFTER_MS = 75_000;
/** Customer page refresh while visible. */
export const LOCATOR_VIEW_POLL_MS = 15_000;
/** Customer views allowed per booking per minute (all viewers together). */
export const LOCATOR_VIEW_RATE_PER_MINUTE = 30;
/** Driver uploads allowed per booking per minute (abuse ceiling). */
export const LOCATOR_UPLOAD_RATE_PER_MINUTE = 12;
/** How often the locator re-reads the booking to notice cancellation/collection. */
export const LOCATOR_JOB_RECHECK_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Accuracy and geography                                              */
/* ------------------------------------------------------------------ */

/** Positions worse than this are never shown on the customer map. */
export const LOCATOR_MAX_SHOWN_ACCURACY_M = 500;
/** Positions worse than this are rejected outright. */
export const LOCATOR_MAX_ACCEPTED_ACCURACY_M = 2_000;
/** Driver marker is only revealed within this distance of the pickup airport. */
export const LOCATOR_AIRPORT_REVEAL_RADIUS_M = 10_000;
/** Positions within this distance of the operating base are never stored. */
export const LOCATOR_HOME_PRIVACY_RADIUS_M = 3_000;

export type LocatorAccuracyBand = "good" | "approximate" | "poor";

export function accuracyBand(accuracyM: number): LocatorAccuracyBand {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return "poor";
  if (accuracyM <= 30) return "good";
  if (accuracyM <= 150) return "approximate";
  return "poor";
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Airports supported initially, with the approved coordinates used elsewhere on the site. */
export const LOCATOR_AIRPORTS = {
  BFS: { code: "BFS", name: "Belfast International Airport", lat: 54.6575, lng: -6.2158 },
  BHD: { code: "BHD", name: "George Best Belfast City Airport", lat: 54.6181, lng: -5.8724 },
  DUB: { code: "DUB", name: "Dublin Airport", lat: 53.4264, lng: -6.2499 },
} as const;

export type LocatorAirportCode = keyof typeof LOCATOR_AIRPORTS;

export function locatorAirport(code: string | null | undefined) {
  const key = String(code ?? "").trim().toUpperCase();
  return key in LOCATOR_AIRPORTS ? LOCATOR_AIRPORTS[key as LocatorAirportCode] : null;
}

/** Existing approved collection map images (also used in collection emails). */
export const LOCATOR_MEETING_MAP_IMAGES: Partial<Record<LocatorAirportCode, string>> = {
  BFS: "/maps/belfast-international-pick-up-drop-off.jpg",
  BHD: "/maps/belfast-city-express-pick-up-drop-off.jpg",
};

/* ------------------------------------------------------------------ */
/* Collection window                                                   */
/* ------------------------------------------------------------------ */

export type LocatorWindow = {
  valid: boolean;
  opensAt: string;
  closesAt: string;
  state: "too_early" | "open" | "closed" | "invalid";
};

/** pickupAt is the booking's London-local "YYYY-MM-DDTHH:mm". */
export function locatorWindow(pickupAt: string, now = new Date()): LocatorWindow {
  const base = getTrackingWindow(pickupAt, now);
  const opens = Date.parse(base.opensAt);
  if (!Number.isFinite(opens)) {
    return { valid: false, opensAt: "", closesAt: "", state: "invalid" };
  }
  const pickupMs = opens + CUSTOMER_TRACKING_OPEN_BEFORE_MS;
  const opensAt = pickupMs - LOCATOR_OPEN_BEFORE_MS;
  const closesAt = pickupMs + LOCATOR_CLOSE_AFTER_MS;
  const t = now.getTime();
  return {
    valid: true,
    opensAt: new Date(opensAt).toISOString(),
    closesAt: new Date(closesAt).toISOString(),
    state: t < opensAt ? "too_early" : t > closesAt ? "closed" : "open",
  };
}

/* ------------------------------------------------------------------ */
/* Driver-side throttling                                              */
/* ------------------------------------------------------------------ */

export type LocatorFix = { lat: number; lng: number; accuracy: number; at: number };

/** Client throttle: ≤ 4 uploads/min moving, 2/min stationary. */
export function shouldSendFix(previous: LocatorFix | null, next: LocatorFix): boolean {
  if (!previous) return true;
  const elapsed = next.at - previous.at;
  if (elapsed < LOCATOR_CLIENT_MIN_INTERVAL_MS) return false;
  if (elapsed >= LOCATOR_CLIENT_HEARTBEAT_MS) return true;
  return haversineMeters(previous.lat, previous.lng, next.lat, next.lng) >= LOCATOR_CLIENT_MIN_MOVE_METERS;
}

export type ValidFix = { ok: true; fix: LocatorFix } | { ok: false; error: string };

/** Server-side validation of an upload. Never trusts the client clock beyond ±2 min. */
export function validateFix(input: unknown, nowMs = Date.now()): ValidFix {
  const body = (input ?? {}) as Record<string, unknown>;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracy = Number(body.accuracy);
  const at = body.at === undefined ? nowMs : Number(body.at);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "Invalid latitude" };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "Invalid longitude" };
  if (!Number.isFinite(accuracy) || accuracy <= 0) return { ok: false, error: "Missing GPS accuracy" };
  if (accuracy > LOCATOR_MAX_ACCEPTED_ACCURACY_M) return { ok: false, error: "GPS accuracy too low" };
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > 2 * 60 * 1000) {
    return { ok: false, error: "GPS reading is too old" };
  }
  // Never store more precision than ~1 m; the fix time is the server's receive time.
  return {
    ok: true,
    fix: {
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      accuracy: Math.round(accuracy),
      at: nowMs,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Customer link                                                       */
/* ------------------------------------------------------------------ */

export const LOCATOR_PAGE_PATH = "/find-your-driver/";
export const LOCATOR_FRAGMENT_STORAGE_KEY = "matni-fyd-link";

const FRAGMENT_PATTERN = /^([0-9a-f]{64})\.([A-Za-z0-9_-]{43})$/;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 256-bit secret, base64url (43 chars). */
export function generateLinkSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function buildLinkFragment(objectId: string, secret: string): string {
  return `${objectId}.${secret}`;
}

export function parseLinkFragment(raw: string | null | undefined): { objectId: string; secret: string } | null {
  const value = String(raw ?? "").trim().replace(/^#/, "");
  const match = FRAGMENT_PATTERN.exec(value);
  return match ? { objectId: match[1], secret: match[2] } : null;
}

export function buildCustomerLocatorUrl(siteOrigin: string, fragment: string): string {
  return `${siteOrigin.replace(/\/+$/, "")}${LOCATOR_PAGE_PATH}#${fragment}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Runs before any analytics on /find-your-driver/: moves the link out of the
 * address bar into this tab's sessionStorage so page_view, referrers and
 * screenshots never carry it. (Fragments are never sent to servers anyway.)
 */
export const FIND_DRIVER_LINK_STRIP_SCRIPT = `(function(){try{var p=String(location.pathname||"").replace(/\\/+$/,"");if(p!=="/find-your-driver")return;var h=String(location.hash||"").replace(/^#/,"");if(!h)return;if(${FRAGMENT_PATTERN.toString()}.test(h)){try{sessionStorage.setItem(${JSON.stringify(
  LOCATOR_FRAGMENT_STORAGE_KEY,
)},h);}catch(e){}}history.replaceState(history.state,"",String(location.pathname||""));}catch(e){}})();`;

/* ------------------------------------------------------------------ */
/* State and customer view                                             */
/* ------------------------------------------------------------------ */

export type LocatorPhase =
  | "not_started" // link exists, driver hasn't shared yet
  | "sharing" // driver sharing
  | "paused" // driver stopped sharing (not collected)
  | "collected"
  | "cancelled"
  | "expired";

export type LocatorMeta = {
  version: 1;
  jobToken: string;
  pickupAt: string;
  opensAt: string;
  closesAt: string;
  airportCode: LocatorAirportCode;
  driverDisplayName: string;
  meetingInstruction: string;
  meetingNote?: string;
  phase: LocatorPhase;
  sharingStartedAt?: number;
  sharingStoppedAt?: number;
  sharingBy?: "owner" | "driver";
  linkHash?: string;
  linkCreatedAt?: number;
  linkExpiresAt?: number;
  linkRevokedAt?: number;
  jobCheckedAt: number;
};

export type LocatorPosition = LocatorFix;

export type CustomerLocatorStatus =
  | "waiting" // window open, driver not sharing yet
  | "sharing" // fresh position on the map
  | "on_the_way" // sharing but not near the airport yet (no position shown)
  | "stale" // last known position, updates stopped
  | "unavailable" // sharing but no usable position (poor accuracy / none yet / paused)
  | "collected"
  | "cancelled"
  | "expired";

export type CustomerLocatorView = {
  ok: true;
  status: CustomerLocatorStatus;
  driverName: string;
  airport: { code: LocatorAirportCode; name: string; lat: number; lng: number };
  meetingInstruction: string;
  meetingNote: string | null;
  meetingMapImage: string | null;
  position: null | {
    lat: number;
    lng: number;
    accuracyM: number;
    band: LocatorAccuracyBand;
    updatedAt: string;
    ageSeconds: number;
    lastKnown: boolean;
  };
  pollAfterMs: number;
  expiresAt: string;
};

/** Everything the customer page receives. Nothing about the booking beyond this. */
export function buildCustomerView(
  meta: LocatorMeta,
  position: LocatorPosition | null,
  now = Date.now(),
): CustomerLocatorView {
  const airport = LOCATOR_AIRPORTS[meta.airportCode];
  const closes = Date.parse(meta.closesAt);
  const finished: CustomerLocatorStatus | null =
    meta.phase === "collected" || meta.phase === "cancelled" || meta.phase === "expired"
      ? meta.phase
      : Number.isFinite(closes) && now > closes
        ? "expired"
        : null;

  let status: CustomerLocatorStatus;
  let shown: CustomerLocatorView["position"] = null;

  if (finished) {
    status = finished;
  } else if (meta.phase !== "sharing") {
    status = meta.phase === "paused" ? "unavailable" : "waiting";
  } else if (!position) {
    status = "unavailable";
  } else {
    const age = now - position.at;
    const nearAirport =
      haversineMeters(position.lat, position.lng, airport.lat, airport.lng) <= LOCATOR_AIRPORT_REVEAL_RADIUS_M;
    if (!nearAirport) {
      status = age > LOCATOR_STALE_AFTER_MS ? "unavailable" : "on_the_way";
    } else if (position.accuracy > LOCATOR_MAX_SHOWN_ACCURACY_M) {
      status = "unavailable";
    } else {
      const lastKnown = age > LOCATOR_STALE_AFTER_MS;
      status = lastKnown ? "stale" : "sharing";
      shown = {
        lat: position.lat,
        lng: position.lng,
        accuracyM: position.accuracy,
        band: accuracyBand(position.accuracy),
        updatedAt: new Date(position.at).toISOString(),
        ageSeconds: Math.max(0, Math.round(age / 1000)),
        lastKnown,
      };
    }
  }

  return {
    ok: true,
    status,
    driverName: meta.driverDisplayName,
    airport: { code: airport.code, name: airport.name, lat: airport.lat, lng: airport.lng },
    meetingInstruction: meta.meetingInstruction,
    meetingNote: meta.meetingNote?.trim() ? meta.meetingNote.trim() : null,
    meetingMapImage: LOCATOR_MEETING_MAP_IMAGES[meta.airportCode] ?? null,
    position: shown,
    pollAfterMs: finished ? 0 : LOCATOR_VIEW_POLL_MS,
    expiresAt: new Date(meta.linkExpiresAt ?? closes).toISOString(),
  };
}

/** Driver/owner dashboard status for one booking. */
export type DriverLocatorStatus = {
  ok: true;
  enabled: boolean;
  phase: LocatorPhase | "none";
  window: LocatorWindow;
  lastAcceptedAt: string | null;
  lastAccuracyM: number | null;
  linkActive: boolean;
  linkExpiresAt: string | null;
};

/**
 * Customer-facing driver name: the first name of an assigned driver who has
 * accepted the job (customers already receive it in the driver-details email),
 * otherwise "Your driver". Never surnames, never the owner's personal name.
 */
export function customerDriverDisplayName(
  assignedDriverName: string | null | undefined,
  assignmentAccepted: boolean,
): string {
  const first = String(assignedDriverName ?? "").trim().split(/\s+/)[0] ?? "";
  return assignmentAccepted && /^[A-Za-z\u00C0-\u024F'-]{1,30}$/.test(first) ? first : "Your driver";
}

/** Short meeting-note sanitiser (owner-written, shown to the customer as plain text). */
export function sanitizeMeetingNote(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export const LOCATOR_PRIVACY_NOTICE =
  "My Airport Taxi NI shows your driver's approximate location only while they choose to share it for your collection. We keep the latest position only — no route history — and delete it as soon as you're collected, the booking is cancelled or the link expires. The map is from OpenStreetMap, so your browser loads map images from OpenStreetMap's servers, which can see your IP address. GPS can be inaccurate inside or near terminal buildings.";
