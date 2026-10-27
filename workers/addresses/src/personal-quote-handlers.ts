/**
 * Personal Quote Codes — owner create/list/deactivate + public validate / token lookup.
 * Authorised amount always comes from KV; never trust the browser.
 */

import {
  applyPersonalQuoteDiscount,
  buildPersonalQuoteCustomerUrl,
  evaluatePersonalQuote,
  isLiveDiscountPersonalQuote,
  isValidPersonalQuotePassengerCount,
  parsePersonalQuoteDiscount,
  PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR,
  type PersonalQuoteJourney,
  normalizePersonalQuoteCode,
  normalizePersonalQuoteCustomerToken,
  personalQuoteCustomerError,
  personalQuoteTokenCustomerError,
  resolvePersonalQuoteCheckoutAmount,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import {
  composeFareWithExpressDropOff,
  resolveExpressDropOff,
  toExpressDropOffPersistedFields,
} from "../shared/express-drop-off";
import { resolveAirportTransferIntent } from "../shared/airport-transfer-intent";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { mainQuoteRequestBody, priceWithMainQuoteTool, type MainQuoteEnv } from "./main-quote-pricing";
import {
  createPersonalQuote,
  deactivatePersonalQuote,
  ensurePersonalQuoteCustomerToken,
  getPersonalQuoteByCode,
  getPersonalQuoteByCustomerToken,
  listOpenPersonalQuotes,
  listRecentPersonalQuoteCustomers,
  type PersonalQuoteRecentCustomer,
} from "./personal-quote-store";

export type PersonalQuoteEnv = DriverAuthEnv &
  NonNullable<MainQuoteEnv> & {
    TRACKING_STORE: KVNamespace;
    SITE_ORIGIN?: string;
  };

const MAX_PERSONAL_QUOTE_SUITCASES = 12;

function optionalText(value: unknown, max = 300): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

/** Parse the journey the owner saved with a live-priced personal quote. */
export function parsePersonalQuoteJourney(
  raw: unknown,
): { ok: true; journey: PersonalQuoteJourney } | { ok: false; error: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const passengers = Number(input.passengers);
  if (!isValidPersonalQuotePassengerCount(passengers)) {
    return { ok: false, error: PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR };
  }
  const suitcases = Number(input.suitcases);
  if (!Number.isInteger(suitcases) || suitcases < 0 || suitcases > MAX_PERSONAL_QUOTE_SUITCASES) {
    return { ok: false, error: "Choose the number of suitcases" };
  }
  const vehicle = optionalText(input.vehicle, 120);
  if (!vehicle) return { ok: false, error: "Choose a vehicle" };
  const returnJourney = input.returnJourney === true;
  const pickupPlaceId = optionalText(input.pickupPlaceId, 300);
  const dropoffPlaceId = optionalText(input.dropoffPlaceId, 300);
  const tripDate = optionalText(input.tripDate, 10);
  const tripTime = optionalText(input.tripTime, 5);
  const returnDate = returnJourney ? optionalText(input.returnDate, 10) : undefined;
  const returnTime = returnJourney ? optionalText(input.returnTime, 5) : undefined;
  return {
    ok: true,
    journey: {
      passengers,
      suitcases,
      vehicle,
      returnJourney,
      ...(pickupPlaceId ? { pickupPlaceId } : {}),
      ...(dropoffPlaceId ? { dropoffPlaceId } : {}),
      ...(tripDate ? { tripDate } : {}),
      ...(tripTime ? { tripTime } : {}),
      ...(returnDate ? { returnDate } : {}),
      ...(returnTime ? { returnTime } : {}),
    },
  };
}

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
  | {
      ok: true;
      quotes: ReturnType<typeof ownerView>[];
      recentCustomers: PersonalQuoteRecentCustomer[];
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const [quotes, recentCustomers] = await Promise.all([
    listOpenPersonalQuotes(env.TRACKING_STORE),
    listRecentPersonalQuoteCustomers(env.TRACKING_STORE),
  ]);
  const origin = siteOrigin(env);
  return { ok: true, quotes: quotes.map((q) => ownerView(q, origin)), recentCustomers };
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

    // Live-priced quotes: price the saved journey with the public quote tool
    // (owner's live settings), then apply the owner's discount. Browser
    // amounts are ignored.
    let livePricing:
      | {
          pricingMode: "live-discount";
          discountType: "amount" | "percent";
          discountValue: number;
          journey: PersonalQuoteJourney;
          agreedAmount: number;
          standardWebsiteAmount: number;
          discountAmount: number;
        }
      | null = null;
    if (body.pricingMode === "live-discount") {
      if (!pickupLabel?.trim() || !dropoffLabel?.trim()) {
        return { error: "Choose the pickup and destination addresses", status: 400 };
      }
      const discount = parsePersonalQuoteDiscount({
        discountType: body.discountType,
        discountValue: body.discountValue,
      });
      if (!discount.ok) return { error: discount.error, status: 400 };
      const journey = parsePersonalQuoteJourney(body.journey);
      if (!journey.ok) return { error: journey.error, status: 400 };
      const priced = await priceWithMainQuoteTool(
        mainQuoteRequestBody({
          pickupAddress: pickupLabel.trim(),
          dropoffAddress: dropoffLabel.trim(),
          pickupPlaceId: journey.journey.pickupPlaceId,
          dropoffPlaceId: journey.journey.dropoffPlaceId,
          airportCode,
          fromAirport,
          returnJourney: journey.journey.returnJourney,
          outboundDate: journey.journey.tripDate,
          outboundTime: journey.journey.tripTime,
          returnDate: journey.journey.returnDate,
          returnTime: journey.journey.returnTime,
          passengers: journey.journey.passengers,
          suitcases: journey.journey.suitcases,
          vehicleType: journey.journey.vehicle,
        }),
        env,
        { forwardAuthFrom: request },
      );
      if (!priced.ok) return { error: priced.message, status: priced.status >= 500 ? 503 : 422 };
      const applied = applyPersonalQuoteDiscount(priced.amount, discount);
      livePricing = {
        pricingMode: "live-discount",
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        journey: { ...journey.journey, vehicle: priced.vehicleType || journey.journey.vehicle },
        agreedAmount: applied.transferGbp,
        standardWebsiteAmount: applied.websiteTransferGbp,
        discountAmount: applied.discountGbp,
      };
    }

    const quote = await createPersonalQuote(env.TRACKING_STORE, {
      customerName: String(body.customerName ?? ""),
      customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
      customerMobile: body.customerMobile ? String(body.customerMobile) : undefined,
      agreedAmount: livePricing ? livePricing.agreedAmount : Number(body.agreedAmount),
      standardWebsiteAmount: livePricing
        ? livePricing.standardWebsiteAmount
        : body.standardWebsiteAmount != null && body.standardWebsiteAmount !== ""
          ? Number(body.standardWebsiteAmount)
          : undefined,
      discountAmount: livePricing
        ? livePricing.discountAmount
        : body.discountAmount != null && body.discountAmount !== ""
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
      ...(livePricing
        ? {
            pricingMode: livePricing.pricingMode,
            discountType: livePricing.discountType,
            discountValue: livePricing.discountValue,
            journey: livePricing.journey,
          }
        : {}),
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
  options?: {
    returnJourney?: boolean;
    /** Customer Express choice only — fee is re-derived server-side. */
    expressDropOffSelected?: boolean | null;
    /**
     * Live-priced quotes only: the customer's final booking choices. The
     * route must match the quote; everything else may change and is re-priced
     * by the public quote tool before the owner's discount is applied.
     */
    liveBooking?: {
      pickupLabel: string;
      dropoffLabel: string;
      pickupPlaceId?: string | null;
      dropoffPlaceId?: string | null;
      passengers: number;
      suitcases: number;
      vehicle: string;
      tripDate?: string;
      tripTime?: string;
      returnDate?: string;
      returnTime?: string;
    };
    /** Required for live-priced quotes (runs the public quote tool). */
    pricingEnv?: MainQuoteEnv;
  },
): Promise<
  | {
      ok: true;
      record: PersonalQuoteRecord;
      amount: number;
      oneWayAgreedAmount: number;
      /** Live-priced quotes: the public quote tool's price before the discount. */
      websiteTransferGbp?: number;
      discountGbp?: number;
      expressDropOffSelected: boolean;
      expressDropOffFee: number;
      expressDropOffAirport: "BFS" | "BHD" | null;
    }
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

  const stored = evaluated.record;
  const inferred = resolveAirportTransferIntent({
    airportCode: stored.airportCode ?? null,
    fromAirport: typeof stored.fromAirport === "boolean" ? stored.fromAirport : null,
    pickupAddress: stored.pickupLabel ?? "",
    dropoffAddress: stored.dropoffLabel ?? "",
  });
  const airportCodeRaw = String(inferred?.airportCode ?? stored.airportCode ?? "")
    .trim()
    .toUpperCase();
  const airportCode =
    airportCodeRaw === "BFS" ||
    airportCodeRaw === "BHD" ||
    airportCodeRaw === "DUB" ||
    airportCodeRaw === "LDY"
      ? airportCodeRaw
      : null;
  const fromAirport =
    inferred?.fromAirport ??
    (typeof stored.fromAirport === "boolean" ? stored.fromAirport : false);

  const expressSelection = resolveExpressDropOff({
    airportCode,
    fromAirport,
    returnJourney: Boolean(options?.returnJourney),
    selected: options?.expressDropOffSelected,
  });
  const expressFields = toExpressDropOffPersistedFields(expressSelection);

  if (isLiveDiscountPersonalQuote(stored)) {
    const live = options?.liveBooking;
    if (!live || !options?.pricingEnv) {
      return { ok: false, error: personalQuoteCustomerError("invalid_amount"), status: 400 };
    }
    const sameRoute = (a?: string, b?: string) =>
      (a ?? "").trim().toLowerCase().replace(/\s+/g, " ") ===
      (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!sameRoute(live.pickupLabel, stored.pickupLabel) || !sameRoute(live.dropoffLabel, stored.dropoffLabel)) {
      return {
        ok: false,
        error: "This personal quote is for a specific route. Please contact My Airport Taxi NI to change the addresses.",
        status: 409,
      };
    }
    if (!isValidPersonalQuotePassengerCount(live.passengers)) {
      return { ok: false, error: PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR, status: 400 };
    }
    const priced = await priceWithMainQuoteTool(
      mainQuoteRequestBody({
        pickupAddress: stored.pickupLabel ?? live.pickupLabel,
        dropoffAddress: stored.dropoffLabel ?? live.dropoffLabel,
        pickupPlaceId: stored.journey?.pickupPlaceId ?? live.pickupPlaceId ?? null,
        dropoffPlaceId: stored.journey?.dropoffPlaceId ?? live.dropoffPlaceId ?? null,
        airportCode,
        fromAirport,
        returnJourney: Boolean(options?.returnJourney),
        outboundDate: live.tripDate,
        outboundTime: live.tripTime,
        returnDate: live.returnDate,
        returnTime: live.returnTime,
        passengers: live.passengers,
        suitcases: live.suitcases,
        vehicleType: live.vehicle,
      }),
      options.pricingEnv,
    );
    if (!priced.ok) {
      return { ok: false, error: priced.message, status: priced.status >= 500 ? 503 : 409 };
    }
    const applied = applyPersonalQuoteDiscount(priced.amount, stored);
    const amount = composeFareWithExpressDropOff({
      transferFareGbp: applied.transferGbp,
      expressDropOffFeeGbp: expressFields.expressDropOffFee,
    }).totalGbp;
    if (!Number.isFinite(amount) || amount < 1) {
      return { ok: false, error: personalQuoteCustomerError("invalid_amount"), status: 400 };
    }
    return {
      ok: true,
      record: stored,
      amount,
      oneWayAgreedAmount: applied.transferGbp,
      websiteTransferGbp: applied.websiteTransferGbp,
      discountGbp: applied.discountGbp,
      expressDropOffSelected: expressFields.expressDropOffSelected,
      expressDropOffFee: expressFields.expressDropOffFee,
      expressDropOffAirport: expressFields.expressDropOffAirport,
    };
  }

  const oneWayAgreedAmount = Math.round(stored.agreedAmount * 100) / 100;
  const amount = resolvePersonalQuoteCheckoutAmount({
    agreedAmount: oneWayAgreedAmount,
    standardWebsiteAmount: stored.standardWebsiteAmount,
    returnJourney: Boolean(options?.returnJourney),
    expressDropOffFee: expressFields.expressDropOffFee,
  });
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: personalQuoteCustomerError("invalid_amount"), status: 400 };
  }

  return {
    ok: true,
    record: stored,
    amount,
    oneWayAgreedAmount,
    expressDropOffSelected: expressFields.expressDropOffSelected,
    expressDropOffFee: expressFields.expressDropOffFee,
    expressDropOffAirport: expressFields.expressDropOffAirport,
  };
}
