/**
 * Minimum short-notice lead time (default 2h) and the 1-hour response expiry.
 * Run: npx tsx scripts/check-short-notice-lead-expiry.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_SHORT_NOTICE_LEAD_HOURS,
  classifyPickupLeadWindow,
  clampShortNoticeLeadHours,
  isBelowMinimumShortNoticeLead,
  isWithinMinimumBookingNotice,
  parseMinimumShortNoticeLeadHoursInput,
  tooSoonRequestBody,
  tooSoonRequestHeading,
} from "../shared/booking-notice";
import { formatLondonClockTime, parseLondonLocalDateTime } from "../shared/uk-time";
import {
  RETURN_JOURNEY_DISCOUNT_RATE,
  getWebsiteReturnJourneyFare,
} from "../shared/return-journey-discount";
import { buildShortNoticeExpiryEmail } from "../shared/short-notice-expiry-email";
import {
  SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE,
  SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE,
  SHORT_NOTICE_RESPONSE_WINDOW_MS,
  isShortNoticePayable,
  shortNoticeResponseExpiresAtIso,
} from "../shared/short-notice-booking";
import {
  createShortNoticeRequest,
  expireShortNoticeResponseIfDue,
  handleOwnerApproveShortNotice,
  markShortNoticePaid,
  processExpiredShortNoticeResponseWindows,
  resolveShortNoticeForPayment,
  shouldForceShortNotice,
} from "../workers/addresses/src/short-notice-handlers";
import {
  normalizeBookingSettings,
  updateMinimumBookingNoticeHours,
  updateMinimumShortNoticeLeadHours,
} from "../workers/addresses/src/booking-settings-store";
import { getShortNoticeByReference, saveShortNoticeBooking } from "../workers/addresses/src/short-notice-store";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import type { ShortNoticeBookingRecord } from "../shared/short-notice-booking";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

async function checkAsync(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function pickupOffsetNow(tripDate: string, tripTime: string, hoursBefore: number): Date {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  assert.ok(pickup, `Could not parse ${tripDate} ${tripTime}`);
  return new Date(pickup.getTime() - hoursBefore * 60 * 60 * 1000);
}

function memoryKv(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw);
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  } as unknown as KVNamespace;
}

function sampleBooking(overrides: Partial<PaidBookingDetails> = {}): PaidBookingDetails {
  return {
    customerName: "Jill Example",
    customerEmail: "jill@example.com",
    mobileNumber: "07700900123",
    pickupLabel: "10 Donegall Square North, Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: "2026-06-15",
    tripTime: "14:00",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    ...overrides,
  };
}

function emailEnv(store: KVNamespace) {
  return {
    TRACKING_STORE: store,
    RESEND_API_KEY: "re_test",
    BOOKING_FROM_EMAIL: "bookings@example.com",
    BOOKING_NOTIFICATION_EMAIL: "owner@example.com",
    OWNER_ACCESS_KEY: "owner-test",
  };
}

async function main() {
  const originalFetch = globalThis.fetch;
  let emailSends = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.resend.com")) {
      emailSends += 1;
      return new Response(JSON.stringify({ id: `email_${emailSends}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    check("Default lead time is 2 hours and must stay below the notice period", () => {
      assert.equal(MINIMUM_SHORT_NOTICE_LEAD_HOURS, 2);
      assert.equal(MINIMUM_BOOKING_NOTICE_HOURS, 12);
      assert.equal(parseMinimumShortNoticeLeadHoursInput(2), 2);
      assert.equal(parseMinimumShortNoticeLeadHoursInput("3"), 3);
      assert.equal(parseMinimumShortNoticeLeadHoursInput(0), null);
      assert.equal(parseMinimumShortNoticeLeadHoursInput(2.5), null);
      assert.equal(parseMinimumShortNoticeLeadHoursInput(48), null);
      assert.equal(clampShortNoticeLeadHours(12, 12), 11);
      const settings = normalizeBookingSettings({ unavailablePeriods: [] });
      assert.equal(settings.minimumBookingNoticeHours, 12);
      assert.equal(settings.minimumShortNoticeLeadHours, 2);
    });

    check("Windows: under 2h blocked, exactly 2h short notice, exactly 12h normal", () => {
      const date = "2026-06-15";
      const time = "14:00";
      const tooSoon = pickupOffsetNow(date, time, 1 + 59 / 60);
      const exactlyLead = pickupOffsetNow(date, time, 2);
      const between = pickupOffsetNow(date, time, 6);
      const exactlyNotice = pickupOffsetNow(date, time, 12);
      const beyond = pickupOffsetNow(date, time, 12 + 1 / 60);
      assert.equal(classifyPickupLeadWindow(date, time, tooSoon), "too_soon");
      assert.equal(isBelowMinimumShortNoticeLead(date, time, tooSoon), true);
      assert.equal(classifyPickupLeadWindow(date, time, exactlyLead), "short_notice");
      assert.equal(classifyPickupLeadWindow(date, time, between), "short_notice");
      assert.equal(isWithinMinimumBookingNotice(date, time, exactlyNotice), false);
      assert.equal(classifyPickupLeadWindow(date, time, exactlyNotice), "normal");
      assert.equal(classifyPickupLeadWindow(date, time, beyond), "normal");
      assert.match(tooSoonRequestHeading(), /Need a taxi right now/);
      assert.match(tooSoonRequestBody(2), /at least 2 hours from now/);
      assert.match(tooSoonRequestBody(3), /at least 3 hours from now/);
      assert.doesNotMatch(tooSoonRequestBody(3), /at least 2 hours/);
    });

    check("GMT and BST boundaries use London pickup time, and expiry is one elapsed hour", () => {
      const winter = "2026-01-15";
      const summer = "2026-06-15";
      assert.equal(
        classifyPickupLeadWindow(winter, "14:00", pickupOffsetNow(winter, "14:00", 2)),
        "short_notice",
      );
      assert.equal(
        classifyPickupLeadWindow(winter, "14:00", pickupOffsetNow(winter, "14:00", 1.99)),
        "too_soon",
      );
      assert.equal(
        classifyPickupLeadWindow(summer, "14:00", pickupOffsetNow(summer, "14:00", 12)),
        "normal",
      );
      const aroundClockChange = new Date("2026-03-29T00:30:00.000Z");
      const expires = shortNoticeResponseExpiresAtIso(aroundClockChange);
      assert.equal(
        new Date(expires).getTime() - aroundClockChange.getTime(),
        SHORT_NOTICE_RESPONSE_WINDOW_MS,
      );
      assert.equal(formatLondonClockTime(expires), "02:30");
    });

    check("Configurable notice and lead time move the boundaries", () => {
      const date = "2026-06-15";
      const time = "14:00";
      const atLead = pickupOffsetNow(date, time, 4);
      const justUnderLead = pickupOffsetNow(date, time, 3 + 59 / 60);
      const atNotice = pickupOffsetNow(date, time, 8);
      const justUnderNotice = pickupOffsetNow(date, time, 7 + 59 / 60);
      assert.equal(classifyPickupLeadWindow(date, time, justUnderLead, 8, 4), "too_soon");
      assert.equal(classifyPickupLeadWindow(date, time, atLead, 8, 4), "short_notice");
      assert.equal(classifyPickupLeadWindow(date, time, justUnderNotice, 8, 4), "short_notice");
      assert.equal(classifyPickupLeadWindow(date, time, atNotice, 8, 4), "normal");
    });

    await checkAsync("Lead time cannot be saved at or above the notice period", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      await assert.rejects(() => updateMinimumShortNoticeLeadHours(store, 12));
      await assert.rejects(() => updateMinimumBookingNoticeHours(store, 2));
      const saved = await updateMinimumShortNoticeLeadHours(store, 3);
      assert.equal(saved.minimumShortNoticeLeadHours, 3);
      assert.equal(saved.minimumBookingNoticeHours, 12);
    });

    await checkAsync("Under the lead time is rejected and does not create a request", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      const now = pickupOffsetNow("2026-06-15", "14:00", 1);
      const notice = await shouldForceShortNotice(store, sampleBooking(), now);
      assert.equal(notice.tooSoon, true);
      await assert.rejects(
        () => createShortNoticeRequest({ store, booking: sampleBooking(), amount: 48, now }),
        (error: unknown) =>
          error instanceof Error && error.name === "PickupTooSoonError",
      );
    });

    await checkAsync("Exactly the lead time creates a short-notice request with a 1-hour deadline", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      const now = pickupOffsetNow("2026-06-15", "14:00", 2);
      const created = await createShortNoticeRequest({
        store,
        booking: sampleBooking(),
        amount: 48,
        now,
      });
      assert.equal(created.record.status, "SHORT_NOTICE_AWAITING_APPROVAL");
      assert.equal(created.record.amount, 48);
      assert.equal(created.record.underMinimumNotice, true);
      assert.equal(created.record.shortNoticeRequestedAt, now.toISOString());
      assert.ok(created.record.shortNoticeExpiresAt);
      assert.equal(
        new Date(created.record.shortNoticeExpiresAt!).getTime() - now.getTime(),
        SHORT_NOTICE_RESPONSE_WINDOW_MS,
      );
      assert.equal(isShortNoticePayable(created.record, now), false);
    });

    await checkAsync("A normal advance booking is not forced into short notice", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      const now = pickupOffsetNow("2026-06-15", "14:00", 12);
      const notice = await shouldForceShortNotice(store, sampleBooking(), now);
      assert.equal(notice.shortNotice, false);
      assert.equal(notice.tooSoon, false);
      assert.equal(notice.underMinimumNotice, false);
    });

    await checkAsync("Pending request expires once, emails once, and cannot be accepted or paid", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      const now = pickupOffsetNow("2026-06-15", "14:00", 4);
      const created = await createShortNoticeRequest({
        store,
        booking: sampleBooking(),
        amount: 55,
        now,
      });
      const env = emailEnv(store);
      const due = new Date(new Date(created.record.shortNoticeExpiresAt!).getTime() + 1000);
      emailSends = 0;
      const first = await expireShortNoticeResponseIfDue(env, created.record, due);
      assert.equal(first.blocked, true);
      assert.equal(first.record.status, "SHORT_NOTICE_EXPIRED");
      assert.equal(first.record.expiryReason, "response_window");
      assert.equal(first.emailed, true);
      assert.equal(emailSends, 1);
      assert.ok(first.record.responseExpiryEmailSentAt);
      assert.equal(
        first.record.history?.filter((event) => event.type === "request_expired").length,
        1,
      );

      const second = await processExpiredShortNoticeResponseWindows(env, due);
      assert.equal(second.emailed, 0);
      assert.equal(emailSends, 1);
      const stored = await getShortNoticeByReference(store, created.record.reference);
      assert.equal(stored?.status, "SHORT_NOTICE_EXPIRED");
      assert.equal(
        stored?.history?.filter((event) => event.type === "request_expired").length,
        1,
      );

      const approve = await handleOwnerApproveShortNotice(
        new Request("https://example.com/owner/short-notice/approve", {
          method: "POST",
          headers: { "X-Owner-Key": "owner-test" },
        }),
        env,
        { reference: created.record.reference },
        "https://www.myairporttaxini.co.uk",
      );
      assert.equal("error" in approve, true);
      if ("error" in approve) {
        assert.equal(approve.error, SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE);
      }
      const afterApprove = await getShortNoticeByReference(store, created.record.reference);
      assert.equal(afterApprove?.status, "SHORT_NOTICE_EXPIRED");
      assert.equal(afterApprove?.approvedAt, undefined);

      const paid = await markShortNoticePaid(store, created.record.paymentToken, "pay-ref", "chk");
      assert.equal(paid, null);
      const resolved = await resolveShortNoticeForPayment(
        store,
        created.record.paymentToken,
        due,
        env,
      );
      assert.equal("error" in resolved, true);
      if ("error" in resolved) {
        assert.equal(resolved.error, SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE);
      }
      assert.equal(emailSends, 1);
    });

    await checkAsync("An accepted request does not expire afterwards", async () => {
      const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
      const now = pickupOffsetNow("2026-06-15", "14:00", 5);
      const created = await createShortNoticeRequest({
        store,
        booking: sampleBooking(),
        amount: 60,
        now,
      });
      const approved: ShortNoticeBookingRecord = {
        ...created.record,
        status: "SHORT_NOTICE_APPROVED",
        approvedAt: now.toISOString(),
        approvedAmount: 60,
        paymentExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      };
      await saveShortNoticeBooking(store, approved);
      const later = new Date(new Date(created.record.shortNoticeExpiresAt!).getTime() + 5000);
      const result = await expireShortNoticeResponseIfDue(emailEnv(store), approved, later);
      assert.equal(result.blocked, false);
      assert.equal(result.record.status, "SHORT_NOTICE_APPROVED");
      assert.equal(isShortNoticePayable(result.record, later), true);
    });

    check("Expiry email, consent, and unchanged return discount", () => {
      const email = buildShortNoticeExpiryEmail({
        customerName: "Jill Example",
        customerEmail: "jill@example.com",
      });
      assert.equal(email.subject, "Your My Airport Taxi NI booking request has expired");
      assert.match(email.text, /Hi Jill/);
      assert.match(email.text, /couldn’t confirm your journey in time/);
      assert.match(email.text, /within 1 hour/);
      assert.match(email.text, /No payment has been taken/);
      assert.doesNotMatch(email.text, /declined/i);
      assert.match(email.html, /Booking request expired/);

      const consent = read("src/components/BookingTermsConsent.tsx");
      assert.match(consent, /I agree to the/);
      assert.match(consent, /Terms &amp; Conditions/);
      assert.match(consent, /Cancellation Policy/);
      assert.match(consent, /Privacy Policy/);
      assert.doesNotMatch(consent, /CHECKOUT_CANCELLATION_SUMMARY/);
      const marketing = read("src/components/MarketingOptIn.tsx");
      assert.match(marketing, /Send me occasional offers and travel updates \(optional\)/);
      const card = read("src/components/QuoteCard.tsx");
      assert.match(card, /const \[marketingOptIn, setMarketingOptIn\] = useState\(false\)/);
      assert.match(card, /TooSoonCheckoutNotice/);
      const followUp = read("src/components/ShortNoticeCheckoutNotice.tsx");
      assert.match(followUp, /We’ll confirm availability within 1 hour/);
      assert.match(followUp, /your request will automatically expire/);
      assert.doesNotMatch(followUp, /Please allow up to 1 hour for confirmation/);

      assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
      assert.equal(getWebsiteReturnJourneyFare(40), 76);
    });

    check("Server paths enforce the lead time, expiry cron, and stale payment guard", () => {
      const index = read("workers/addresses/src/index.ts");
      const finalize = read("workers/addresses/src/finalize-paid-checkout.ts");
      const handlers = read("workers/addresses/src/short-notice-handlers.ts");
      assert.match(index, /notice\.tooSoon/);
      assert.match(index, /TOO_SOON_BOOKING_CODE/);
      assert.match(index, /SHORT-NOTICE BOOKING REQUEST/);
      assert.match(index, /Respond by/);
      assert.match(index, /processExpiredShortNoticeResponseWindows/);
      assert.match(finalize, /resolveShortNoticeForPayment/);
      assert.match(handlers, /shortNoticeExpiresAt/);
      assert.match(handlers, /responseExpiryEmailSentAt/);
      assert.match(read("src/app/book-quote/BookQuoteCustomerClient.tsx"), /TooSoonCheckoutNotice/);
      assert.match(read("src/app/quote/SavedQuoteCustomerClient.tsx"), /TooSoonCheckoutNotice/);
      assert.match(read("src/components/OwnerShortNoticePanel.tsx"), /Minimum short-notice lead time/);
      assert.match(read("src/components/OwnerShortNoticePanel.tsx"), /Expired — not confirmed/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
