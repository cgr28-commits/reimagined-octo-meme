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
import {
  CHILD_SEATS_RANGE_MESSAGE,
  getPaymentBookingBlockers as websitePaymentGate,
  parseChildSeatNotesInput,
  parseChildSeatsInput,
  type PaymentBookingGateInput,
} from "../shared/paid-booking-gate";
import { getPaymentBookingBlockers as workerPaymentGate } from "../workers/addresses/shared/paid-booking-gate";
import { QUOTE_REQUIRED_FIELD_MESSAGES } from "../shared/quote-required-field-messages";
import {
  applyCancelPaymentReturnToQuote,
  openDesktopSumUpCheckout,
  type DesktopSumUpPopup,
  type DesktopSumUpWindow,
} from "../src/lib/sumup-desktop-handoff";

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
  assert.match(workerIndex, /childSeats: parseChildSeatsInput\(details\.childSeats\)/);
  assert.doesNotMatch(
    workerIndex,
    /childSeats:\s*Math\.min\(2,\s*Math\.max\(0,\s*Math\.floor\(Number\(details\.childSeats\)\)\)\)/,
  );
  assert.match(persist, /childSeats: Math\.min\(2/);
  assert.match(confirmed, /Child seats: \$\{pending\.booking\.childSeats\}/);
  assert.match(manage, /Child seats/);
  assert.match(manage, /childSeatNotes/);
  assert.match(card, /Include all children in the passenger total\./);
  assert.match(read("src/components/QuoteProgressiveRoute.tsx"), /Include all children in the passenger total\./);
  console.log("OK  QuoteCard state, draft, validation, payload, and summaries");
}

const completeGateBooking: PaymentBookingGateInput = {
  customerName: "Ada Example",
  customerEmail: "ada@example.com",
  mobileNumber: "07700900123",
  tripLabel: "Airport drop-off",
  pickupLabel: "10 Donegall Square North, Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-09-10",
  tripTime: "09:30",
  vehicle: "Estate Car (1–4 passengers)",
  passengers: 2,
  isAirportTrip: true,
  airportCode: "BFS",
  termsAcceptedAt: "2026-09-10T08:00:00.000Z",
};

function assertGatesAgree(input: PaymentBookingGateInput): string[] {
  const website = websitePaymentGate(input);
  const worker = workerPaymentGate(input);
  assert.deepEqual(website, worker);
  return website;
}

console.log("\n=== Paid-booking-gate child-seat API (website + worker copies) ===");
{
  assert.equal(parseChildSeatsInput(undefined), 0);
  assert.equal(parseChildSeatsInput(null), 0);
  assert.equal(parseChildSeatsInput(""), 0);
  assert.equal(parseChildSeatsInput(0), 0);
  assert.equal(parseChildSeatsInput(2), 2);
  assert.equal(parseChildSeatsInput("1"), 1);
  assert.ok(Number.isNaN(parseChildSeatsInput(1.5)));
  assert.ok(Number.isNaN(parseChildSeatsInput("abc")));
  assert.ok(Number.isNaN(parseChildSeatsInput(true)));
  assert.equal(parseChildSeatNotesInput("  ages 3 and 6  "), "ages 3 and 6");
  assert.equal(parseChildSeatNotesInput(undefined), "");

  assert.deepEqual(assertGatesAgree(completeGateBooking), []);
  assert.deepEqual(assertGatesAgree({ ...completeGateBooking, childSeats: 0 }), []);
  assert.deepEqual(
    assertGatesAgree({
      ...completeGateBooking,
      childSeats: 2,
      childSeatNotes: "4-year-old child seat, 7-year-old booster",
    }),
    [],
  );

  const tooMany = assertGatesAgree({
    ...completeGateBooking,
    childSeats: 9,
    childSeatNotes: "should not silently become two seats",
  });
  assert.deepEqual(tooMany, [CHILD_SEATS_RANGE_MESSAGE]);

  const negative = assertGatesAgree({ ...completeGateBooking, childSeats: -1 });
  assert.deepEqual(negative, [CHILD_SEATS_RANGE_MESSAGE]);

  const fractional = assertGatesAgree({
    ...completeGateBooking,
    childSeats: 1.7,
    childSeatNotes: "2-year-old child seat",
  });
  assert.deepEqual(fractional, [CHILD_SEATS_RANGE_MESSAGE]);

  const malformed = assertGatesAgree({
    ...completeGateBooking,
    childSeats: "two",
    childSeatNotes: "2-year-old child seat",
  });
  assert.deepEqual(malformed, [CHILD_SEATS_RANGE_MESSAGE]);

  const missingNotes = assertGatesAgree({ ...completeGateBooking, childSeats: 1 });
  assert.deepEqual(missingNotes, [QUOTE_REQUIRED_FIELD_MESSAGES.childSeatNotes]);

  const blankNotes = assertGatesAgree({
    ...completeGateBooking,
    childSeats: 1,
    childSeatNotes: "   ",
  });
  assert.deepEqual(blankNotes, [QUOTE_REQUIRED_FIELD_MESSAGES.childSeatNotes]);

  const parsedInvalid = {
    ...completeGateBooking,
    childSeats: parseChildSeatsInput(9),
    childSeatNotes: parseChildSeatNotesInput("notes"),
  };
  assert.deepEqual(assertGatesAgree(parsedInvalid), [CHILD_SEATS_RANGE_MESSAGE]);
  console.log("OK  both gate copies reject malformed child seats and require notes when seats > 0");
}

