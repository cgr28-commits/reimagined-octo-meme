/**
 * Child / booster seats on the booking-details step + desktop SumUp handoff.
 * Run: npx tsx scripts/check-child-seats-booking-sumup.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildBookingMessage,
  formatChildSeatsLine,
  normalizeChildSeats,
  type BookingDetails,
} from "../src/lib/booking-message";
import {
  readBookingFormDraft,
  saveBookingFormDraft,
} from "../src/lib/booking-draft-storage";
import {
  buildCustomerConfirmationEmail,
  buildOwnerPaidBookingEmail,
  buildOwnerPaymentAttemptEmail,
} from "../shared/booking-notifications";
import { QUOTE_REQUIRED_FIELD_MESSAGES } from "../shared/quote-required-field-messages";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    get length() {
      return data.size;
    },
  } as Storage;
}

const bookingBase: BookingDetails = {
  customerName: "Ada Example",
  customerEmail: "ada@example.com",
  mobileNumber: "07700900123",
  tripLabel: "Airport drop-off",
  pickupLabel: "10 Donegall Square North, Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-09-10",
  tripTime: "09:30",
  returnDate: "",
  returnTime: "",
  flightNumber: "",
  passengers: 2,
  suitcases: 2,
  vehicle: "Estate Car (1–4 passengers)",
  estimatedPrice: "£50.00",
  isAirportTrip: true,
  airportCode: "BFS",
  isFromAirport: false,
};

console.log("=== Child-seat helpers ===");
{
  assert.equal(normalizeChildSeats(undefined), 0);
  assert.equal(normalizeChildSeats(0), 0);
  assert.equal(normalizeChildSeats(1), 1);
  assert.equal(normalizeChildSeats(2), 2);
  assert.equal(normalizeChildSeats(9), 2);
  assert.equal(formatChildSeatsLine(0), "");
  assert.equal(formatChildSeatsLine(1, "2-year-old child seat"), "Child seats: 1 (2-year-old child seat)");
  assert.equal(
    formatChildSeatsLine(2, "4-year-old child seat, 7-year-old booster"),
    "Child seats: 2 (4-year-old child seat, 7-year-old booster)",
  );
  console.log("OK  normalize and format 0 / 1 / 2 seats");
}

console.log("\n=== Booking payload and emails ===");
{
  const none = buildBookingMessage({ ...bookingBase, childSeats: 0 });
  assert.doesNotMatch(none, /Child seats:/);

  const one = buildBookingMessage({
    ...bookingBase,
    childSeats: 1,
    childSeatNotes: "2-year-old child seat",
  });
  assert.match(one, /Child seats: 1 \(2-year-old child seat\)/);

  const two = buildBookingMessage({
    ...bookingBase,
    childSeats: 2,
    childSeatNotes: "4-year-old child seat, 7-year-old booster",
  });
  assert.match(two, /Child seats: 2 \(4-year-old child seat, 7-year-old booster\)/);

  const receipt = {
    ...bookingBase,
    childSeats: 2,
    childSeatNotes: "4-year-old child seat, 7-year-old booster",
    amountPaid: "£50.00",
    paymentReference: "PAY-TEST",
    customerReference: "MAT-4827",
  };
  const customer = buildCustomerConfirmationEmail(receipt);
  assert.match(customer.text, /Child seats: 2 \(4-year-old child seat, 7-year-old booster\)/);
  assert.match(customer.html, /Child seats/);
  assert.match(customer.html, /4-year-old child seat, 7-year-old booster/);

  const owner = buildOwnerPaidBookingEmail(receipt);
  assert.match(owner.body, /Child seats: 2 \(4-year-old child seat, 7-year-old booster\)/);

  const attempt = buildOwnerPaymentAttemptEmail(
    {
      ...bookingBase,
      childSeats: 1,
      childSeatNotes: "2-year-old child seat",
    },
    { amountLabel: "£50.00", checkoutId: "chk_test", checkoutReference: "MAT-TEST-001" },
  );
  assert.match(attempt.body, /Child seats: 1 \(2-year-old child seat\)/);
  console.log("OK  no seat / one seat / two seats appear in payload and emails");
}

console.log("\n=== Draft restore after returning from SumUp ===");
{
  const session = memoryStorage();
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { sessionStorage: Storage }).sessionStorage = session;

  saveBookingFormDraft({
    quoteStep: 3,
    customerName: "Ada Example",
    childSeats: 2,
    childSeatNotes: "4-year-old child seat, 7-year-old booster",
  });
  const restored = readBookingFormDraft();
  assert.equal(restored?.childSeats, 2);
  assert.equal(restored?.childSeatNotes, "4-year-old child seat, 7-year-old booster");
  console.log("OK  booking draft keeps child seats across the SumUp return");
}

console.log("\n=== QuoteCard booking-details wiring ===");
{
  const card = read("src/components/QuoteCard.tsx");
  const draft = read("src/lib/booking-draft-storage.ts");
  const confirmed = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
  const manage = read("src/app/manage-booking/ManageBookingClient.tsx");
  const workerIndex = read("workers/addresses/src/index.ts");
  const persist = read("workers/addresses/src/refund-handlers.ts");

  assert.match(card, /const \[childSeats, setChildSeats\] = useState\(0\)/);
  assert.match(card, /const \[childSeatNotes, setChildSeatNotes\] = useState\(""\)/);
  assert.match(card, /Child \/ booster seats/);
  assert.match(
    card,
    /Tell us each child’s age and whether you need a child seat or booster seat\./,
  );
  assert.match(
    card,
    /Child seats are requested subject to availability\. We’ll confirm your request\./,
  );
  assert.match(card, /setChildSeats\(normalizeChildSeats\(draft\.childSeats\)\)/);
  assert.match(card, /setChildSeatNotes\(draft\.childSeatNotes\?\.trim\(\) \|\| ""\)/);
  assert.match(card, /childSeats,\s*childSeatNotes: childSeats > 0 \? childSeatNotes\.trim\(\) : ""/);
  assert.match(card, /childSeats,\s*childSeatNotes: childSeats > 0 \? childSeatNotes\.trim\(\) : undefined/);
  assert.match(card, /setChildSeats\(0\)/);
  assert.match(card, /QUOTE_REQUIRED_FIELD_MESSAGES\.childSeatNotes/);
  assert.match(card, /childSeats > 0 && !childSeatNotes\.trim\(\)/);
  assert.equal(
    QUOTE_REQUIRED_FIELD_MESSAGES.childSeatNotes,
    "Please tell us each child’s age and whether you need a child seat or booster seat.",
  );
  assert.match(draft, /childSeats\?: number/);
  assert.match(draft, /childSeatNotes\?: string/);
  assert.match(workerIndex, /childSeats: Math\.min\(2/);
  assert.match(persist, /childSeats: Math\.min\(2/);
  assert.match(confirmed, /Child seats: \$\{pending\.booking\.childSeats\}/);
  assert.match(manage, /Child seats/);
  assert.match(manage, /childSeatNotes/);
  console.log("OK  QuoteCard state, draft, validation, payload, and summaries");
}

console.log("\n=== Desktop SumUp opens separately; mobile stays same-tab ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /function openSumUpPayment\(paymentUrl: string\)/);
  assert.match(card, /window\.open\(paymentUrl,\s*"_blank",\s*"noopener,noreferrer"\)/);
  assert.match(card, /if \(isMobile\) \{[\s\S]{0,180}?window\.location\.assign\(checkout\.paymentUrl\)/);
  assert.match(card, /if \(isMobile\) \{[\s\S]{0,80}?window\.location\.assign\(paymentUrl\)/);
  assert.match(card, /setPaymentLoading\(false\);\s*return;/);
  assert.match(card, /Secure payment ready/);
  assert.match(card, /Cancel payment and return to quote/);
  assert.match(
    card,
    /SumUp opens in a separate tab\. Close it at any time to return to your saved quote\./,
  );
  assert.match(card, /isMobileDevice === false/);
  assert.doesNotMatch(card, /window\.location\.assign\(checkout\.paymentUrl\);\s*\/\/ Keep loading/);
  console.log("OK  desktop new-tab handoff with same-tab fallback; mobile same-tab");
}

console.log("\nAll child-seat booking and SumUp checks passed.");
