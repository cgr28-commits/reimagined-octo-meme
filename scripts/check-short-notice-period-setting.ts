/**
 * Owner-dashboard short-notice period setting (settings-driven notice hours).
 * Run: npx tsx scripts/check-short-notice-period-setting.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  isWithinMinimumBookingNotice,
  minimumNoticeRequestBody,
  normalizeMinimumBookingNoticeHours,
  parseMinimumBookingNoticeHoursInput,
} from "../shared/booking-notice";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import { buildShortNoticeRequestReceivedEmail } from "../shared/short-notice-request-received-email";
import {
  decideCustomerSmartAvailabilityGate,
  shouldBypassSmartAvailabilityHardBlockForShortNotice,
} from "../shared/customer-smart-availability";
import { buildQuickBlockRule } from "../shared/smart-availability";
import { DEFAULT_SMART_OPS_CONFIG, normalizeSmartOpsConfig } from "../shared/smart-ops-config";
import {
  createShortNoticeRequest,
  shouldForceShortNotice,
  resolveShortNoticeForPayment,
} from "../workers/addresses/src/short-notice-handlers";
import {
  normalizeBookingSettings,
  updateMinimumBookingNoticeHours,
  addUnavailablePeriod,
} from "../workers/addresses/src/booking-settings-store";
import { isShortNoticePayable } from "../shared/short-notice-booking";
import type { PaidBookingDetails } from "../shared/booking-notifications";

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
    async put(key: string, value: string, _options?: { expirationTtl?: number }) {
      data.set(key, value);
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

async function main() {
  check("Default fallback remains 12 hours", () => {
    assert.equal(MINIMUM_BOOKING_NOTICE_HOURS, 12);
    assert.equal(normalizeMinimumBookingNoticeHours(undefined), 12);
    assert.equal(normalizeMinimumBookingNoticeHours(null), 12);
    assert.equal(normalizeMinimumBookingNoticeHours(""), 12);
    assert.equal(normalizeMinimumBookingNoticeHours(0), 12);
    assert.equal(normalizeMinimumBookingNoticeHours(49), 12);
    assert.equal(normalizeMinimumBookingNoticeHours(6.5), 12);
    const settings = normalizeBookingSettings({ unavailablePeriods: [] });
    assert.equal(settings.minimumBookingNoticeHours, 12);
    assert.match(minimumNoticeRequestBody(), /12-hour advance booking period/);
  });

  check("Owner input validates 1–48 whole hours", () => {
    assert.equal(parseMinimumBookingNoticeHoursInput(6), 6);
    assert.equal(parseMinimumBookingNoticeHoursInput("6"), 6);
    assert.equal(parseMinimumBookingNoticeHoursInput(1), 1);
    assert.equal(parseMinimumBookingNoticeHoursInput(48), 48);
    assert.equal(parseMinimumBookingNoticeHoursInput(0), null);
    assert.equal(parseMinimumBookingNoticeHoursInput(49), null);
    assert.equal(parseMinimumBookingNoticeHoursInput(6.5), null);
    assert.equal(parseMinimumBookingNoticeHoursInput("12 hours"), null);
  });

  await checkAsync("Owner setting changed to 6 hours persists and is used", async () => {
    const store = memoryKv({ "booking:settings": { unavailablePeriods: [] } });
    const saved = await updateMinimumBookingNoticeHours(store, 6);
    assert.equal(saved.minimumBookingNoticeHours, 6);
    const now = pickupOffsetNow("2026-06-15", "14:00", 5 + 59 / 60);
    const notice = await shouldForceShortNotice(store, sampleBooking(), now);
    assert.equal(notice.minimumNoticeHours, 6);
    assert.equal(notice.underMinimumNotice, true);
    assert.equal(notice.shortNotice, true);
  });

  check("5h59 = short-notice request; exactly 6h00 = normal booking/payment", () => {
    const date = "2026-06-15";
    const time = "14:00";
    const now559 = pickupOffsetNow(date, time, 5 + 59 / 60);
    const now600 = pickupOffsetNow(date, time, 6);
    const now601 = pickupOffsetNow(date, time, 6 + 1 / 60);
    assert.equal(isWithinMinimumBookingNotice(date, time, now559, 6), true);
    assert.equal(isWithinMinimumBookingNotice(date, time, now600, 6), false);
    assert.equal(isWithinMinimumBookingNotice(date, time, now601, 6), false);
  });

  await checkAsync("5h59 with setting=6 creates a short-notice request; 6h00 does not", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 6 },
    });
    const now559 = pickupOffsetNow("2026-06-15", "14:00", 5 + 59 / 60);
    const forced = await shouldForceShortNotice(store, sampleBooking(), now559);
    assert.equal(forced.shortNotice, true);
    assert.equal(forced.underMinimumNotice, true);
    const created = await createShortNoticeRequest({
      store,
      booking: sampleBooking(),
      amount: 48,
      now: now559,
    });
    assert.equal(created.record.underMinimumNotice, true);
    assert.equal(created.record.minimumNoticeHoursApplied, 6);
    assert.equal(created.record.amount, 48);
    assert.equal(isShortNoticePayable(created.record, now559), false);

    const now600 = pickupOffsetNow("2026-06-15", "14:00", 6);
    const normal = await shouldForceShortNotice(store, sampleBooking(), now600);
    assert.equal(normal.shortNotice, false);
    assert.equal(normal.underMinimumNotice, false);
  });

  check("Customer wording displays 6 hours", () => {
    assert.match(minimumNoticeRequestBody(6), /6-hour advance booking period/);
    assert.doesNotMatch(minimumNoticeRequestBody(6), /12-hour advance booking period/);
    const email = buildShortNoticeRequestReceivedEmail({
      customerName: "Jill Example",
      customerEmail: "jill@example.com",
      pickupLabel: "Belfast",
      dropoffLabel: "BFS",
      tripDate: "2026-06-15",
      tripTime: "14:00",
      amountLabel: "£48.00",
      reference: "MATNI-SN-6",
      noticeHours: 6,
    });
    assert.match(email.text, /6-hour advance booking period/);
    assert.doesNotMatch(email.text, /12-hour advance booking period/);
  });

  check("Smart Availability precedence uses the configured value", () => {
    const now = new Date("2026-09-06T12:00:00+01:00");
    const restOfDay = buildQuickBlockRule("rest_of_today", 1, now);
    assert.ok(restOfDay);
    const booking559 = {
      pickupLabel: "Belfast International Airport (BFS)",
      dropoffLabel: "Belfast City Hall",
      tripDate: "2026-09-06",
      tripTime: "17:59",
    };
    const booking600 = {
      ...booking559,
      tripTime: "18:00",
    };
    assert.equal(
      shouldBypassSmartAvailabilityHardBlockForShortNotice(booking559, now, 6),
      true,
    );
    assert.equal(
      shouldBypassSmartAvailabilityHardBlockForShortNotice(booking600, now, 6),
      false,
    );
    const gate559 = decideCustomerSmartAvailabilityGate({
      enforce: true,
      booking: booking559,
      occupied: [],
      rules: restOfDay ? [restOfDay] : [],
      config: normalizeSmartOpsConfig(DEFAULT_SMART_OPS_CONFIG),
      offerAlternatives: true,
      now,
      noticeHours: 6,
    });
    const gate600 = decideCustomerSmartAvailabilityGate({
      enforce: true,
      booking: booking600,
      occupied: [],
      rules: restOfDay ? [restOfDay] : [],
      config: normalizeSmartOpsConfig(DEFAULT_SMART_OPS_CONFIG),
      offerAlternatives: true,
      now,
      noticeHours: 6,
    });
    assert.equal(gate559.blocked, false);
    assert.equal(gate559.reason, "under_minimum_notice_owner_review");
    assert.equal(gate600.blocked, true);
  });

  await checkAsync("/payments cannot bypass approval inside the configured threshold", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 6 },
    });
    const now = pickupOffsetNow("2026-06-15", "14:00", 5 + 59 / 60);
    const created = await createShortNoticeRequest({
      store,
      booking: sampleBooking(),
      amount: 48,
      now,
    });
    const resolved = await resolveShortNoticeForPayment(store, created.record.paymentToken, now);
    assert.equal("error" in resolved, true);
    if ("error" in resolved) {
      assert.match(resolved.error, /awaiting Owner approval/i);
      assert.equal(resolved.status, 409);
    }
    const payments = read("workers/addresses/src/index.ts");
    assert.match(payments, /shouldForceShortNotice/);
    assert.match(payments, /createShortNoticeRequest/);
    assert.match(payments, /minimumBookingNoticeHours/);
    assert.match(
      payments,
      /isWithinMinimumBookingNotice\([\s\S]*settings\.minimumBookingNoticeHours/,
    );
  });

  await checkAsync("Changing the setting does not alter pricing", async () => {
    const store12 = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 12 },
    });
    const store6 = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 6 },
    });
    const now = pickupOffsetNow("2026-06-15", "14:00", 3);
    const created12 = await createShortNoticeRequest({
      store: store12,
      booking: sampleBooking(),
      amount: 48,
      now,
    });
    const created6 = await createShortNoticeRequest({
      store: store6,
      booking: sampleBooking(),
      amount: 48,
      now,
    });
    assert.equal(created12.record.amount, 48);
    assert.equal(created6.record.amount, 48);
    assert.equal(created12.record.amountLabel, created6.record.amountLabel);
    assert.equal(created12.record.amount, created6.record.amount);
    for (const file of [
      "shared/universal-distance-pricing.ts",
      "src/lib/quote.ts",
      "shared/express-drop-off.ts",
      "shared/website-fare-breakdown.ts",
    ]) {
      assert.doesNotMatch(read(file), /minimumBookingNoticeHours/);
    }
  });

  await checkAsync("Period writes preserve a saved 6-hour setting", async () => {
    const store = memoryKv({
      "booking:settings": { unavailablePeriods: [], minimumBookingNoticeHours: 6 },
    });
    const { settings } = await addUnavailablePeriod(store, {
      startLocal: "2026-06-20T00:30",
      endLocal: "2026-06-20T08:00",
      note: "Sleep",
    });
    assert.equal(settings.minimumBookingNoticeHours, 6);
    assert.equal(settings.unavailablePeriods.length, 1);
  });

  check("Owner dashboard and customer UI use the configured hours", () => {
    const panel = read("src/components/OwnerShortNoticePanel.tsx");
    const card = read("src/components/QuoteCard.tsx");
    const saved = read("src/app/quote/SavedQuoteCustomerClient.tsx");
    const bookQuote = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
    const received = read("src/components/ShortNoticeRequestReceived.tsx");
    const api = read("src/lib/short-notice-api.ts");
    const store = read("workers/addresses/src/booking-settings-store.ts");
    const handlers = read("workers/addresses/src/short-notice-handlers.ts");
    const gate = read("shared/customer-smart-availability.ts");
    const ops = read("workers/addresses/src/smart-ops-handlers.ts");

    assert.match(panel, /Short-notice period/);
    assert.match(panel, /Bookings inside this period require owner approval before payment\./);
    assert.match(panel, /Save short-notice period/);
    assert.match(panel, /updateMinimumBookingNoticeHours/);
    assert.match(api, /action: "set-notice-hours"/);
    assert.match(store, /minimumBookingNoticeHours/);
    assert.match(handlers, /set-notice-hours/);
    assert.match(handlers, /handlePublicGetBookingNotice/);
    assert.match(card, /minimumNoticeRequestBody\(minimumBookingNoticeHours\)/);
    assert.match(saved, /minimumNoticeRequestBody\(minimumBookingNoticeHours\)/);
    assert.match(bookQuote, /minimumNoticeRequestBody\(minimumBookingNoticeHours\)/);
    assert.match(received, /minimumNoticeRequestBody\(noticeHours\)/);
    assert.match(gate, /noticeHours/);
    assert.match(ops, /noticeHours: settings\.minimumBookingNoticeHours/);
    assert.doesNotMatch(panel, /Minimum online booking notice/);
  });
}

void main();
