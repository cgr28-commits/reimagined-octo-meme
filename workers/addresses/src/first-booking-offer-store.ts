/**
 * KV helpers for one-time £5 first-booking offer redemption by email.
 */

import {
  firstBookingOfferRedeemedKey,
  normalizeFirstBookingEmail,
} from "../shared/first-booking-offer";

const REDEEM_TTL_SECONDS = 60 * 60 * 24 * 400;

export async function hasRedeemedFirstBookingOffer(
  store: KVNamespace | undefined,
  email: string,
): Promise<boolean> {
  if (!store) return false;
  const normalised = normalizeFirstBookingEmail(email);
  if (!normalised || !normalised.includes("@")) return false;
  const existing = await store.get(firstBookingOfferRedeemedKey(normalised));
  return Boolean(existing);
}

export async function markFirstBookingOfferRedeemed(
  store: KVNamespace | undefined,
  email: string,
  paymentReference?: string,
): Promise<void> {
  if (!store) return;
  const normalised = normalizeFirstBookingEmail(email);
  if (!normalised || !normalised.includes("@")) return;
  await store.put(
    firstBookingOfferRedeemedKey(normalised),
    JSON.stringify({
      redeemedAt: new Date().toISOString(),
      ...(paymentReference ? { paymentReference } : {}),
    }),
    { expirationTtl: REDEEM_TTL_SECONDS },
  );
}
