/**
 * HTTP routes for email promo codes.
 *
 * Public
 *   GET  /promo/config    — on/off, percentage, minimum fare, pop-up timing (no personal data)
 *   POST /promo/request   — email → code (always the same neutral reply; rate limited)
 *   POST /promo/validate  — check a code against the booking email before payment (rate limited)
 * Owner (existing Owner Dashboard key)
 *   GET  /owner/promo             — stats, settings, codes (search + status filter)
 *   POST /owner/promo/settings    — on/off, %, minimum fare, validity, pop-up
 *   POST /owner/promo/deactivate  — deactivate one code
 *   GET  /owner/promo/export.csv  — ?list=codes | ?list=marketing (valid permission only)
 */
import { corsHeaders } from "../shared/google-places";
import {
  PROMO_INVALID_EMAIL_MESSAGE,
  PROMO_MARKETING_CONSENT_VERSION,
  PROMO_MARKETING_CONSENT_WORDING,
  PROMO_REQUEST_ACCEPTED_MESSAGE,
  PROMO_REQUEST_RATE_LIMITED_MESSAGE,
  PROMO_REQUEST_SEND_FAILED_MESSAGE,
  normalizePromoCode,
  normalizePromoEmail,
  promoBlackoutFor,
  promoBlackoutMessage,
  promoCodesCsv,
  promoMeetsMinimum,
  promoRejectMessage,
  publicPromoConfig,
  validatePromoSettingsInput,
} from "../shared/promo-code";
import { buildPromoAlreadyUsedEmail, buildPromoCodeEmail } from "../shared/promo-email";
import { marketingSubscribersCsv, type MarketingSubscriberRow } from "../shared/marketing";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { listMarketingSubscribers, recordMarketingOptIn } from "./marketing-store";
import {
  checkPromoCodeForBooking,
  deactivatePromoCode,
  getPromoSettings,
  issueOrResendPromoCode,
  listPromoCodes,
  logPromoRequest,
  markPromoEmailSent,
  promoDb,
  promoEmailHash,
  promoIpHash,
  promoRequestOutcomes,
  promoRequestRateLimited,
  promoStats,
  recordMarketingConsent,
  savePromoSettings,
  withdrawUnsentPromoCode,
  type PromoDb,
  type PromoEnv,
} from "./promo-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

export type PromoHandlerEnv = PromoEnv &
  DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
    SITE_ORIGIN?: string;
  };

type Clock = () => Date;
let clock: Clock = () => new Date();
/** Tests only. */
export function setPromoClockForTests(next: Clock | null): void {
  clock = next ?? (() => new Date());
}

function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin), ...extra },
  });
}

function siteUrl(env: { SITE_ORIGIN?: string }): string {
  return (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0] ||
    ""
  ).trim();
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const unavailable = (origin: string | null) =>
  json({ ok: false, error: "Promo codes are temporarily unavailable." }, 503, origin);

/** Missing table = migration 0005 not applied yet: answer 503, never 500. */
async function withDb(env: PromoHandlerEnv, origin: string | null, run: (db: PromoDb) => Promise<Response>): Promise<Response> {
  const db = promoDb(env);
  if (!db) return unavailable(origin);
  try {
    return await run(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Promo route failed", message);
    if (/no such table/i.test(message)) return unavailable(origin);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500, origin);
  }
}

export function isPromoPath(pathname: string): boolean {
  const p = pathname.replace(/^\/api/, "");
  return p === "/promo/config" || p === "/promo/request" || p === "/promo/validate" || p.startsWith("/owner/promo");
}

export async function handlePromoRequest(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (path === "/promo/config" && request.method === "GET") return handleConfig(env, origin);
  if (path === "/promo/request" && request.method === "POST") return handleCodeRequest(request, env, origin);
  if (path === "/promo/validate" && request.method === "POST") return handleValidate(request, env, origin);
  if (path.startsWith("/owner/promo")) {
    if (!ownerAuthorized(request, env)) return json({ error: "Unauthorized — owner access required." }, 401, origin);
    if (path === "/owner/promo" && request.method === "GET") return handleOwnerOverview(request, env, origin);
    if (path === "/owner/promo/settings" && request.method === "POST") return handleOwnerSettings(request, env, origin);
    if (path === "/owner/promo/deactivate" && request.method === "POST") return handleOwnerDeactivate(request, env, origin);
    if (path === "/owner/promo/export.csv" && request.method === "GET") return handleOwnerExport(request, env, origin);
  }
  return json({ error: "Not found" }, 404, origin);
}

async function handleConfig(env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const db = promoDb(env);
  if (!db) return json({ ok: true, config: { enabled: false } }, 200, origin);
  try {
    const settings = await getPromoSettings(db);
    return json({ ok: true, config: publicPromoConfig(settings) }, 200, origin, { "Cache-Control": "public, max-age=60" });
  } catch {
    // Table not created yet: the promotion simply does not show.
    return json({ ok: true, config: { enabled: false } }, 200, origin);
  }
}

