/**
 * Personal Quote Codes — owner create/list/deactivate + public validate.
 * Authorised amount always comes from KV; never trust the browser.
 */

import {
  evaluatePersonalQuote,
  normalizePersonalQuoteCode,
  personalQuoteCustomerError,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  createPersonalQuote,
  deactivatePersonalQuote,
  getPersonalQuoteByCode,
  listOpenPersonalQuotes,
} from "./personal-quote-store";

export type PersonalQuoteEnv = DriverAuthEnv & {
  TRACKING_STORE: KVNamespace;
};

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

function ownerView(record: PersonalQuoteRecord) {
  return {
    ...record,
    amountLabel: `£${(Math.round(record.agreedAmount * 100) / 100).toFixed(2)}`,
    redeemable: evaluatePersonalQuote(record).ok,
  };
}

export async function handleOwnerListPersonalQuotes(
  request: Request,
  env: PersonalQuoteEnv,
): Promise<{ ok: true; quotes: ReturnType<typeof ownerView>[] } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const quotes = await listOpenPersonalQuotes(env.TRACKING_STORE);
  return { ok: true, quotes: quotes.map(ownerView) };
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
    const quote = await createPersonalQuote(env.TRACKING_STORE, {
      customerName: String(body.customerName ?? ""),
      customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
      agreedAmount: Number(body.agreedAmount),
      standardWebsiteAmount:
        body.standardWebsiteAmount != null && body.standardWebsiteAmount !== ""
          ? Number(body.standardWebsiteAmount)
          : undefined,
      pickupLabel: body.pickupLabel ? String(body.pickupLabel) : undefined,
      dropoffLabel: body.dropoffLabel ? String(body.dropoffLabel) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      singleUse: body.singleUse !== false && body.singleUse !== "false" && body.singleUse !== 0,
      expiresOn: String(body.expiresOn ?? "").trim(),
    });
    return { ok: true, quote: ownerView(quote) };
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
  return { ok: true, quote: ownerView(quote) };
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
 * Resolve authorised amount for SumUp / short-notice create.
 * Ignores any client-supplied amount when a code is present.
 */
export async function resolvePersonalQuoteForPayment(
  store: KVNamespace,
  code: string,
): Promise<
  | { ok: true; record: PersonalQuoteRecord; amount: number }
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
  return {
    ok: true,
    record: evaluated.record,
    amount: Math.round(evaluated.record.agreedAmount * 100) / 100,
  };
}
