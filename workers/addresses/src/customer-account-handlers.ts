/**
 * Customer "My bookings" endpoints (passwordless email code sign-in).
 *
 *   POST /customer/login/request  { email }        → always { ok: true } (no account enumeration)
 *   POST /customer/login/verify   { email, code }  → { token, profile }
 *   GET  /customer/bookings       X-Customer-Session: <token> → { profile, bookings }
 *   POST /customer/logout         X-Customer-Session: <token>
 */
import { corsHeaders } from "../shared/google-places";
import {
  buildCustomerLoginCodeEmail,
  normalizeCustomerEmail,
  type CustomerBookingsResponse,
} from "../shared/customer-account";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import {
  customerProfileFromRecords,
  endCustomerSession,
  getCustomerSessionEmail,
  issueCustomerLoginCode,
  loadCustomerRecords,
  toCustomerBookingSummary,
  verifyCustomerLoginCode,
} from "./customer-account-store";
import { ensureManageBookingToken, getPaidBookingRecord } from "./paid-booking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

const SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

export type CustomerAccountEnv = WorkerEmailEnv & { TRACKING_STORE?: KVNamespace };

type SendCode = (to: string, code: string, name: string) => Promise<boolean>;

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string {
  return (request.headers.get("X-Customer-Session") ?? "").trim();
}

function defaultSendCode(env: CustomerAccountEnv): SendCode {
  return async (to, code, name) => {
    const email = buildCustomerLoginCodeEmail({ code, name, siteUrl: SITE_ORIGIN });
    const result = await trySendBrandedCustomerEmail(env, {
      to,
      toName: name || undefined,
      subject: email.subject,
      body: email.text,
      htmlBody: email.html,
      ownerCopy: false,
    });
    return result.sent;
  };
}

export async function handleCustomerLoginRequest(
  request: Request,
  env: CustomerAccountEnv,
  origin: string | null,
  sendCode: SendCode = defaultSendCode(env),
): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "My bookings is not available right now." }, 503, origin);
  const body = await readBody(request);
  const email = normalizeCustomerEmail(body?.email);
  if (!email) return json({ error: "Please enter a valid email address." }, 400, origin);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const issued = await issueCustomerLoginCode(store, email, ip);
  if (!issued.issued && issued.reason === "rate_limited") {
    return json({ error: "Too many codes requested. Please wait a while and try again." }, 429, origin);
  }
  if (issued.issued) {
    const records = await loadCustomerRecords(store, email, (ref) => getPaidBookingRecord(store, ref));
    const name = customerProfileFromRecords(email, records).name;
    const sent = await sendCode(email, issued.code, name);
    if (!sent) {
      return json({ error: "We couldn't send the email just now. Please try again in a minute." }, 502, origin);
    }
  }
  // Same answer whether or not the email has bookings, so nobody can probe who our customers are.
  return json({ ok: true }, 200, origin);
}

export async function handleCustomerLoginVerify(
  request: Request,
  env: CustomerAccountEnv,
  origin: string | null,
): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "My bookings is not available right now." }, 503, origin);
  const body = await readBody(request);
  const email = normalizeCustomerEmail(body?.email);
  const result = await verifyCustomerLoginCode(store, email, String(body?.code ?? ""));
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That code has expired. Please ask for a new one."
        : result.reason === "too_many_attempts"
          ? "Too many wrong codes. Please ask for a new one."
          : "That code isn't right. Please check the email and try again.";
    return json({ error: message, code: result.reason }, 400, origin);
  }
  const records = await loadCustomerRecords(store, email, (ref) => getPaidBookingRecord(store, ref));
  return json({ token: result.token, profile: customerProfileFromRecords(email, records) }, 200, origin);
}

export async function handleCustomerBookings(
  request: Request,
  env: CustomerAccountEnv,
  origin: string | null,
  now: Date = new Date(),
): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return json({ error: "My bookings is not available right now." }, 503, origin);
  const email = await getCustomerSessionEmail(store, bearerToken(request));
  if (!email) return json({ error: "Please sign in again.", code: "signed_out" }, 401, origin);

  const records = await loadCustomerRecords(store, email, (ref) => getPaidBookingRecord(store, ref));
  const withTokens: PaidBookingRecord[] = [];
  for (const record of records) {
    withTokens.push(await ensureManageBookingToken(store, record).catch(() => record));
  }
  const bookings = withTokens
    .map((record) => toCustomerBookingSummary(record, { siteUrl: SITE_ORIGIN, now }))
    .sort((a, b) => {
      // Upcoming first (soonest first), then past bookings (most recent first).
      const aKey = `${a.tripDate}T${a.tripTime}`;
      const bKey = `${b.tripDate}T${b.tripTime}`;
      const aUp = a.status === "upcoming";
      const bUp = b.status === "upcoming";
      if (aUp !== bUp) return aUp ? -1 : 1;
      return aUp ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
    });
  const response: CustomerBookingsResponse = {
    profile: customerProfileFromRecords(email, records),
    bookings,
  };
  return json(response, 200, origin);
}

export async function handleCustomerLogout(
  request: Request,
  env: CustomerAccountEnv,
  origin: string | null,
): Promise<Response> {
  if (env.TRACKING_STORE) await endCustomerSession(env.TRACKING_STORE, bearerToken(request));
  return json({ ok: true }, 200, origin);
}
