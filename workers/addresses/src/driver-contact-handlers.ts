/**
 * Booking-specific driver contact page.
 * Every response re-reads the tracking job. Direct wa.me and tel: targets are
 * chosen only after that read. A number already revealed cannot be recalled.
 */

import { corsHeaders } from "../shared/google-places";
import {
  DRIVER_CONTACT_CACHE_CONTROL,
  driverContactExpiryIso,
  driverContactRedirectHref,
  driverContactTokenMatches,
  evaluateDriverContactVisit,
  generateDriverContactToken,
  isSafeDriverContactRedirect,
  nextDriverContactRateHits,
  normalizeDriverContactToken,
  publicDriverContactResponse,
  type DriverContactChannel,
} from "../shared/driver-contact-link";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import type { TrackingJobRecord } from "../shared/tracking";
import { airportPickupReminderInput } from "./journey-reminder-input";
import { getPaidBookingRecord } from "./paid-booking-store";
import { TRACKING_JOB_TTL_SECONDS, getTrackingJob } from "./tracking-store";

type Env = {
  TRACKING_STORE?: KVNamespace;
  SITE_URL?: string;
};

type LiveContact = {
  job: TrackingJobRecord;
  paid: PaidBookingRecord | null;
};

const INDEX_PREFIX = "driver-contact:";
const RATE_PREFIX = "driver-contact-rl:";

function indexKey(token: string): string {
  return `${INDEX_PREFIX}${token}`;
}

function privateHeaders(origin: string | null): Record<string, string> {
  return {
    "Cache-Control": DRIVER_CONTACT_CACHE_CONTROL,
    Pragma: "no-cache",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    ...(corsHeaders(origin) as Record<string, string>),
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...privateHeaders(origin),
    },
  });
}

function redirectResponse(location: string, origin: string | null): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...privateHeaders(origin),
    },
  });
}

export async function ensureDriverContactLink(
  store: KVNamespace,
  job: TrackingJobRecord,
  pickupAt: Date | null,
): Promise<string> {
  const existing = normalizeDriverContactToken(job.driverContactToken ?? "");
  const token = existing || generateDriverContactToken();
  job.driverContactToken = token;
  const expiresAt = driverContactExpiryIso(pickupAt);
  if (expiresAt) job.driverContactExpiresAt = expiresAt;
  await store.put(indexKey(token), JSON.stringify({ jobToken: job.token }), {
    expirationTtl: TRACKING_JOB_TTL_SECONDS,
  });
  return token;
}

export async function getTrackingJobForDriverContactToken(
  store: KVNamespace,
  rawToken: string,
): Promise<TrackingJobRecord | null> {
  const token = normalizeDriverContactToken(rawToken);
  if (!token) return null;
  const index = await store.get<{ jobToken?: string }>(indexKey(token), "json");
  const jobToken = index?.jobToken?.trim() ?? "";
  if (!jobToken) return null;
  const job = await getTrackingJob(store, jobToken);
  if (!job || !driverContactTokenMatches(job.driverContactToken, token)) return null;
  return job;
}

async function loadLive(store: KVNamespace, token: string): Promise<LiveContact | null> {
  const job = await getTrackingJobForDriverContactToken(store, token);
  if (!job) return null;
  const paymentReference = job.paymentReference?.trim() ?? "";
  const paid = paymentReference ? await getPaidBookingRecord(store, paymentReference) : null;
  return { job, paid };
}

function assignmentFingerprint(live: LiveContact): string {
  const { job, paid } = live;
  return JSON.stringify({
    status: job.assignmentStatus ?? "",
    name: job.assignedDriverName ?? "",
    mobile: job.assignedDriverMobile ?? "",
    version: job.assignmentVersion ?? 0,
    email: job.assignedDriverEmail ?? "",
    booking: paid?.status ?? "",
    operational: paid?.operationalStatus ?? "",
    tripDate: paid?.tripDate ?? job.tripDate,
    tripTime: paid?.tripTime ?? job.tripTime,
  });
}

/** Read, then read again immediately before any driver detail is shown or redirected. */
async function readAuthoritativeContact(store: KVNamespace, token: string): Promise<LiveContact | null> {
  const first = await loadLive(store, token);
  const second = await loadLive(store, token);
  if (!second) return null;
  if (!first || assignmentFingerprint(first) !== assignmentFingerprint(second)) {
    return loadLive(store, token);
  }
  return second;
}

async function allowHit(store: KVNamespace, token: string, now: Date): Promise<boolean> {
  const key = `${RATE_PREFIX}${token}`;
  const existing = await store.get<number[]>(key, "json");
  const decision = nextDriverContactRateHits(Array.isArray(existing) ? existing : [], now.getTime());
  await store.put(key, JSON.stringify(decision.hits), { expirationTtl: 10 * 60 });
  return decision.allow;
}

function channelOf(raw: string | null): DriverContactChannel | null {
  if (raw === "whatsapp" || raw === "call") return raw;
  return null;
}

export async function handleDriverContactRequest(
  request: Request,
  env: Env,
  origin: string | null,
  mode: "view" | "open",
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, view: "invalid", message: "Method not allowed" }, 405, origin);
  }
  if (!env.TRACKING_STORE) {
    return jsonResponse({ ok: false, view: "invalid", message: "This link is not valid." }, 503, origin);
  }

  const url = new URL(request.url);
  const token = normalizeDriverContactToken(url.searchParams.get("token"));
  if (!token) {
    return jsonResponse(
      publicDriverContactResponse({
        ok: false,
        view: "invalid",
        heading: "Link not valid",
        message: "This link is not valid.",
      }),
      404,
      origin,
    );
  }

  const allowed = await allowHit(env.TRACKING_STORE, token, new Date());
  if (!allowed) {
    const response = jsonResponse(
      {
        ok: false,
        view: "rate_limited",
        heading: "Please wait",
        message: "Please wait a moment and try this link again.",
      },
      429,
      origin,
    );
    response.headers.set("Retry-After", "60");
    return response;
  }

  const live = await readAuthoritativeContact(env.TRACKING_STORE, token);
  if (!live) {
    return jsonResponse(
      publicDriverContactResponse({
        ok: false,
        view: "invalid",
        heading: "Link not valid",
        message: "This link is not valid.",
      }),
      404,
      origin,
    );
  }

  const visit = evaluateDriverContactVisit(
    {
      ...airportPickupReminderInput(live.job, live.paid),
      requestToken: token,
      storedToken: live.job.driverContactToken,
      tokenExpiresAt: live.job.driverContactExpiresAt,
      assignmentAudit: live.job.assignmentAudit,
    },
    new Date(),
  );

  if (mode === "open") {
    const channel = channelOf(url.searchParams.get("channel"));
    const location = channel ? driverContactRedirectHref(visit, channel) : null;
    if (!location || !isSafeDriverContactRedirect(location)) {
      return jsonResponse(
        { ok: false, view: "invalid", heading: "Link not valid", message: "This link is not valid." },
        404,
        origin,
      );
    }
    return redirectResponse(location, origin);
  }

  return jsonResponse(publicDriverContactResponse(visit), visit.ok ? 200 : 404, origin);
}
