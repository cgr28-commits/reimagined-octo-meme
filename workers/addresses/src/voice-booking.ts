/**
 * Phone assistant (fonio) — existing bookings.
 *
 *   POST /voice/booking       { reference?, mobile }  → spoken summary (reference + mobile must match)
 *   POST /voice/booking-link  { reference?, mobile }  → WhatsApp the booking details + Manage booking
 *                                                       button to the mobile ON THE BOOKING; SMS text
 *                                                       returned as a backup
 *
 * Olivia never changes or cancels anything: changes go through Manage Booking.
 */
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { addCalendarDays } from "../shared/quick-quote-parse";
import { todayLondonDate } from "../shared/uk-time";
import {
  matchVoiceBooking,
  voiceBookingReference,
  voiceBookingSay,
  voiceBookingSmsText,
  voiceMobile,
  voiceMobileOnlySay,
  VOICE_BOOKING_NOT_FOUND_SAY,
  type VoiceBookingMatch,
  type VoiceDriverInfo,
} from "../shared/voice-booking";
import {
  ensureManageBookingToken,
  getPaidBookingRecordByCustomerReference,
  listUpcomingPaidBookings,
} from "./paid-booking-store";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";
import { listTrackingJobsForDateRange } from "./tracking-store";
import { resendBookingDetailsWhatsApp, type WhatsAppTemplateEnv } from "./whatsapp-templates";

type Env = WhatsAppTemplateEnv & { TRACKING_STORE?: KVNamespace; SITE_ORIGIN?: string };

const LOOKUPS_PER_HOUR = 40;
const LINKS_PER_HOUR = 20;

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readInput(request: Request): Promise<{ reference: string | null; mobile: string | null; rawMobile: string }> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const root = body && typeof body === "object" ? body : {};
  let input: Record<string, unknown> = root;
  for (const key of ["parameters", "args", "arguments", "data", "input"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      input = { ...root, ...(inner as Record<string, unknown>) };
      break;
    }
  }
  const rawMobile = String(input.mobile ?? input.phone ?? "").trim();
  return { reference: voiceBookingReference(input.reference ?? input.bookingReference), mobile: voiceMobile(rawMobile), rawMobile };
}

async function findBooking(store: KVNamespace, reference: string | null, mobile: string): Promise<VoiceBookingMatch> {
  const byReference = reference ? await getPaidBookingRecordByCustomerReference(store, reference) : null;
  const candidates = reference ? [] : await listUpcomingPaidBookings(store, { pastDays: 1, futureDays: 180, limit: 250 });
  return matchVoiceBooking({ reference, mobile, byReference, candidates });
}

/** Driver name (accepted assigned driver) and on-the-way status for a journey in the next day. */
async function driverInfo(store: KVNamespace, booking: PaidBookingRecord): Promise<VoiceDriverInfo> {
  try {
    const today = todayLondonDate();
    const jobs = await listTrackingJobsForDateRange(store, addCalendarDays(today, -1), addCalendarDays(today, 1));
    const job = jobs
      .filter((j) => j.paymentReference === booking.paymentReference && !j.refundedAt)
      .filter((j) => !["arrived_destination", "completed", "stopped"].includes(j.journeyStatus ?? "idle"))
      .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt))[0];
    if (!job) return null;
    const name = job.assignmentStatus === "accepted" ? job.assignedDriverName?.trim().split(/\s+/)[0] : undefined;
    const onTheWay = ["tracking", "en_route", "arrived_pickup"].includes(job.journeyStatus ?? "idle");
    return name || onTheWay ? { name, onTheWay } : null;
  } catch {
    return null;
  }
}

export async function handleVoiceBooking(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return reply({ ok: false, say: "I can't look up bookings right now. Can I take your details so the team can call you back?" }, 503);
  const { reference, mobile, rawMobile } = await readInput(request);
  if (!mobile) {
    return reply({
      ok: false,
      missing: ["mobile"],
      say: rawMobile
        ? "Sorry, I didn't catch that as a mobile number. What's the mobile number the booking was made with?"
        : "What's the mobile number the booking was made with?",
    });
  }
  if ((await consumeQuickQuoteCreateQuota(store, "voice:booking", LOOKUPS_PER_HOUR)) === "limited") {
    return reply({ ok: false, say: "I can't look that up just now. Can I take your details so the team can get back to you?" });
  }

  const match = await findBooking(store, reference, mobile);
  console.log(JSON.stringify({ event: "voice_booking_lookup", byRef: Boolean(reference), result: match.kind }));
  if (match.kind === "not_found") return reply({ ok: false, found: false, say: VOICE_BOOKING_NOT_FOUND_SAY });
  if (match.kind === "mobile_only") {
    return reply({ ok: true, found: true, verified: false, count: match.bookings.length, say: voiceMobileOnlySay(match.bookings.length) });
  }
  const driver = await driverInfo(store, match.booking);
  return reply({
    ok: true,
    found: true,
    verified: true,
    reference: match.booking.customerReference ?? null,
    say: voiceBookingSay(match.booking, driver),
  });
}

export async function handleVoiceBookingLink(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  const fallback = "I'll pass that to the team and they'll send you your booking link shortly.";
  if (!store) return reply({ ok: false, say: fallback });
  const { reference, mobile } = await readInput(request);
  if (!mobile) return reply({ ok: false, missing: ["mobile"], say: "What's the mobile number the booking was made with?" });
  if ((await consumeQuickQuoteCreateQuota(store, "voice:booking-link", LINKS_PER_HOUR)) === "limited") {
    return reply({ ok: false, say: fallback });
  }

  const match = await findBooking(store, reference, mobile);
  if (match.kind === "not_found") return reply({ ok: false, say: VOICE_BOOKING_NOT_FOUND_SAY });
  let booking = match.kind === "verified" ? match.booking : match.bookings[0]!;
  try {
    booking = await ensureManageBookingToken(store, booking);
  } catch {
    // Without a token the button opens the lookup page instead.
  }
  const origin = (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
  const manageUrl = booking.manageBookingToken ? buildManageBookingUrl(origin, booking.manageBookingToken) : null;

  // Always to the number on the booking — never to a number given on the call.
  const sent = await resendBookingDetailsWhatsApp(env, {
    paymentReference: booking.paymentReference,
    customerReference: booking.customerReference,
    customerName: booking.customerName,
    mobile: booking.mobileNumber,
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    pickupLabel: booking.pickupLabel,
    dropoffLabel: booking.dropoffLabel,
    manageToken: booking.manageBookingToken,
  });
  console.log(JSON.stringify({ event: "voice_booking_link", sent: sent.sent, reason: sent.sent ? null : sent.reason }));
  if (sent.sent || sent.reason === "already_sent") {
    return reply({
      ok: true,
      say: "Done – I've sent your booking details to your WhatsApp. Tap Manage booking to view, change or cancel it.",
    });
  }
  return reply({
    ok: false,
    sendBySms: true,
    mobile: booking.mobileNumber,
    smsText: voiceBookingSmsText(booking, manageUrl),
    say: "I'll text you your booking details and link instead.",
  });
}
