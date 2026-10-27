/**
 * Owner pause: the hourly job sends no automatic Return Journey Offer emails.
 * Run: tsx scripts/check-return-offer-pause.ts
 */
import assert from "node:assert/strict";
import { RETURN_OFFER_CONFIG, resolveReturnOfferConfig } from "../shared/return-offer";
import { processDueReturnOffers } from "../workers/addresses/src/return-offer-handlers";

assert.equal(RETURN_OFFER_CONFIG.automaticEmailsPaused, true, "automatic offer emails are paused");
assert.equal(resolveReturnOfferConfig({}).automaticEmailsPaused, true, "env delay overrides keep the pause");

// A store that fails the test if the job touches bookings, offers or email.
const untouchable = new Proxy({}, {
  get() {
    throw new Error("paused job must not read or write the store");
  },
}) as unknown as KVNamespace;

async function main() {
  const result = await processDueReturnOffers({ TRACKING_STORE: untouchable } as never);
  assert.deepEqual(result, { scanned: 0, scheduled: 0, sent: 0, skipped: 0, errors: 0 });
  console.log("PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
