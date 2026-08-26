/**
 * Personal Quote Codes — owner create/list/deactivate + public validate / token lookup.
 * Authorised amount always comes from KV; never trust the browser.
 */

import {
  buildPersonalQuoteCustomerUrl,
  evaluatePersonalQuote,
  normalizePersonalQuoteCode,
  normalizePersonalQuoteCustomerToken,
  personalQuoteCustomerError,
  personalQuoteTokenCustomerError,
  resolvePersonalQuoteCheckoutAmount,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import {
  resolveExpressDropOff,
  toExpressDropOffPersistedFields,
} from "../shared/express-drop-off";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  createPersonalQuote,
  deactivatePersonalQuote,
  ensurePersonalQuoteCustomerToken,
  getPersonalQuoteByCode,
  getPersonalQuoteByCustomerToken,
  listOpenPersonalQuotes,
} from "./personal-quote-store";

export type PersonalQuoteEnv = DriverAuthEnv & {
  TRACKING_STORE: KVNamespace;
  SITE_ORIGIN?: string;
};

const DEFAULT_SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

function siteOrigin(env: PersonalQuoteEnv): string {
  return (env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

export function isOwnerPersonalQuotesPath(pathname: string): boolean {
  return (
    pathname === "/owner/personal-quotes" ||
    pathname === "/api/owner/personal-quotes" ||
    pathname === "/owner/personal-quotes/deactivate" ||
    pathname === "/api/owner/personal-quotes/deactivate"
  );
}

export function isPublicPersonalQuoteValidatePath(pathname: string): boolean {
  return (
    pathname === "/personal-quotes/validate" ||
    pathname === "/api/personal-quotes/validate"
  );
}

export function isPublicPersonalQuoteTokenPath(pathname: string): boolean {
  return (
    pathname === "/personal-quotes/by-token" ||
    pathname === "/api/personal-quotes/by-token"
  );
}

function ownerView(record: PersonalQuoteRecord, origin: string) {
  const token = record.customerToken
    ? normalizePersonalQuoteCustomerToken(record.customerToken)
    : "";
  return {
    ...record,
    amountLabel: `£${(Math.round(record.agreedAmount * 100) / 100).toFixed(2)}`,
    redeemable: evaluatePersonalQuote(record).ok,
    ...(token
      ? {
          customerToken: token,
          customerLink: buildPersonalQuoteCustomerUrl(token, origin),
        }
      : {}),
  };
}

export async function handleOwnerListPersonalQuotes(
  request: Request,
  env: PersonalQuoteEnv,
): Promise<
  | { ok: true; quotes: ReturnType<typeof ownerView>[] }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const quotes = await listOpenPersonalQuotes(env.TRACKING_STORE);
  const origin = siteOrigin(env);
  return { ok: true, quotes: quotes.map((q) => ownerView(q, origin)) };
}

export async function handleOwnerCreatePersonalQuote(
  request: Request,
  env: PersonalQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; quote: ReturnType<typeof ownerView> }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }

  try {
    const pickupLabel = body.pickupLabel ? String(body.pickupLabel) : undefined;
    const dropoffLabel = body.dropoffLabel ? String(body.dropoffLabel) : undefined;
    const inferred = resolveAirportTransferIntent({
      airportCode: body.airportCode == null ? null : String(body.airportCode),
      fromAirport: typeof body.fromAirport === "boolean" ? body.fromAirport : null,
      pickupAddress: pickupLabel ?? "",
      dropoffAddress: dropoffLabel ?? "",
    });
    const airportCodeRaw = String(
      inferred?.airportCode ?? body.airportCode ?? "",
    )
      .trim()
      .toUpperCase();
    const airportCode =
      airportCodeRaw === "BFS" ||
      airportCodeRaw === "BHD" ||
      airportCodeRaw === "DUB" ||
      airportCodeRaw === "LDY"
        ? airportCodeRaw
        : null;
    const fromAirport = inferred?.fromAirport ?? body.fromAirport === true;
    const expressSelection = resolveExpressDropOff({
      airportCode,
      fromAirport,
      returnJourney: false,
      selected: body.expressDropOffSelected !== false,
    });
    const expressFields = toExpressDropOffPersistedFields(expressSelection);

    const quote = await createPersonalQuote(env.TRACKING_STORE, {
      customerName: String(body.customerName ?? ""),
      customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
      customerMobile: body.customerMobile ? String(body.customerMobile) : undefined,
      agreedAmount: Number(body.agreedAmount),
      standardWebsiteAmount:
        body.standardWebsiteAmount != null && body.standardWebsiteAmount !== ""
          ? Number(body.standardWebsiteAmount)
          : undefined,
      discountAmount:
        body.discountAmount != null && body.discountAmount !== ""
          ? Number(body.discountAmount)
          : undefined,
      pickupLabel,
      dropoffLabel,
      notes: body.notes ? String(body.notes) : undefined,
      singleUse: body.singleUse !== false && body.singleUse !== "false" && body.singleUse !== 0,
      expiresOn: String(body.expiresOn ?? "").trim(),
      expressDropOffSelected: expressFields.expressDropOffSelected,
      expressDropOffFee: expressFields.expressDropOffFee,
      expressDropOffAirport: expressFields.expressDropOffAirport,
      airportCode,
      fromAirport,
    });
    return { ok: true, quote: ownerView(quote, siteOrigin(env)) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create personal quote",
      status: 400,
    };
  }
}