async function handleCodeRequest(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "Invalid request" }, 400, origin);
  // Honeypot: real visitors never fill this hidden field. Reply as if all went well.
  if (String(body.website ?? "").trim()) return json({ ok: true, message: PROMO_REQUEST_ACCEPTED_MESSAGE }, 200, origin);
  const email = normalizePromoEmail(body.email);
  if (!email) return json({ ok: false, error: PROMO_INVALID_EMAIL_MESSAGE }, 400, origin);
  const marketingOptIn = body.marketingOptIn === true;
  const source = String(body.source ?? "popup").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "popup";

  return withDb(env, origin, async (db) => {
    const now = clock();
    const secret = env.PROMO_HASH_SECRET?.trim() ?? "";
    const emailHash = await promoEmailHash(email, secret);
    const ipHash = await promoIpHash(clientIp(request), secret);
    const settings = await getPromoSettings(db);
    if (!settings.enabled) {
      await logPromoRequest(db, { at: now, emailHash, ipHash, outcome: "disabled", source });
      return json({ ok: false, error: promoRejectMessage("disabled") }, 409, origin);
    }
    if (await promoRequestRateLimited(db, { now, emailHash, ipHash })) {
      await logPromoRequest(db, { at: now, emailHash, ipHash, outcome: "rate_limited", source });
      return json({ ok: false, error: PROMO_REQUEST_RATE_LIMITED_MESSAGE }, 429, origin);
    }

    // Marketing permission is separate from the code: recorded only when the box was ticked,
    // and the code is sent either way.
    if (marketingOptIn) {
      try {
        await recordMarketingConsent(db, { at: now, email, emailHash, consented: true, source: `promo-${source}`, ipHash });
        if (env.TRACKING_STORE) {
          await recordMarketingOptIn(env.TRACKING_STORE, {
            email,
            source: "promo-signup",
            consentVersion: PROMO_MARKETING_CONSENT_VERSION,
            consentWording: PROMO_MARKETING_CONSENT_WORDING,
            optedInAt: now.toISOString(),
          });
        }
      } catch (error) {
        console.error("Promo marketing consent record failed", error instanceof Error ? error.message : "");
      }
    }

    const result = await issueOrResendPromoCode(db, { email, emailHash, settings, now, source, marketingOptIn });
    const site = siteUrl(env);
    if (result.kind === "issued" || result.kind === "resend") {
      const validityDays = Math.round((Date.parse(result.expiresAt) - Date.parse(result.issuedAt)) / 86_400_000);
      const message = buildPromoCodeEmail({
        ...result,
        validityDays,
        siteUrl: site,
        hasExcludedDates: settings.blackoutDates.length > 0,
      });
      const sent = await trySendBrandedCustomerEmail(env, {
        to: email,
        subject: message.subject,
        body: message.text,
        htmlBody: message.html,
        ownerCopy: false,
        idempotencyKey: `promo-${result.code}-${now.getTime()}`,
      });
      if (!sent.sent) {
        if (result.kind === "issued") await withdrawUnsentPromoCode(db, result.code);
        await logPromoRequest(db, { at: now, emailHash, ipHash, outcome: "send_failed", code: result.code, source });
        return json({ ok: false, error: PROMO_REQUEST_SEND_FAILED_MESSAGE }, 502, origin);
      }
      await markPromoEmailSent(db, result.code, now);
      await logPromoRequest(db, { at: now, emailHash, ipHash, outcome: result.kind === "issued" ? "issued" : "resent", code: result.code, source });
    } else if (result.kind === "already_used") {
      const message = buildPromoAlreadyUsedEmail({ siteUrl: site });
      await trySendBrandedCustomerEmail(env, { to: email, subject: message.subject, body: message.text, htmlBody: message.html, ownerCopy: false });
      await logPromoRequest(db, { at: now, emailHash, ipHash, outcome: "already_used", source });
    } else {
      await logPromoRequest(db, {
        at: now,
        emailHash,
        ipHash,
        outcome: result.kind === "blocked" ? "blocked" : "resend_throttled",
        code: "code" in result ? result.code : undefined,
        source,
      });
    }
    // Identical reply for new, existing, used and blocked addresses.
    return json({ ok: true, message: PROMO_REQUEST_ACCEPTED_MESSAGE }, 200, origin);
  });
}

const VALIDATE_LIMIT_PER_HOUR = 30;

