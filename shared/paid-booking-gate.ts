/**
 * Hard gate: SumUp checkout must not start without a complete bookable payload.
 * Used by the website Pay button and the Worker /payments endpoint.
 */

export type PaymentBookingGateInput = {
  customerName?: string | null;
  customerEmail?: string | null;
  mobileNumber?: string | null;
  tripLabel?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  returnJourney?: boolean | null;
  returnDate?: string | null;
  returnTime?: string | null;
  vehicle?: string | null;
  passengers?: number | null;
  isAirportTrip?: boolean | null;
  airportCode?: string | null;
  termsAcceptedAt?: string | null;
};

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidMobileNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  if (digits.startsWith("44")) {
    return digits.length >= 12;
  }
  if (digits.startsWith("0")) {
    return digits.length >= 10;
  }
  return digits.length >= 10;
}

/** Returns human-readable blockers; empty array means payment may proceed. */
export function getPaymentBookingBlockers(input: PaymentBookingGateInput): string[] {
  const blockers: string[] = [];

  const name = String(input.customerName ?? "").trim();
  const email = String(input.customerEmail ?? "").trim();
  const mobile = String(input.mobileNumber ?? "").trim();
  const tripLabel = String(input.tripLabel ?? "").trim();
  const pickup = String(input.pickupLabel ?? "").trim();
  const dropoff = String(input.dropoffLabel ?? "").trim();
  const tripDate = String(input.tripDate ?? "").trim();
  const tripTime = String(input.tripTime ?? "").trim();
  const vehicle = String(input.vehicle ?? "").trim();
  const returnDate = String(input.returnDate ?? "").trim();
  const returnTime = String(input.returnTime ?? "").trim();
  const airportCode = String(input.airportCode ?? "").trim();
  const termsAcceptedAt = String(input.termsAcceptedAt ?? "").trim();
  const passengers = Number(input.passengers);

  if (!name) {
    blockers.push("Full name is required.");
  }
  if (!email) {
    blockers.push("Email address is required.");
  } else if (!isValidEmailAddress(email)) {
    blockers.push("Email address is not valid.");
  }
  if (!mobile) {
    blockers.push("Mobile number is required.");
  } else if (!isValidMobileNumber(mobile)) {
    blockers.push("Mobile number is not valid.");
  }
  if (!tripLabel) {
    blockers.push("Trip type is required.");
  }
  if (!pickup) {
    blockers.push("Pickup location is required.");
  }
  if (!dropoff) {
    blockers.push("Drop-off location is required.");
  }
  if (!tripDate) {
    blockers.push("Pickup date is required.");
  }
  if (!tripTime) {
    blockers.push("Pickup time is required.");
  }
  if (input.returnJourney) {
    if (!returnDate) {
      blockers.push("Return date is required for a return journey.");
    }
    if (!returnTime) {
      blockers.push("Return time is required for a return journey.");
    }
  }
  if (!vehicle) {
    blockers.push("Vehicle is required.");
  }
  if (!Number.isFinite(passengers) || passengers < 1) {
    blockers.push("Passenger count is required.");
  }
  if (input.isAirportTrip && !airportCode) {
    blockers.push("Airport is required for airport transfers.");
  }
  if (!termsAcceptedAt) {
    blockers.push("Terms must be accepted before payment.");
  }

  return blockers;
}

export function assertPaymentBookingComplete(input: PaymentBookingGateInput): void {
  const blockers = getPaymentBookingBlockers(input);
  if (blockers.length > 0) {
    throw new Error(blockers[0]);
  }
}
