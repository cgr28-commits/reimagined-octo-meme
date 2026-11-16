/**
 * Promo codes inside the booking / payment lifecycle.
 *
 *   checkout started  → reservePromoForCheckout (temporary key) → movePromoReservation(checkout id)
 *   short-notice      → movePromoReservation("sn:<ref>") until the owner decides / pickup
 *   paid or card hold → redeemPromoForPaidBooking (finalizePaidCheckout) — the code is consumed
 *   expired / failed  → releasePromoForCheckout (Stripe webhook, SumUp failure)
 *   full cancellation → reinstatePromoForCancelledBooking (refund side effects)
 *
 * Every function fails safe: a missing table or D1 outage never breaks a payment that has
 * already been taken; the owner is told instead.
 */
import {
  promoBlackoutFor,
  promoBlackoutMessage,
  promoRejectMessage,
  type PromoRejectReason,
  type PromoTerms,
} from "../shared/promo-code";
import {
  PROMO_RESERVATION_MS,
  checkPromoCodeForBooking,
  getPromoSettings,
  promoDb,
  rebindPromoReservation,
  redeemPromoCode,
  reinstatePromoCode,
  releasePromoReservation,
  reservePromoCode,
  type PromoEnv,
} from "./promo-store";

export { PROMO_RESERVATION_MS };

export type PromoCheckoutCheck =
  | { ok: true; terms: PromoTerms; emailHash: string }
  | { ok: false; reason: PromoRejectReason; minimumVehicleFareGbp?: number; message?: string };

export async function checkPromoForWebsiteBooking(
  env: PromoEnv,
  input: {
    code: string;
    bookingEmail: string;
    otherOfferApplied: boolean;
    /** Every journey date on the booking (outward, and return when booked). */
    journeyDates?: Array<string | null | undefined>;
    now?: Date;
  },
): Promise<PromoCheckoutCheck> {
  const db = promoDb(env);
  if (!db) return { ok: false, reason: "unavailable" };
  try {
    const settings = await getPromoSettings(db);
    if (!settings.enabled) return { ok: false, reason: "disabled" };
    const check = await checkPromoCodeForBooking(db, {
      code: input.code,
      bookingEmail: input.bookingEmail,
      now: input.now ?? new Date(),
      secret: env.PROMO_HASH_SECRET?.trim() ?? "",
    });
    if (!check.ok) return check;
    if (input.otherOfferApplied) return { ok: false, reason: "not_combinable" };
    const blackout = promoBlackoutFor(input.journeyDates ?? [], settings.blackoutDates);
    if (blackout) return { ok: false, reason: "blackout_date", message: promoBlackoutMessage(blackout) };
    return { ok: true, terms: check.terms, emailHash: check.emailHash };
  } catch (error) {
    console.error("Promo check failed", error instanceof Error ? error.message : "");
    return { ok: false, reason: "unavailable" };
  }
}

export async function reservePromoForCheckout(
  env: PromoEnv,
  input: { code: string; emailHash: string; key: string; holdMs: number; now?: Date },
): Promise<boolean> {
  const db = promoDb(env);
  if (!db) return false;
  const now = input.now ?? new Date();
  try {
    return await reservePromoCode(db, {
      code: input.code,
      emailHash: input.emailHash,
      key: input.key,
      until: new Date(now.getTime() + input.holdMs),
      now,
    });
  } catch (error) {
    console.error("Promo reserve failed", error instanceof Error ? error.message : "");
    return false;
  }
}

/** Best effort: a hold that cannot be moved simply lapses; redemption never depends on the key. */
export async function movePromoReservation(
  env: PromoEnv,
  reservation: { code: string; key: string },
  toKey: string,
  until: Date,
): Promise<void> {
  const db = promoDb(env);
  if (!db || !toKey) return;
  try {
    const moved = await rebindPromoReservation(db, { code: reservation.code, fromKey: reservation.key, toKey, until });
    if (moved) reservation.key = toKey;
  } catch (error) {
    console.error("Promo reservation move failed", error instanceof Error ? error.message : "");
  }
}