async function handleValidate(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "Invalid request" }, 400, origin);
  const code = normalizePromoCode(body.code);
  const email = normalizePromoEmail(body.email);
  return withDb(env, origin, async (db) => {
    const now = clock();
    const secret = env.PROMO_HASH_SECRET?.trim() ?? "";
    const ipHash = await promoIpHash(clientIp(request), secret);
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const recent = await db
      .prepare("SELECT COUNT(*) AS n FROM promo_requests WHERE ip_hash = ? AND ip_hash <> '' AND outcome = 'validate' AND at > ?")
      .bind(ipHash, hourAgo)
      .first<{ n: number }>();
    if (Number(recent?.n ?? 0) >= VALIDATE_LIMIT_PER_HOUR) {
      return json({ ok: false, error: PROMO_REQUEST_RATE_LIMITED_MESSAGE, reason: "rate_limited" }, 429, origin);
    }
    await logPromoRequest(db, { at: now, emailHash: "", ipHash, outcome: "validate", source: "validate" });
    const settings = await getPromoSettings(db);
    if (!settings.enabled) return json({ ok: false, reason: "disabled", error: promoRejectMessage("disabled") }, 200, origin);
    if (!code) return json({ ok: false, reason: "not_found", error: promoRejectMessage("not_found") }, 200, origin);
    if (!email) {
      return json({ ok: false, reason: "email_required", error: "Enter your email address in your details first, then apply the code." }, 200, origin);
    }
    const check = await checkPromoCodeForBooking(db, { code, bookingEmail: email, now, secret });
    if (!check.ok) return json({ ok: false, reason: check.reason, error: promoRejectMessage(check.reason) }, 200, origin);
    const blackout = promoBlackoutFor([body.tripDate as string, body.returnDate as string], settings.blackoutDates);
    if (blackout) {
      return json({ ok: false, reason: "blackout_date", error: promoBlackoutMessage(blackout) }, 200, origin);
    }
    const vehicleFare = Number(body.vehicleFareGbp);
    const meets = Number.isFinite(vehicleFare) ? promoMeetsMinimum(vehicleFare, check.terms.minimumVehicleFareGbp) : true;
    return json(
      {
        ok: true,
        code: check.terms.code,
        discountRate: check.terms.discountRate,
        minimumVehicleFareGbp: check.terms.minimumVehicleFareGbp,
        expiresAt: check.expiresAt,
        meetsMinimum: meets,
        ...(meets ? {} : { warning: promoRejectMessage("minimum_fare", check.terms) }),
      },
      200,
      origin,
    );
  });
}

/* ------------------------------------------------------------------ owner */

async function handleOwnerOverview(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  return withDb(env, origin, async (db) => {
    const now = clock();
    const [settings, stats, codes, outcomes] = await Promise.all([
      getPromoSettings(db),
      promoStats(db, now),
      listPromoCodes(db, {
        now,
        search: url.searchParams.get("q") ?? "",
        status: url.searchParams.get("status") ?? "",
        limit: Number(url.searchParams.get("limit")) || 500,
      }),
      promoRequestOutcomes(db),
    ]);
    let marketing: { subscribed: number; unsubscribed: number } | null = null;
    if (env.TRACKING_STORE) {
      const all = await listMarketingSubscribers(env.TRACKING_STORE);
      marketing = {
        subscribed: all.filter((s) => !s.unsubscribedAt).length,
        unsubscribed: all.filter((s) => s.unsubscribedAt).length,
      };
    }
    return json({ ok: true, settings, stats, codes, requestOutcomes: outcomes, marketing }, 200, origin);
  });
}

async function handleOwnerSettings(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON" }, 400, origin);
  const parsed = validatePromoSettingsInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400, origin);
  return withDb(env, origin, async (db) => {
    const settings = await savePromoSettings(db, parsed.settings, clock(), "owner");
    return json({ ok: true, settings }, 200, origin);
  });
}

async function handleOwnerDeactivate(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  const code = normalizePromoCode(body?.code);
  if (!code) return json({ error: "Enter a valid code." }, 400, origin);
  const reason = String(body?.reason ?? "Deactivated by owner").trim().slice(0, 200) || "Deactivated by owner";
  return withDb(env, origin, async (db) => {
    const done = await deactivatePromoCode(db, { code, reason, now: clock() });
    if (!done) return json({ error: "That code is already used or deactivated." }, 409, origin);
    return json({ ok: true }, 200, origin);
  });
}

async function handleOwnerExport(request: Request, env: PromoHandlerEnv, origin: string | null): Promise<Response> {
  const list = new URL(request.url).searchParams.get("list") ?? "codes";
  const date = clock().toISOString().slice(0, 10);
  const csvHeaders = (name: string) => ({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}-${date}.csv"`,
  });
  if (list === "marketing") {
    if (!env.TRACKING_STORE) return json({ error: "Marketing list is not configured" }, 503, origin);
    const all = await listMarketingSubscribers(env.TRACKING_STORE);
    // Only people with valid permission: opted in and not unsubscribed.
    const rows: MarketingSubscriberRow[] = all
      .filter((s) => !s.unsubscribedAt)
      .map(({ unsubscribeToken: _t, ...row }) => row);
    return new Response(marketingSubscribersCsv(rows), { status: 200, headers: { ...corsHeaders(origin), ...csvHeaders("marketing-permission") } });
  }
  return withDb(env, origin, async (db) => {
    const codes = await listPromoCodes(db, { now: clock(), limit: 2000 });
    return new Response(promoCodesCsv(codes), { status: 200, headers: { ...corsHeaders(origin), ...csvHeaders("promo-codes") } });
  });
}
