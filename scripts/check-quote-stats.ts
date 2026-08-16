/**
 * Smoke-check quote stats helpers stay consistent with booking ref maths.
 */
import assert from "node:assert/strict";
import { STARTING_BOOKING_REF } from "../workers/addresses/shared/booking-reference";

function bookingsIssuedFromNextRef(nextStored: string | null): number {
  if (!nextStored) {
    return 0;
  }
  const parsed = Number(nextStored);
  if (!Number.isFinite(parsed) || parsed < STARTING_BOOKING_REF) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed) - STARTING_BOOKING_REF);
}

assert.equal(bookingsIssuedFromNextRef(null), 0);
assert.equal(bookingsIssuedFromNextRef("1001"), 0);
assert.equal(bookingsIssuedFromNextRef("1005"), 4);
assert.equal(bookingsIssuedFromNextRef("abc"), 0);

console.log("check-quote-stats: ok");