export async function handleOwnerDeactivatePersonalQuote(
  request: Request,
  env: PersonalQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; quote: ReturnType<typeof ownerView> }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const code = normalizePersonalQuoteCode(String(body.code ?? ""));
  if (!code) {
    return { error: "Quote code is required", status: 400 };
  }
  const quote = await deactivatePersonalQuote(env.TRACKING_STORE, code);
  if (!quote) {
    return { error: "Quote not found", status: 404 };
  }
  return { ok: true, quote: ownerView(quote, siteOrigin(env)) };
}

/**
 * Public validate — returns only customer-safe summary.
 * Does not consume the quote (failed SumUp must leave it redeemable).
 */
export async function handlePublicValidatePersonalQuote(
  env: PersonalQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; quote: ReturnType<typeof toPersonalQuotePublicSummary> }
  | { ok: false; error: string; status: number }
> {
  const code = normalizePersonalQuoteCode(String(body.code ?? body.personalQuoteCode ?? ""));
  if (!code) {
    return {
      ok: false,
      error: personalQuoteCustomerError("not_found"),
      status: 400,
    };
  }

  const record = await getPersonalQuoteByCode(env.TRACKING_STORE, code);
  const evaluated = evaluatePersonalQuote(record);
  if (!evaluated.ok) {
    return {
      ok: false,
      error: personalQuoteCustomerError(evaluated.error),
      status: evaluated.error === "not_found" ? 404 : 409,
    };
  }

  return { ok: true, quote: toPersonalQuotePublicSummary(evaluated.record) };
}

/**
 * Public lookup by opaque customer token (private link).
 * Does not consume the quote. Never trusts URL fare params.
 */
export async function handlePublicPersonalQuoteByToken(
  env: PersonalQuoteEnv,
  tokenRaw: string,
): Promise<
  | { ok: true; quote: ReturnType<typeof toPersonalQuotePublicSummary> }
  | { ok: false; error: string; status: number }
> {
  const token = normalizePersonalQuoteCustomerToken(tokenRaw);
  if (!token || token.length < 32) {
    return {
      ok: false,
      error: personalQuoteTokenCustomerError("not_found"),
      status: 400,
    };
  }

  let record = await getPersonalQuoteByCustomerToken(env.TRACKING_STORE, token);
  if (record && !record.customerToken) {
    record = await ensurePersonalQuoteCustomerToken(env.TRACKING_STORE, record);
  }
  const evaluated = evaluatePersonalQuote(record);
  if (!evaluated.ok) {
    return {
      ok: false,
      error: personalQuoteTokenCustomerError(evaluated.error),
      status: evaluated.error === "not_found" ? 404 : 409,
    };
  }

  return { ok: true, quote: toPersonalQuotePublicSummary(evaluated.record) };
}

/**
 * Resolve authorised amount for SumUp / short-notice create.
 * Ignores any client-supplied amount when a code is present.
 */
export async function resolvePersonalQuoteForPayment(
  store: KVNamespace,
  code: string,
  options?: { returnJourney?: boolean },
): Promise<
  | { ok: true; record: PersonalQuoteRecord; amount: number; oneWayAgreedAmount: number }
  | { ok: false; error: string; status: number }
> {
  const normalized = normalizePersonalQuoteCode(code);
  if (!normalized) {
    return { ok: false, error: personalQuoteCustomerError("not_found"), status: 400 };
  }
  const record = await getPersonalQuoteByCode(store, normalized);
  const evaluated = evaluatePersonalQuote(record);
  if (!evaluated.ok) {
    return {
      ok: false,
      error: personalQuoteCustomerError(evaluated.error),
      status: evaluated.error === "not_found" ? 404 : 409,
    };
  }

  const oneWayAgreedAmount = Math.round(evaluated.record.agreedAmount * 100) / 100;
  const amount = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: oneWayAgreedAmount,
    standardWebsiteAmount: evaluated.record.standardWebsiteAmount,
    returnJourney: Boolean(options?.returnJourney),
    expressDropOffFee: evaluated.record.expressDropOffFee ?? 0,
  });
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: personalQuoteCustomerError("invalid_amount"), status: 400 };
  }

  return {
    ok: true,
    record: evaluated.record,
    amount,
    oneWayAgreedAmount,
  };
}