/** Card holds and short-notice requests keep the code until the pickup (max 14 days). */
export function promoHoldUntilPickup(booking: { tripDate?: string; tripTime?: string } | null | undefined, now = new Date()): Date {
  const date = String(booking?.tripDate ?? "").trim();
  const time = String(booking?.tripTime ?? "").trim() || "23:59";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : "23:59"}:00Z`) : NaN;
  const max = now.getTime() + 14 * 86_400_000;
  const min = now.getTime() + PROMO_RESERVATION_MS;
  // +1 day covers UK summer time and late approvals; never less than a normal checkout hold.
  const until = Number.isFinite(parsed) ? Math.min(Math.max(parsed + 86_400_000, min), max) : min;
  return new Date(until);
}

export async function releasePromoForCheckout(env: PromoEnv, key: string): Promise<void> {
  const db = promoDb(env);
  if (!db || !key) return;
  try {
    await releasePromoReservation(db, { key });
  } catch (error) {
    console.error("Promo release failed", error instanceof Error ? error.message : "");
  }
}

export type PromoRedeemAlert = (subject: string, body: string) => Promise<void>;

/**
 * Called once a booking is confirmed as paid (or its card hold authorised and the booking
 * confirmed). Records the use, even after expiry/deactivation, because the customer has already
 * been charged the discounted price. A second booking on a spent code alerts the owner.
 */
export async function redeemPromoForPaidBooking(
  env: PromoEnv,
  input: {
    booking: {
      promoCode?: string;
      promoCodeSavingGbp?: number;
      promoEligibleVehicleFareGbp?: number;
      finalAmountPayableGbp?: number;
      customerName?: string;
    };
    checkoutId: string;
    bookingReference: string;
    amountGbp: number;
    alertOwner?: PromoRedeemAlert;
    now?: Date;
  },
): Promise<"none" | "redeemed" | "already" | "conflict" | "failed"> {
  const code = input.booking.promoCode?.trim();
  if (!code) return "none";
  const db = promoDb(env);
  const alert = async (subject: string, body: string) => {
    try {
      await input.alertOwner?.(subject, body);
    } catch {
      // never block confirmation
    }
  };
  if (!db) {
    await alert(
      `Promo code ${code} could not be recorded — ${input.bookingReference}`,
      `Booking ${input.bookingReference} was paid with promo code ${code}, but the promo database is not available, so the code was not marked as used.\n\nPlease deactivate ${code} in Owner Dashboard → Promo Codes & Email Marketing once it is back.`,
    );
    return "failed";
  }
  try {
    const outcome = await redeemPromoCode(db, {
      code,
      key: input.checkoutId,
      bookingReference: input.bookingReference,
      discountGbp: Number(input.booking.promoCodeSavingGbp) || 0,
      vehicleFareGbp: Number(input.booking.promoEligibleVehicleFareGbp) || 0,
      bookingTotalGbp: Number(input.booking.finalAmountPayableGbp ?? input.amountGbp) || 0,
      now: input.now ?? new Date(),
    });
    if (outcome === "conflict") {
      await alert(
        `Promo code used twice — ${code}`,
        `Promo code ${code} was already used on another booking, and booking ${input.bookingReference} (${input.booking.customerName || "customer"}) has also been paid with it.\n\n` +
          `Both payments went through at the discounted price. The code is marked in Owner Dashboard → Promo Codes & Email Marketing. ` +
          `No action is required unless you want to contact the customer.`,
      );
      return "conflict";
    }
    if (outcome === "missing") {
      await alert(
        `Unknown promo code on booking ${input.bookingReference}`,
        `Booking ${input.bookingReference} carries promo code ${code}, which is not in the promo database. Please check the booking.`,
      );
      return "failed";
    }
    return outcome === "redeemed" ? "redeemed" : "already";
  } catch (error) {
    console.error("Promo redeem failed", error instanceof Error ? error.message : "");
    await alert(
      `Promo code ${code} could not be recorded — ${input.bookingReference}`,
      `Booking ${input.bookingReference} was paid with promo code ${code}, but marking the code as used failed (${error instanceof Error ? error.message : "unknown error"}).\n\nPlease deactivate ${code} in Owner Dashboard → Promo Codes & Email Marketing.`,
    );
    return "failed";
  }
}

/** Whole booking cancelled with a full refund: the code becomes usable again until its expiry. */
export async function reinstatePromoForCancelledBooking(
  env: PromoEnv,
  input: { promoCode?: string; bookingReference: string; refundedGbp: number; paidGbp: number; now?: Date },
): Promise<boolean> {
  const code = input.promoCode?.trim();
  if (!code || !input.bookingReference) return false;
  if (!(input.refundedGbp + 0.005 >= input.paidGbp)) return false;
  const db = promoDb(env);
  if (!db) return false;
  try {
    return await reinstatePromoCode(db, { code, bookingReference: input.bookingReference, now: input.now ?? new Date() });
  } catch (error) {
    console.error("Promo reinstate failed", error instanceof Error ? error.message : "");
    return false;
  }
}

export { promoRejectMessage };