function createDesktopWindow(opts: { allowPopup: boolean }) {
  const navigations: Array<{ target: "popup" | "same-tab"; url: string }> = [];
  let popup: DesktopSumUpPopup | null = null;

  const win: DesktopSumUpWindow = {
    open(url) {
      assert.equal(url, "about:blank");
      if (!opts.allowPopup) {
        return null;
      }
      let href = "about:blank";
      popup = {
        opener: { original: true },
        location: {
          get href() {
            return href;
          },
          set href(next: string) {
            href = next;
            navigations.push({ target: "popup", url: next });
          },
        },
      };
      return popup;
    },
    location: {
      href: "https://www.myairporttaxini.com/quote",
      assign(url) {
        navigations.push({ target: "same-tab", url });
      },
    },
  };

  return { win, navigations, getPopup: () => popup };
}

console.log("\n=== Desktop SumUp handoff behaviour ===");
{
  const sumupUrl = "https://checkout.sumup.com/pay/ok";
  const card = read("src/components/QuoteCard.tsx");

  const opened = createDesktopWindow({ allowPopup: true });
  const openedResult = openDesktopSumUpCheckout(opened.win, sumupUrl);
  assert.equal(openedResult.openedNewTab, true);
  assert.deepEqual(openedResult.navigations, [{ target: "popup", url: sumupUrl }]);
  assert.deepEqual(opened.navigations, [{ target: "popup", url: sumupUrl }]);
  assert.equal(opened.getPopup()?.opener, null);
  assert.equal(opened.getPopup()?.location.href, sumupUrl);
  assert.equal(opened.win.location.href, "https://www.myairporttaxini.com/quote");
  assert.equal(opened.navigations.filter((item) => item.target === "same-tab").length, 0);
  assert.equal(opened.navigations.length, 1);

  const blocked = createDesktopWindow({ allowPopup: false });
  const blockedResult = openDesktopSumUpCheckout(blocked.win, sumupUrl);
  assert.equal(blockedResult.openedNewTab, false);
  assert.deepEqual(blockedResult.navigations, [{ target: "same-tab", url: sumupUrl }]);
  assert.deepEqual(blocked.navigations, [{ target: "same-tab", url: sumupUrl }]);
  assert.equal(blocked.navigations.length, 1);
  assert.equal(blocked.win.location.href, "https://www.myairporttaxini.com/quote");

  const quoteAfterPay = {
    quoteStep: 3,
    openCheckout: { checkoutId: "chk_test", paymentUrl: sumupUrl },
    paying: true,
    childSeats: 2,
    childSeatNotes: "4-year-old child seat, 7-year-old booster",
    pickupLabel: bookingBase.pickupLabel,
    dropoffLabel: bookingBase.dropoffLabel,
    passengers: 2,
  };
  const afterCancel = applyCancelPaymentReturnToQuote(quoteAfterPay);
  assert.equal(afterCancel.quoteStep, 1);
  assert.equal(afterCancel.openCheckout, null);
  assert.equal(afterCancel.paying, false);
  assert.equal(afterCancel.childSeats, 2);
  assert.equal(afterCancel.childSeatNotes, "4-year-old child seat, 7-year-old booster");
  assert.equal(afterCancel.pickupLabel, bookingBase.pickupLabel);
  assert.equal(afterCancel.dropoffLabel, bookingBase.dropoffLabel);
  assert.equal(afterCancel.passengers, 2);

  assert.match(card, /openDesktopSumUpCheckout\(window,\s*paymentUrl\)/);
  assert.match(card, /applyCancelPaymentReturnToQuote/);
  assert.match(card, /clearOpenCheckoutSession\(\)/);
  assert.match(card, /navigateQuoteStep\(next\.quoteStep/);
  assert.match(card, /scrollQuoteStage\(routeSummaryRef\.current \?\? "quote-route-summary"\)/);
  assert.match(card, /if \(isMobile\) \{[\s\S]{0,180}?window\.location\.assign\(checkout\.paymentUrl\)/);
  assert.match(card, /if \(isMobile\) \{[\s\S]{0,80}?window\.location\.assign\(paymentUrl\)/);
  assert.match(card, /Secure payment ready/);
  assert.match(card, /Cancel payment and return to quote/);
  assert.doesNotMatch(card, /window\.open\(paymentUrl/);
  assert.doesNotMatch(card, /noopener,noreferrer/);
  assert.doesNotMatch(card, /cancelled the SumUp|remote SumUp checkout was cancelled/i);
  console.log("OK  popup leaves quote open; blocked popup falls back once; cancel restores editable quote");
}

console.log("\nAll child-seat booking and SumUp checks passed.");
