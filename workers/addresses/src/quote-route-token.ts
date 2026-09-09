/**
 * Short-lived HMAC-signed route token.
 *
 * Issued only after the Worker itself resolves OSRM metrics for a quote.
 * /payments may reuse those metrics when the confirmed journey is unchanged.
 *
 * This is permission to reuse trusted distance/duration — never the fare.
 * The HMAC secret stays on the Worker and is never sent to the browser.
 */

export const QUOTE_ROUTE_TOKEN_VERSION = 1;
/** 12 minutes — inside the requested 10–15 minute window. */
export const QUOTE_ROUTE_TOKEN_TTL_MS = 12 * 60 * 1000;

export type QuoteRouteTokenEnv = {
  QUOTE_ROUTE_TOKEN_SECRET?: string;
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
};

export type QuoteRouteTokenClaims = {
  v: number;
  pickupPlaceId: string;
  dropoffPlaceId: string;
  pickupLabel: string;
  dropoffLabel: string;
  distanceKm: number;
  durationMinutes: number;
  iat: number;
  exp: number;
};

export type QuoteRouteTokenVerifyOk = {
  ok: true;
  distanceKm: number;
  durationMinutes: number;
  claims: QuoteRouteTokenClaims;
};

export type QuoteRouteTokenVerifyFail = {
  ok: false;
  reason:
    | "missing"
    | "no_secret"
    | "malformed"
    | "invalid_signature"
    | "expired"
    | "version"
    | "pickup_mismatch"
    | "dropoff_mismatch";
};

export type QuoteRouteTokenVerifyResult = QuoteRouteTokenVerifyOk | QuoteRouteTokenVerifyFail;

const textEncoder = new TextEncoder();

export function resolveQuoteRouteTokenSecret(env?: QuoteRouteTokenEnv | null): string {
  return (
    env?.QUOTE_ROUTE_TOKEN_SECRET?.trim() ||
    env?.OWNER_ACCESS_KEY?.trim() ||
    env?.DRIVER_ACCESS_KEY?.trim() ||
    ""
  );
}

export function normalizeRouteTokenLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeRouteTokenPlaceId(placeId: string | null | undefined): string {
  return String(placeId ?? "").trim();
}

export function roundRouteTokenDistanceKm(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}

export function roundRouteTokenDurationMinutes(durationMinutes: number): number {
  return Math.round(durationMinutes * 10) / 10;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return new Uint8Array(signature);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Decode the payload without verifying — tests only. Never use for payment authority. */
export function inspectQuoteRouteTokenPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0]) return null;
  const bytes = base64UrlToBytes(parts[0]);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function signQuoteRouteToken(options: {
  secret: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  pickupLabel: string;
  dropoffLabel: string;
  distanceKm: number;
  durationMinutes: number;
  nowMs?: number;
  ttlMs?: number;
}): Promise<string> {
  const secret = options.secret.trim();
  if (!secret) {
    throw new Error("quote_route_token_secret_missing");
  }
  if (!isFinitePositive(options.distanceKm) || !isFinitePositive(options.durationMinutes)) {
    throw new Error("quote_route_token_metrics_invalid");
  }
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? QUOTE_ROUTE_TOKEN_TTL_MS;
  const claims: QuoteRouteTokenClaims = {
    v: QUOTE_ROUTE_TOKEN_VERSION,
    pickupPlaceId: normalizeRouteTokenPlaceId(options.pickupPlaceId),
    dropoffPlaceId: normalizeRouteTokenPlaceId(options.dropoffPlaceId),
    pickupLabel: normalizeRouteTokenLabel(options.pickupLabel),
    dropoffLabel: normalizeRouteTokenLabel(options.dropoffLabel),
    distanceKm: roundRouteTokenDistanceKm(options.distanceKm),
    durationMinutes: roundRouteTokenDurationMinutes(options.durationMinutes),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor((nowMs + ttlMs) / 1000),
  };
  const payload = bytesToBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signature = bytesToBase64Url(await hmacSha256(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyQuoteRouteToken(options: {
  token: string | null | undefined;
  secret: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  pickupLabel: string;
  dropoffLabel: string;
  nowMs?: number;
}): Promise<QuoteRouteTokenVerifyResult> {
  const token = String(options.token ?? "").trim();
  if (!token) return { ok: false, reason: "missing" };

  const secret = options.secret.trim();
  if (!secret) return { ok: false, reason: "no_secret" };

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const payloadBytes = base64UrlToBytes(parts[0]);
  const givenSig = base64UrlToBytes(parts[1]);
  if (!payloadBytes || !givenSig) {
    return { ok: false, reason: "malformed" };
  }

  let claims: QuoteRouteTokenClaims;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as QuoteRouteTokenClaims;
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "malformed" };
    }
    claims = parsed;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expectedSig = await hmacSha256(secret, parts[0]);
  if (!timingSafeEqual(givenSig, expectedSig)) {
    return { ok: false, reason: "invalid_signature" };
  }

  if (claims.v !== QUOTE_ROUTE_TOKEN_VERSION) {
    return { ok: false, reason: "version" };
  }

  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(claims.exp) || nowSec >= claims.exp) {
    return { ok: false, reason: "expired" };
  }
  if (!Number.isFinite(claims.iat) || claims.iat > nowSec + 30) {
    return { ok: false, reason: "malformed" };
  }

  if (
    !isFinitePositive(claims.distanceKm) ||
    !isFinitePositive(claims.durationMinutes)
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (normalizeRouteTokenPlaceId(claims.pickupPlaceId) !== normalizeRouteTokenPlaceId(options.pickupPlaceId)) {
    return { ok: false, reason: "pickup_mismatch" };
  }
  if (normalizeRouteTokenPlaceId(claims.dropoffPlaceId) !== normalizeRouteTokenPlaceId(options.dropoffPlaceId)) {
    return { ok: false, reason: "dropoff_mismatch" };
  }
  if (normalizeRouteTokenLabel(claims.pickupLabel) !== normalizeRouteTokenLabel(options.pickupLabel)) {
    return { ok: false, reason: "pickup_mismatch" };
  }
  if (normalizeRouteTokenLabel(claims.dropoffLabel) !== normalizeRouteTokenLabel(options.dropoffLabel)) {
    return { ok: false, reason: "dropoff_mismatch" };
  }

  return {
    ok: true,
    distanceKm: roundRouteTokenDistanceKm(claims.distanceKm),
    durationMinutes: roundRouteTokenDurationMinutes(claims.durationMinutes),
    claims,
  };
}
