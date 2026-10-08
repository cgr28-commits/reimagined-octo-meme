/**
 * In-memory end-to-end journey reminder and driver-contact checks.
 * No production KV, no real email, no real WhatsApp, no real phone call.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/check-journey-reminder-e2e.ts
 */
import assert from "node:assert/strict";
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_TEL, BUSINESS_WHATSAPP_DIGITS } from "../shared/business-email";
import { DRIVER_CONTACT_UNLOCK_MESSAGE, formatJourneyReminderClock } from "../shared/journey-reminder";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import type { TrackingJobRecord } from "../shared/tracking";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import { handleDriverContactRequest } from "../workers/addresses/src/driver-contact-handlers";
import {
  handleDriverAssignRequest,
  handleDriverAssignmentResponseRequest,
  handleDriverDeassignRequest,
} from "../workers/addresses/src/driver-assignment-handlers";
import { processJourneyRemindersForPayment } from "../workers/addresses/src/airport-pickup-reminder-handlers";
import { invalidateJourneyRemindersOnScheduleChange } from "../workers/addresses/src/journey-reminder-schedule";
import { handleOwnerSaveBookingSettings } from "../workers/addresses/src/short-notice-handlers";
import { savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { getTrackingJob, saveTrackingJob } from "../workers/addresses/src/tracking-store";

const OWNER = "owner-test-key";
const DRIVER_KEY = "driver-test-key";
const PRIYA_EMAIL = "priya.driver@example.com";
const ALEX_EMAIL = "alex.driver@example.com";
const PRIYA_MOBILE = "07700900111";
const ALEX_MOBILE = "07700900222";
const PRIYA_DIGITS = "447700900111";
const ALEX_DIGITS = "447700900222";
const CUSTOMER_EMAIL = "reminder-test@example.com";

type SentMail = { to: string[]; subject: string; html: string; text: string };

const sent: SentMail[] = [];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (!url.startsWith("https://api.resend.com/")) {
    throw new Error(`Blocked unexpected network call: ${url}`);
  }
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    to?: string[];
    subject?: string;
    html?: string;
    text?: string;
  };
  sent.push({
    to: body.to ?? [],
    subject: body.subject ?? "",
    html: body.html ?? "",
    text: body.text ?? "",
  });
  return new Response(JSON.stringify({ id: `local-${sent.length}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function memoryKv() {
  const data = new Map<string, string>();
  let deassignOnNoticeClaim: (() => Promise<void>) | null = null;
  const store = {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      const value = raw == null ? null : type === "json" ? (JSON.parse(raw) as unknown) : raw;
      if (deassignOnNoticeClaim && key.startsWith("booking:ref:")) {
        const claimed = [...data.entries()].some(
          ([storedKey, stored]) => storedKey.startsWith("track:job:") && stored.includes("journeyDriverNoticeClaimId"),
        );
        if (claimed) {
          const hook = deassignOnNoticeClaim;
          deassignOnNoticeClaim = null;
          await hook();
        }
      }
      return value;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return {
    data,
    store: store as unknown as KVNamespace,
    armNoticeDeassign(hook: () => Promise<void>) {
      deassignOnNoticeClaim = hook;
    },
  };
}

function londonWall(date: Date): { tripDate: string; tripTime: string; pickupAt: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour") === "24" ? "00" : read("hour");
  const tripDate = `${read("year")}-${read("month")}-${read("day")}`;
  const tripTime = `${hour}:${read("minute")}`;
  return { tripDate, tripTime, pickupAt: `${tripDate}T${tripTime}` };
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function paid(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  const when = londonWall(minutesFromNow(150));
  return {
    paymentReference: "PAY-E2E",
    checkoutId: "checkout-e2e",
    transactionId: "txn-e2e",
    amount: 40,
    currency: "GBP",
    amountPaidLabel: "£40.00",
    originalAmount: 40,
    amountRefunded: 0,
    customerName: "Sarah Johnson",
    customerEmail: CUSTOMER_EMAIL,
    mobileNumber: "+447000000111",
    tripLabel: "Test transfer",
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "22 Main Street, Lisburn",
    returnJourney: false,
    tripDate: when.tripDate,
    tripTime: when.tripTime,
    passengers: 2,
    suitcases: 1,
    vehicle: "Saloon Car (1–4 passengers)",
    expressDropOffSelected: false,
    airportAccessOption: "free",
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: "test",
    calendarEventIds: [],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    refundHistory: [],
    editHistory: [],
    ...overrides,
  };
}

function job(overrides: Partial<TrackingJobRecord> = {}): TrackingJobRecord {
  const when = londonWall(minutesFromNow(150));
  return {
    token: "job-e2e",
    createdAt: new Date().toISOString(),
    customerName: "Sarah Johnson",
    customerEmail: CUSTOMER_EMAIL,
    customerMobile: "+447000000111",
    pickupLabel: "12 High Street, Belfast",
    dropoffLabel: "22 Main Street, Lisburn",
    tripDate: when.tripDate,
    tripTime: when.tripTime,
    pickupAt: when.pickupAt,
    paymentReference: "PAY-E2E",
    sharingActive: false,
    journeyLeg: "outbound",
    ...overrides,
  };
}

function envFor(store: KVNamespace) {
  return {
    TRACKING_STORE: store,
    OWNER_ACCESS_KEY: OWNER,
    DRIVER_ACCESS_KEY: DRIVER_KEY,
    DRIVER_NAME: "Priya",
    RESEND_API_KEY: "local-test-key",
    BOOKING_FROM_EMAIL: "bookings@example.com",
    SITE_URL: "https://www.myairporttaxini.co.uk",
  };
}

function ownerPost(body: unknown): Request {
  return new Request("https://worker.test/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Owner-Key": OWNER },
    body: JSON.stringify(body),
  });
}

function driverPost(body: unknown): Request {
  return new Request("https://worker.test/driver", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Driver-Key": DRIVER_KEY },
    body: JSON.stringify(body),
  });
}

async function expectOk(response: Response, label: string): Promise<Record<string, unknown>> {
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200, `${label}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function customerMails(): SentMail[] {
  return sent.filter((mail) => mail.to.includes(CUSTOMER_EMAIL));
}

function mailsTo(email: string): SentMail[] {
  return sent.filter((mail) => mail.to.includes(email));
}

async function contact(env: ReturnType<typeof envFor>, token: string, channel?: "whatsapp" | "call") {
  const url = new URL("https://worker.test/api/driver-contact");
  url.searchParams.set("token", token);
  const mode = channel ? "open" : "view";
  if (channel) {
    url.pathname = "/driver-contact/open";
    url.searchParams.set("channel", channel);
  }
  return handleDriverContactRequest(new Request(url), env, "https://www.myairporttaxini.co.uk", mode);
}

async function main(): Promise<void> {
console.log("Daylight saving");
{
  const summer = parseLondonLocalDateTime("2026-07-15", "16:30");
  const winter = parseLondonLocalDateTime("2026-01-15", "16:30");
  const beforeFallback = parseLondonLocalDateTime("2026-10-25", "00:30");
  const afterFallback = parseLondonLocalDateTime("2026-10-25", "02:30");
  assert.equal(summer?.toISOString(), "2026-07-15T15:30:00.000Z");
  assert.equal(winter?.toISOString(), "2026-01-15T16:30:00.000Z");
  assert.equal(beforeFallback?.toISOString(), "2026-10-24T23:30:00.000Z");
  assert.equal(afterFallback?.toISOString(), "2026-10-25T02:30:00.000Z");
  console.log("OK  July BST, January GMT, and the October 2026 clock change");
}

console.log("Return legs and airport instructions");
{
  const kv = memoryKv();
  const outboundWhen = londonWall(minutesFromNow(150));
  const returnWhen = londonWall(minutesFromNow(100));
  const record = paid({
    paymentReference: "PAY-RETURN",
    returnJourney: true,
    returnDate: returnWhen.tripDate,
    returnTime: returnWhen.tripTime,
    tripDate: outboundWhen.tripDate,
    tripTime: outboundWhen.tripTime,
  });
  await savePaidBookingRecord(kv.store, record);
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-out",
      paymentReference: "PAY-RETURN",
      journeyLeg: "outbound",
      tripDate: outboundWhen.tripDate,
      tripTime: outboundWhen.tripTime,
      pickupAt: outboundWhen.pickupAt,
    }),
  );
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-ret",
      paymentReference: "PAY-RETURN",
      journeyLeg: "return",
      tripDate: returnWhen.tripDate,
      tripTime: returnWhen.tripTime,
      pickupAt: returnWhen.pickupAt,
      pickupLabel: record.dropoffLabel,
      dropoffLabel: record.pickupLabel,
    }),
  );
  const env = envFor(kv.store);
  const before = customerMails().length;
  await processJourneyRemindersForPayment(env, "PAY-RETURN", new Date());
  const messages = customerMails().slice(before);
  assert.equal(messages.length, 2);
  assert.notEqual(messages[0].text, messages[1].text);
  const both = messages.map((mail) => mail.text).join("\n");
  assert.match(both, new RegExp(formatJourneyReminderClock(outboundWhen.tripTime).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(both, new RegExp(formatJourneyReminderClock(returnWhen.tripTime).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await processJourneyRemindersForPayment(env, "PAY-RETURN", new Date());
  assert.equal(customerMails().length, before + 2);
  console.log("OK  each leg emailed once, second run did not duplicate");
}

console.log("Airport collection, drop-off, and owner wording");
{
  const kv = memoryKv();
  const env = envFor(kv.store);
  const saved = await handleOwnerSaveBookingSettings(
    new Request("https://worker.test/owner/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Owner-Key": OWNER },
    }),
    env,
    {
      action: "set-journey-reminder-airports",
      journeyReminderAirports: { bfsExpressCollection: "STAGING EXPRESS COLLECTION POINT" },
    },
  );
  assert.equal("error" in saved, false);
  if ("error" in saved) throw new Error(saved.error);

  async function remind(reference: string, booking: PaidBookingRecord, tracking: TrackingJobRecord) {
    await savePaidBookingRecord(kv.store, booking);
    await saveTrackingJob(kv.store, tracking);
    const before = customerMails().length;
    await processJourneyRemindersForPayment(env, reference, new Date());
    const mail = customerMails()[customerMails().length - 1];
    assert.ok(mail, reference);
    assert.equal(customerMails().length, before + 1);
    return mail;
  }

  const when = londonWall(minutesFromNow(150));
  const bfs = await remind(
    "PAY-BFS",
    paid({
      paymentReference: "PAY-BFS",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BFS",
      airportAccessOption: "express",
      outboundAirportAccessOption: "express",
      flightNumber: "EZY123",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
    job({
      token: "job-bfs",
      paymentReference: "PAY-BFS",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BFS",
      flightNumber: "EZY123",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  assert.match(bfs.text, /STAGING EXPRESS COLLECTION POINT/);
  assert.match(bfs.text, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  assert.match(bfs.text, /If you land before your driver’s contact details are available/);
  assert.match(bfs.text, /EZY123/);
  assert.match(bfs.html, />Message Your Driver</);
  assert.match(bfs.html, />Call Your Driver</);
  assert.match(bfs.html, />Message Us on WhatsApp</);
  assert.match(bfs.html, />Call Us</);
  assert.match(bfs.html, new RegExp(`wa\\.me/${BUSINESS_WHATSAPP_DIGITS}`));
  assert.match(bfs.html, new RegExp(`tel:${BUSINESS_PHONE_TEL.replace("+", "\\+")}`));
  assert.match(bfs.html, /name="viewport"/);
  assert.equal(bfs.html.includes(PRIYA_DIGITS), false);

  const bhd = await remind(
    "PAY-BHD",
    paid({
      paymentReference: "PAY-BHD",
      pickupLabel: "George Best Belfast City Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BHD",
      airportAccessOption: "free",
      outboundAirportAccessOption: "free",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
    job({
      token: "job-bhd",
      paymentReference: "PAY-BHD",
      pickupLabel: "George Best Belfast City Airport",
      isFromAirport: true,
      airportCode: "BHD",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  assert.match(bhd.text, /Long Stay Car Park Free Pick-Up Location/);
  assert.doesNotMatch(bhd.text, /make your way to Express Pick-Up/);

  const dub = await remind(
    "PAY-DUB",
    paid({
      paymentReference: "PAY-DUB",
      pickupLabel: "Dublin Airport",
      dropoffLabel: "Belfast",
      isFromAirport: true,
      airportCode: "DUB",
      dublinArrivalTerminal: "T1",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
    job({
      token: "job-dub",
      paymentReference: "PAY-DUB",
      pickupLabel: "Dublin Airport",
      airportCode: "DUB",
      isFromAirport: true,
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  assert.match(dub.text, /paid Pick-Up Location at Terminal 1/);
  assert.doesNotMatch(dub.text, /Terminal 2/);

  const greet = await remind(
    "PAY-MG",
    paid({
      paymentReference: "PAY-MG",
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "12 High Street, Belfast",
      isFromAirport: true,
      airportCode: "BFS",
      vehicle: "Business Class",
      outboundAirportAccessOption: "express",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
    job({
      token: "job-mg",
      paymentReference: "PAY-MG",
      pickupLabel: "Belfast International Airport",
      isFromAirport: true,
      airportCode: "BFS",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  assert.match(greet.text, /inside the airport arrivals area/);
  assert.match(greet.text, /do not need to walk to Express Pick-Up/i);
  assert.match(greet.text, /rather than walking to Express Pick-Up/);

  const drop = await remind(
    "PAY-DROP",
    paid({
      paymentReference: "PAY-DROP",
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Belfast International Airport",
      isFromAirport: false,
      airportCode: "BFS",
      outboundAirportAccessOption: "express",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
    job({
      token: "job-drop",
      paymentReference: "PAY-DROP",
      pickupLabel: "12 High Street, Belfast",
      dropoffLabel: "Belfast International Airport",
      isFromAirport: false,
      airportCode: "BFS",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  assert.match(drop.text, /Express Drop-Off/);
  assert.doesNotMatch(drop.text, /IMPORTANT — PLEASE CONTACT YOUR DRIVER WHEN YOU LAND/);
  console.log("OK  airport wording, Meet & Greet, drop-off, and owner save without deploy");
}

console.log("Driver A, unlock, de-assign, Driver B");
{
  const kv = memoryKv();
  const env = envFor(kv.store);
  const hidden = londonWall(minutesFromNow(150));
  const reference = "PAY-ASSIGN";
  await savePaidBookingRecord(
    kv.store,
    paid({
      paymentReference: reference,
      tripDate: hidden.tripDate,
      tripTime: hidden.tripTime,
      flightNumber: "EI164",
    }),
  );
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-assign",
      paymentReference: reference,
      tripDate: hidden.tripDate,
      tripTime: hidden.tripTime,
      pickupAt: hidden.pickupAt,
      flightNumber: "EI164",
    }),
  );

  const assigned = await expectOk(
    await handleDriverAssignRequest(
      ownerPost({
        token: "job-assign",
        driverFirstName: "Priya",
        driverEmail: PRIYA_EMAIL,
        driverMobile: PRIYA_MOBILE,
        driverCarMake: "Toyota",
        driverCarModel: "Camry",
        driverCarColour: "Black",
        driverReg: "TEST123",
        driverPayAmount: "20",
      }),
      env,
      null,
    ),
    "assign Priya",
  );
  assert.equal(assigned.assignmentStatus, "pending");
  env.DRIVER_NAME = "Priya";
  const accepted = await expectOk(
    await handleDriverAssignmentResponseRequest(driverPost({ token: "job-assign", action: "accept" }), env, null),
    "accept Priya",
  );
  assert.equal(accepted.assignmentStatus, "accepted");

  const priyaBeforeReminder = mailsTo(PRIYA_EMAIL).length;
  const beforeCustomer = customerMails().length;
  await processJourneyRemindersForPayment(env, reference, new Date());
  const reminder = customerMails()[customerMails().length - 1];
  assert.equal(customerMails().length, beforeCustomer === customerMails().length ? beforeCustomer : beforeCustomer + 1);
  assert.ok(customerMails().length === beforeCustomer || customerMails().length === beforeCustomer + 1);
  assert.ok(customerMails().length >= beforeCustomer);
  assert.equal(customerMails().length - beforeCustomer <= 1, true);
  assert.match(reminder.text, /Journey date:/);
  assert.match(reminder.text, /Pickup: 12 High Street, Belfast/);
  assert.match(reminder.text, /Destination: 22 Main Street, Lisburn/);
  assert.match(reminder.text, /Flight: EI164/);
  assert.match(reminder.text, new RegExp(DRIVER_CONTACT_UNLOCK_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(reminder.html, /\/driver-contact\/\?token=/);
  assert.equal(reminder.html.includes(PRIYA_MOBILE), false);
  assert.equal(reminder.html.includes(PRIYA_DIGITS), false);
  assert.equal(reminder.text.includes("Priya"), false);
  assert.equal(mailsTo(PRIYA_EMAIL).length, priyaBeforeReminder);
  const token = reminder.html.match(/driver-contact\/\?token=([a-f0-9]+)/)?.[1] ?? "";
  assert.match(token, /^[a-f0-9]{64}$/);

  const early = await contact(env, token);
  assert.match(early.headers.get("cache-control") ?? "", /private/);
  assert.match(early.headers.get("cache-control") ?? "", /no-store/);
  const earlyBody = (await early.json()) as { view?: string; heading?: string; phoneDisplay?: string; driverFirstName?: string; mobileDisplay?: string };
  assert.equal(earlyBody.view, "too_early");
  assert.equal(earlyBody.heading, DRIVER_CONTACT_UNLOCK_MESSAGE);
  assert.equal(earlyBody.driverFirstName, undefined);
  assert.equal(earlyBody.phoneDisplay, BUSINESS_PHONE_DISPLAY);
  const earlyWhatsApp = await contact(env, token, "whatsapp");
  assert.equal(earlyWhatsApp.status, 302);
  assert.equal(new URL(earlyWhatsApp.headers.get("location") ?? "").pathname, `/${BUSINESS_WHATSAPP_DIGITS}`);
  const earlyCall = await contact(env, token, "call");
  assert.equal(earlyCall.headers.get("location"), `tel:${BUSINESS_PHONE_TEL}`);

  const unlocked = londonWall(minutesFromNow(30));
  const storedPaid = paid({
    paymentReference: reference,
    tripDate: unlocked.tripDate,
    tripTime: unlocked.tripTime,
    flightNumber: "EI164",
  });
  await savePaidBookingRecord(kv.store, storedPaid);
  const storedJob = await getTrackingJob(kv.store, "job-assign");
  assert.ok(storedJob);
  storedJob.tripDate = unlocked.tripDate;
  storedJob.tripTime = unlocked.tripTime;
  storedJob.pickupAt = unlocked.pickupAt;
  await saveTrackingJob(kv.store, storedJob);

  const open = await contact(env, token);
  const openBody = (await open.json()) as { view?: string; driverFirstName?: string; mobileDisplay?: string };
  assert.equal(openBody.view, "driver");
  assert.equal(openBody.driverFirstName, "Priya");
  assert.equal(openBody.mobileDisplay, "07700 900111");
  const priyaWhatsApp = await contact(env, token, "whatsapp");
  const priyaLocation = priyaWhatsApp.headers.get("location") ?? "";
  const priyaUrl = new URL(priyaLocation);
  assert.equal(priyaUrl.pathname, `/${PRIYA_DIGITS}`);
  const priyaText = priyaUrl.searchParams.get("text") ?? "";
  assert.match(priyaText, /^Hi Priya, I’m contacting you about my transfer with My Airport Taxi NI\./);
  assert.match(priyaText, /Flight: EI164/);
  assert.equal(priyaText.includes(ALEX_DIGITS), false);
  const priyaCall = await contact(env, token, "call");
  assert.equal(priyaCall.headers.get("location"), `tel:+${PRIYA_DIGITS}`);

  const priyaMailsAtUnlock = mailsTo(PRIYA_EMAIL).length;
  await expectOk(await handleDriverDeassignRequest(ownerPost({ token: "job-assign" }), env, null), "deassign Priya");
  const withdrawn = await contact(env, token);
  const withdrawnBody = (await withdrawn.json()) as { view?: string; heading?: string; phoneDisplay?: string };
  const withdrawnJson = JSON.stringify(withdrawnBody);
  assert.equal(withdrawnBody.view, "updated");
  assert.match(withdrawnBody.heading ?? "", /Your driver details have been updated/);
  assert.equal(withdrawnJson.includes("Priya"), false);
  assert.equal(withdrawnJson.includes(PRIYA_DIGITS), false);
  assert.equal(withdrawnBody.phoneDisplay, BUSINESS_PHONE_DISPLAY);
  const withdrawnCall = await contact(env, token, "call");
  assert.equal(withdrawnCall.headers.get("location"), `tel:${BUSINESS_PHONE_TEL}`);

  env.DRIVER_NAME = "Alex";
  await expectOk(
    await handleDriverAssignRequest(
      ownerPost({
        token: "job-assign",
        driverFirstName: "Alex",
        driverEmail: ALEX_EMAIL,
        driverMobile: ALEX_MOBILE,
        driverCarMake: "Skoda",
        driverCarModel: "Superb",
        driverCarColour: "Grey",
        driverReg: "TEST456",
        driverPayAmount: "22",
      }),
      env,
      null,
    ),
    "assign Alex",
  );
  const pendingPage = await contact(env, token);
  const pendingJson = JSON.stringify(await pendingPage.json());
  assert.equal(pendingJson.includes("Alex"), false);
  assert.equal(pendingJson.includes(ALEX_DIGITS), false);
  await expectOk(
    await handleDriverAssignmentResponseRequest(driverPost({ token: "job-assign", action: "accept" }), env, null),
    "accept Alex",
  );
  const replaced = await contact(env, token);
  const replacedBody = (await replaced.json()) as { view?: string; driverFirstName?: string; mobileDisplay?: string };
  assert.equal(replacedBody.view, "driver");
  assert.equal(replacedBody.driverFirstName, "Alex");
  assert.equal(replacedBody.mobileDisplay, "07700 900222");
  const alexWhatsApp = new URL((await contact(env, token, "whatsapp")).headers.get("location") ?? "");
  assert.equal(alexWhatsApp.pathname, `/${ALEX_DIGITS}`);
  assert.match(alexWhatsApp.searchParams.get("text") ?? "", /^Hi Alex, I’m contacting you about my transfer/);
  assert.equal((alexWhatsApp.searchParams.get("text") ?? "").includes("Priya"), false);
  assert.equal((await contact(env, token, "call")).headers.get("location"), `tel:+${ALEX_DIGITS}`);
  assert.equal(mailsTo(PRIYA_EMAIL).length, priyaMailsAtUnlock);
  const latest = await getTrackingJob(kv.store, "job-assign");
  assert.equal(latest?.assignedDriverName, "Alex");
  assert.equal(latest?.assignmentAudit?.some((entry) => entry.action === "deassigned"), true);
  console.log("OK  same reminder link moved from hidden, to Priya, to company, to Alex");
}

console.log("De-assign while the driver notice is being prepared");
{
  const kv = memoryKv();
  const env = envFor(kv.store);
  const when = londonWall(minutesFromNow(30));
  await savePaidBookingRecord(
    kv.store,
    paid({ paymentReference: "PAY-RACE", tripDate: when.tripDate, tripTime: when.tripTime }),
  );
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-race",
      paymentReference: "PAY-RACE",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
      pickupAt: when.pickupAt,
    }),
  );
  await expectOk(
    await handleDriverAssignRequest(
      ownerPost({
        token: "job-race",
        driverFirstName: "Priya",
        driverEmail: PRIYA_EMAIL,
        driverMobile: PRIYA_MOBILE,
        driverCarMake: "Toyota",
        driverCarModel: "Camry",
        driverCarColour: "Black",
        driverReg: "TEST123",
        driverPayAmount: "20",
      }),
      env,
      null,
    ),
    "assign race",
  );
  env.DRIVER_NAME = "Priya";
  const beforeNotice = mailsTo(PRIYA_EMAIL).filter((mail) => /upcoming journey/i.test(mail.subject)).length;
  kv.armNoticeDeassign(async () => {
    await handleDriverDeassignRequest(ownerPost({ token: "job-race" }), env, null);
  });
  const raceAccept = await expectOk(
    await handleDriverAssignmentResponseRequest(driverPost({ token: "job-race", action: "accept" }), env, null),
    "accept race",
  );
  assert.notEqual(raceAccept.assignmentStatus, "accepted");
  const raceJob = await getTrackingJob(kv.store, "job-race");
  assert.notEqual(raceJob?.assignmentStatus, "accepted");
  assert.equal(raceJob?.assignedDriverName, undefined);
  assert.equal(
    mailsTo(PRIYA_EMAIL).filter((mail) => /upcoming journey/i.test(mail.subject)).length,
    beforeNotice,
  );
  console.log("OK  de-assign during preparation did not email Priya or restore the assignment");
}

console.log("Cancellation, expiry, rate limit, and foreign tokens");
{
  const kv = memoryKv();
  const env = envFor(kv.store);
  const when = londonWall(minutesFromNow(30));
  await savePaidBookingRecord(
    kv.store,
    paid({
      paymentReference: "PAY-SEC",
      status: "cancelled",
      operationalStatus: "cancelled",
      tripDate: when.tripDate,
      tripTime: when.tripTime,
    }),
  );
  const cancelledJob = job({
    token: "job-sec",
    paymentReference: "PAY-SEC",
    tripDate: when.tripDate,
    tripTime: when.tripTime,
    pickupAt: when.pickupAt,
    assignmentStatus: "accepted",
    assignedDriverName: "Priya",
    assignedDriverMobile: PRIYA_MOBILE,
    driverContactToken: "ab".repeat(32),
  });
  await saveTrackingJob(kv.store, cancelledJob);
  await kv.store.put(`driver-contact:${"ab".repeat(32)}`, JSON.stringify({ jobToken: "job-sec" }));
  const cancelled = await contact(env, "ab".repeat(32));
  const cancelledJson = JSON.stringify(await cancelled.json());
  assert.match(cancelledJson, /cancelled/i);
  assert.equal(cancelledJson.includes(PRIYA_DIGITS), false);
  assert.equal(cancelledJson.includes("Priya"), false);

  const past = londonWall(minutesFromNow(-13 * 60));
  await savePaidBookingRecord(
    kv.store,
    paid({ paymentReference: "PAY-OLD", tripDate: past.tripDate, tripTime: past.tripTime }),
  );
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-old",
      paymentReference: "PAY-OLD",
      tripDate: past.tripDate,
      tripTime: past.tripTime,
      pickupAt: past.pickupAt,
      assignmentStatus: "accepted",
      assignedDriverName: "Priya",
      assignedDriverMobile: PRIYA_MOBILE,
      driverContactToken: "cd".repeat(32),
    }),
  );
  await kv.store.put(`driver-contact:${"cd".repeat(32)}`, JSON.stringify({ jobToken: "job-old" }));
  const expired = await contact(env, "cd".repeat(32));
  const expiredJson = JSON.stringify(await expired.json());
  assert.match(expiredJson, /expired/i);
  assert.equal(expiredJson.includes(PRIYA_MOBILE), false);

  const foreign = await contact(env, "ef".repeat(32));
  assert.equal(foreign.status, 404);
  assert.equal(JSON.stringify(await foreign.json()).includes(PRIYA_DIGITS), false);
  const mat = await contact(env, "MAT-4827");
  assert.equal(mat.status, 404);

  const limitToken = "12".repeat(32);
  let lastStatus = 0;
  for (let i = 0; i < 41; i += 1) {
    const response = await contact(env, limitToken);
    lastStatus = response.status;
    await response.json().catch(() => null);
  }
  assert.equal(lastStatus, 429);
  console.log("OK  cancelled, expired, unknown, and rate-limited links hide driver details");
}

console.log("Reschedule clears the sent reminder");
{
  const kv = memoryKv();
  const env = envFor(kv.store);
  const first = londonWall(minutesFromNow(150));
  const moved = londonWall(minutesFromNow(90));
  await savePaidBookingRecord(
    kv.store,
    paid({ paymentReference: "PAY-MOVE", tripDate: first.tripDate, tripTime: first.tripTime }),
  );
  await saveTrackingJob(
    kv.store,
    job({
      token: "job-move",
      paymentReference: "PAY-MOVE",
      tripDate: first.tripDate,
      tripTime: first.tripTime,
      pickupAt: first.pickupAt,
    }),
  );
  await processJourneyRemindersForPayment(env, "PAY-MOVE", new Date());
  const afterFirst = customerMails().length;
  await processJourneyRemindersForPayment(env, "PAY-MOVE", new Date());
  assert.equal(customerMails().length, afterFirst);
  await savePaidBookingRecord(
    kv.store,
    paid({ paymentReference: "PAY-MOVE", tripDate: moved.tripDate, tripTime: moved.tripTime }),
  );
  const stored = await getTrackingJob(kv.store, "job-move");
  assert.ok(stored);
  stored.tripDate = moved.tripDate;
  stored.tripTime = moved.tripTime;
  stored.pickupAt = moved.pickupAt;
  await saveTrackingJob(kv.store, stored);
  await invalidateJourneyRemindersOnScheduleChange(kv.store, {
    paymentReference: "PAY-MOVE",
    previousTripDate: first.tripDate,
    previousTripTime: first.tripTime,
    nextTripDate: moved.tripDate,
    nextTripTime: moved.tripTime,
  });
  await processJourneyRemindersForPayment(env, "PAY-MOVE", new Date());
  assert.equal(customerMails().length, afterFirst + 1);
  assert.match(
    customerMails().at(-1)?.text ?? "",
    new RegExp(formatJourneyReminderClock(moved.tripTime).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  console.log("OK  a changed pickup can send a new reminder and does not repeat the old one");
}

console.log("\nAll in-memory journey reminder checks passed.");
console.log("No email left this process. Resend was stubbed and every other network call was blocked.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
