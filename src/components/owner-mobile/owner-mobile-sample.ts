/**
 * Clearly-labelled SAMPLE data for the staging preview only, so the new layout can be tried
 * on a phone when the isolated staging Worker has no bookings. Never used on the live site:
 * the switch only appears on preview hosts, and every screen shows a "Sample data" banner.
 */
import type { OwnerPaidBookingSummary } from "@/lib/paid-bookings-api";
import type { ShortNoticeBookingSummary } from "@/lib/short-notice-api";
import type { InboxListResponse, InboxThreadResponse } from "@/lib/owner-inbox-api";
import { addDaysYmd } from "../../../shared/upcoming-jobs";
import { ownerOpsTodayDate } from "../../../shared/owner-dashboard-ops";
import type { MobileWhatsAppChat } from "./owner-mobile-data";

export function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith(".pages.dev") || host === "localhost" || host === "127.0.0.1";
}

function londonClock(now: Date, addMinutes: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(now.getTime() + addMinutes * 60000),
  );
}

export function sampleOwnerData(now: Date) {
  const today = ownerOpsTodayDate(now);
  const tomorrow = addDaysYmd(today, 1);
  const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60000).toISOString();
  const base = {
    createdAt: iso(60 * 24 * 6),
    status: "paid",
    vehicle: "Saloon",
  };
  const bookings = [
    { ...base, paymentReference: "SAMPLE-1", customerReference: "MAT-0001", customerName: "Sarah Sample", customerEmail: "sarah@example.com", mobileNumber: "07700 900123", pickupLabel: "Belfast International Airport", dropoffLabel: "Glengormley BT36", tripDate: today, tripTime: londonClock(now, 95), amount: 68, amountPaid: "£68.00", flightNumber: "EZY3412", passengers: 3, suitcases: 2 },
    { ...base, paymentReference: "SAMPLE-2", customerReference: "MAT-0002", customerName: "Declan Example", customerEmail: "declan@example.com", mobileNumber: "", pickupLabel: "Antrim BT41", dropoffLabel: "Belfast City Airport", tripDate: today, tripTime: "06:15", journeyStatus: "completed", journeyCompletedAt: iso(9 * 60), amount: 45, amountPaid: "£45.00", passengers: 1 },
    { ...base, paymentReference: "SAMPLE-3", customerReference: "MAT-0003", customerName: "Aoife Test", customerEmail: "aoife@example.com", mobileNumber: "07700 900777", pickupLabel: "Lisburn BT28", dropoffLabel: "Belfast City Airport", tripDate: today, tripTime: londonClock(now, 180), amount: 54, amountPaid: "£54.00", passengers: 2, assignedDriverName: "Mark" },
    { ...base, paymentReference: "SAMPLE-4", customerReference: "MAT-0004", customerName: "James Demo", customerEmail: "james@example.com", mobileNumber: "07700 900999", pickupLabel: "Dublin Airport T2", dropoffLabel: "Newry BT34", tripDate: tomorrow, tripTime: "09:30", status: "awaiting_payment", amount: 92, amountPaid: "£92.00", passengers: 4 },
  ] as unknown as OwnerPaidBookingSummary[];

  const shortNotice = [
    {
      reference: "SAMPLE-SN",
      paymentToken: "",
      status: "SHORT_NOTICE_AWAITING_APPROVAL",
      amount: 60,
      amountLabel: "£60.00",
      materialFingerprint: "",
      createdAt: iso(10),
      updatedAt: iso(10),
      shortNoticeExpiresAt: new Date(now.getTime() + 18 * 60000).toISOString(),
      booking: { customerName: "Ann Sample", customerEmail: "ann@example.com", mobileNumber: "", pickupLabel: "Ballyclare", dropoffLabel: "Belfast International Airport", tripDate: tomorrow, tripTime: "05:10", returnJourney: false, passengers: 2, suitcases: 2, vehicle: "Saloon" },
    },
  ] as unknown as ShortNoticeBookingSummary[];

  const inbox: InboxListResponse = {
    connected: true,
    readKey: true,
    receivingAddress: null,
    connection: null,
    lastReceivedAt: iso(20),
    threads: [
      { threadKey: "sample-thread", counterpartEmail: "sarah@example.com", counterpartName: "Sarah Sample", subject: "Re: Your booking MAT-0001", lastAt: iso(20), lastSnippet: "Our flight is showing on time — we'll have two large cases.", lastDirection: "in", unread: 1, count: 2, bookingRef: "MAT-0001", archived: false },
    ],
  };

  const chats: MobileWhatsAppChat[] = [
    { phone: "447700900456", name: "Paul Sample", updatedAt: iso(15), lastText: "Can you do 5 people to Dublin Airport on 2 Dec with golf bags?", lastFrom: "customer" },
    { phone: "447700900789", name: "Niamh Example", updatedAt: iso(60 * 50), lastText: "Is the price the same for the way back?", lastFrom: "customer" },
  ];

  const thread: InboxThreadResponse = {
    messages: [
      { id: "s1", direction: "out", counterpartEmail: "sarah@example.com", counterpartName: "Sarah Sample", subject: "Your booking MAT-0001", text: "Thanks for booking — your driver will meet you in the arrivals hall with a name board.", at: iso(60 * 24), threadKey: "sample-thread" },
      { id: "s2", direction: "in", counterpartEmail: "sarah@example.com", counterpartName: "Sarah Sample", subject: "Re: Your booking MAT-0001", text: "Our flight is showing on time — we'll have two large cases. Is that OK for a saloon?", at: iso(20), threadKey: "sample-thread", read: true },
    ],
    bookings: [{ paymentReference: "SAMPLE-1", reference: "MAT-0001", tripDate: today, tripTime: londonClock(now, 95), route: "Belfast International Airport → Glengormley BT36" }],
  };

  const chatRecord = {
    phone: "447700900456",
    name: "Paul Sample",
    messages: [
      { at: iso(18), from: "customer" as const, text: "Hi, can you do 5 people to Dublin Airport on 2 Dec with golf bags? Leaving Holywood about 6am." },
      { at: iso(17), from: "assistant" as const, text: "Thanks Paul! For 5 with golf bags we'd need our larger vehicle. Let me check with the team and come back to you." },
      { at: iso(15), from: "customer" as const, text: "Can you do 5 people to Dublin Airport on 2 Dec with golf bags?" },
    ],
  };

  return { bookings, shortNotice, inbox, chats, thread, chatRecord };
}
