/**
 * Pure helpers for the mobile Owner Dashboard (Home, Bookings, Inbox, Customers).
 *
 * Every figure here is derived from records the Worker already returns — paid bookings,
 * short-notice requests, inbox threads and WhatsApp chats — using the same shared rules
 * as the classic dashboard (owner-dashboard-ops). Nothing is estimated: when a value
 * can't be worked out reliably it is left out (null) and the UI shows a dash.
 */
import {
  earnedRevenueOnDay,
  expandOwnerPaidBookingLegs,
  isOwnerOpsAwaitingPaymentStatus,
  ownerOpsPickupKey,
  ownerOpsTodayDate,
  paidBookingIsCancelled,
  parseOwnerMoneyGbp,
  type OwnerOpsLeg,
  type OwnerOpsPaidBooking,
} from "../../../shared/owner-dashboard-ops";

/** WhatsApp only delivers a normal (free-form) reply within 24h of the customer's last message. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MobilePaidBooking = OwnerOpsPaidBooking & {
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  assignedDriverName?: string;
  assignedDriverLabel?: string;
  notes?: string;
  customerReference?: string;
  /** Set when the owner is the default driver for this booking. */
  primaryDriverDefault?: boolean;
  /** Number or "£12.00"-style text, depending on how the record was written. */
  amountRefunded?: unknown;
};

export type MobileShortNotice = {
  reference: string;
  status: string;
  amountLabel?: string;
  shortNoticeExpiresAt?: string;
  removedFromDashboardAt?: string;
  booking: { customerName: string; tripDate: string; tripTime: string; pickupLabel: string; dropoffLabel: string };
};

export type MobileInboxThread = {
  threadKey: string;
  counterpartEmail: string;
  counterpartName?: string;
  subject: string;
  lastAt: string;
  lastSnippet: string;
  lastDirection: "in" | "out";
  unread: number;
  bookingRef?: string;
  archived: boolean;
};

export type MobileWhatsAppChat = {
  phone: string;
  name?: string;
  updatedAt: string;
  lastText: string;
  lastFrom: "customer" | "assistant" | "team";
};

/** One row in the combined Inbox (email + WhatsApp). */
export type MobileMessageItem = {
  id: string;
  channel: "email" | "whatsapp";
  name: string;
  preview: string;
  subject?: string;
  at: string;
  unread: boolean;
  /** The customer spoke last and nobody has answered yet. */
  needsReply: boolean;
  /** Automatic email from our own systems (reports, confirmations, alerts) — never counted as waiting. */
  system?: boolean;
  bookingRef?: string;
  /** WhatsApp only: when the free-reply window closes (ISO), or null if it already has. */
  replyWindowClosesAt?: string | null;
  threadKey?: string;
  phone?: string;
};

export type MobileUrgentItem = {
  id: string;
  kind: "short_notice" | "email" | "whatsapp" | "unpaid";
  title: string;
  detail: string;
  badge: string;
  tone: "red" | "amber" | "blue" | "green";
  target: { tab: "bookings" | "inbox" | "requests" | "admin"; ref?: string };
};

export type MobileHomeSummary = {
  today: string;
  nextPickup: OwnerOpsLeg | null;
  /** Legs due today that aren't cancelled — includes ones already completed. */
  todayLegs: OwnerOpsLeg[];
  todayCompletedCount: number;
  /** Completed-journey revenue for today (same rule as Money › Earned). */
  earnedTodayGbp: number;
  urgent: MobileUrgentItem[];
  unreadMessages: number;
};

const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatLondonTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? londonTime.format(new Date(ms)) : "";
}

/** Minutes from `now` until a London-local pickup date+time; negative when it has passed. */
export function minutesUntilPickup(leg: Pick<OwnerOpsLeg, "scheduledDate" | "scheduledTime">, now: Date): number | null {
  const date = String(leg.scheduledDate || "").slice(0, 10);
  const time = /^\d{1,2}:\d{2}/.test(leg.scheduledTime || "") ? leg.scheduledTime.slice(0, 5).padStart(5, "0") : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return null;
  // Work out London's UTC offset for that day without a timezone library.
  const probe = new Date(`${date}T12:00:00Z`);
  const londonNoon = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(probe);
  const offsetHours = Number(londonNoon) - 12;
  const utcMs = Date.parse(`${date}T${time}:00Z`) - offsetHours * 60 * 60 * 1000;
  if (!Number.isFinite(utcMs)) return null;
  return Math.round((utcMs - now.getTime()) / 60000);
}

/** "15 min", "3 h", "2 days" — how long a customer has been waiting. */
export function formatWaiting(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatCountdown(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes <= 0) return "now";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `in ${m} min`;
  if (h >= 24) return "";
  return `in ${h} h ${m} min`;
}

export function paidLegs(bookings: MobilePaidBooking[]): OwnerOpsLeg[] {
  return bookings.flatMap((booking) => expandOwnerPaidBookingLegs(booking));
}

/** The booking record behind a leg (legs carry the booking's payment reference). */
export function bookingForLeg(bookings: MobilePaidBooking[], leg: OwnerOpsLeg): MobilePaidBooking | undefined {
  return bookings.find((booking) => booking.paymentReference === leg.bookingId);
}

export function whatsAppReplyWindowClosesAt(chat: MobileWhatsAppChat, now: Date): string | null {
  if (chat.lastFrom !== "customer") return null;
  const last = Date.parse(chat.updatedAt);
  if (!Number.isFinite(last)) return null;
  const closes = last + WHATSAPP_SERVICE_WINDOW_MS;
  return closes > now.getTime() ? new Date(closes).toISOString() : null;
}

const OWN_EMAIL_DOMAIN = "myairporttaxini.co.uk";
/** Automated senders whose alerts still deserve attention (e.g. a missed phone call). */
const ATTENTION_SENDER_DOMAINS = ["fonio.ai"];

/**
 * True for automatic emails: anything sent by our own website/mailbox (quote reports, "quote viewed",
 * booking confirmations copied to the office) and no-reply senders. A customer's contact-form
 * message arrives with the customer's address, so it is not a system email.
 */
export function isSystemEmailSender(email: string): boolean {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (ATTENTION_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  if (domain === OWN_EMAIL_DOMAIN || domain.endsWith(`.${OWN_EMAIL_DOMAIN}`)) return true;
  return /^(no-?reply|do-?not-?reply|donotreply|notifications?|mailer-daemon|postmaster|bounces?)([+._-].*)?$/.test(local);
}

export function buildMessageItems(
  threads: MobileInboxThread[],
  chats: MobileWhatsAppChat[],
  now: Date,
): MobileMessageItem[] {
  const email: MobileMessageItem[] = threads
    .filter((thread) => !thread.archived)
    .map((thread) => {
      const system = isSystemEmailSender(thread.counterpartEmail);
      return {
        id: `email:${thread.threadKey}`,
        channel: "email" as const,
        name: thread.counterpartName?.trim() || thread.counterpartEmail,
        subject: thread.subject,
        preview: thread.lastSnippet,
        at: thread.lastAt,
        // System emails never count as unread or waiting for a reply.
        unread: !system && thread.unread > 0,
        needsReply: !system && thread.lastDirection === "in",
        ...(system ? { system: true } : {}),
        bookingRef: thread.bookingRef,
        threadKey: thread.threadKey,
      };
    });
  const whatsapp: MobileMessageItem[] = chats.map((chat) => {
    const closes = whatsAppReplyWindowClosesAt(chat, now);
    return {
      id: `whatsapp:${chat.phone}`,
      channel: "whatsapp",
      name: chat.name?.trim() || `+${chat.phone}`,
      preview: chat.lastText,
      at: chat.updatedAt,
      // WhatsApp has no read receipts in the dashboard: a customer message nobody has answered counts as unread.
      unread: chat.lastFrom === "customer",
      needsReply: chat.lastFrom === "customer",
      replyWindowClosesAt: closes,
      phone: chat.phone,
    };
  });
  return [...email, ...whatsapp].sort((a, b) => b.at.localeCompare(a.at));
}

function shortNoticeIsAwaitingDecision(item: MobileShortNotice, now: Date): boolean {
  if (item.removedFromDashboardAt) return false;
  if (item.status !== "SHORT_NOTICE_AWAITING_APPROVAL") return false;
  const expires = Date.parse(item.shortNoticeExpiresAt || "");
  return !Number.isFinite(expires) || expires > now.getTime();
}

export function buildHomeSummary(input: {
  bookings: MobilePaidBooking[];
  shortNotice: MobileShortNotice[];
  threads: MobileInboxThread[];
  chats: MobileWhatsAppChat[];
  now: Date;
}): MobileHomeSummary {
  const { now } = input;
  const today = ownerOpsTodayDate(now);
  const legs = paidLegs(input.bookings);
  const todayLegs = legs
    .filter((leg) => !leg.cancelled && leg.scheduledDate === today)
    .sort((a, b) => ownerOpsPickupKey(a).localeCompare(ownerOpsPickupKey(b)));
  const upcoming = legs
    .filter((leg) => !leg.cancelled && !leg.completed && leg.scheduledDate >= today)
    .filter((leg) => {
      const mins = minutesUntilPickup(leg, now);
      // Keep a pickup "next" until 60 minutes after its time (the no-show point).
      return mins === null || mins > -60;
    })
    .sort((a, b) => ownerOpsPickupKey(a).localeCompare(ownerOpsPickupKey(b)));

  const urgent: MobileUrgentItem[] = [];
  for (const item of input.shortNotice) {
    if (!shortNoticeIsAwaitingDecision(item, now)) continue;
    const expires = Date.parse(item.shortNoticeExpiresAt || "");
    const minsLeft = Number.isFinite(expires) ? Math.max(0, Math.round((expires - now.getTime()) / 60000)) : null;
    urgent.push({
      id: `sn:${item.reference}`,
      kind: "short_notice",
      title: "Pending booking — approve or decline",
      detail: `${item.booking.customerName} · ${item.booking.tripDate.slice(5).split("-").reverse().join("/")} ${item.booking.tripTime}`,
      badge: minsLeft === null ? "Decide" : minsLeft >= 60 ? `${Math.floor(minsLeft / 60)} h left` : `${minsLeft} min`,
      tone: "red",
      target: { tab: "requests", ref: item.reference },
    });
  }

  const messages = buildMessageItems(input.threads, input.chats, now);
  for (const message of messages) {
    if (!message.needsReply || !message.unread) continue;
    const waitedMs = now.getTime() - Date.parse(message.at);
    const waited = Number.isFinite(waitedMs) ? formatWaiting(waitedMs) : "";
    urgent.push({
      id: message.id,
      kind: message.channel,
      title: message.name,
      detail: message.subject || message.preview,
      badge:
        message.channel === "whatsapp" && !message.replyWindowClosesAt
          ? "Window closed"
          : waited
            ? `Waiting ${waited}`
            : "Unread",
      tone: message.channel === "whatsapp" ? "green" : "blue",
      target: { tab: "inbox", ref: message.id },
    });
  }

  for (const booking of input.bookings) {
    if (paidBookingIsCancelled(booking) || !isOwnerOpsAwaitingPaymentStatus(booking.status)) continue;
    const amount = parseOwnerMoneyGbp(booking.amountPaid) || Number(booking.amount) || 0;
    urgent.push({
      id: `unpaid:${booking.paymentReference}`,
      kind: "unpaid",
      title: `Awaiting payment · ${booking.customerName || booking.paymentReference}`,
      detail: `${booking.pickupLabel || "Pickup"} → ${booking.dropoffLabel || "Drop-off"}`,
      badge: amount > 0 ? `£${amount.toFixed(2).replace(/\.00$/, "")}` : "Unpaid",
      tone: "amber",
      target: { tab: "admin", ref: booking.paymentReference },
    });
  }

  return {
    today,
    nextPickup: upcoming[0] ?? null,
    todayLegs,
    todayCompletedCount: todayLegs.filter((leg) => leg.completed).length,
    earnedTodayGbp: earnedRevenueOnDay(legs, today),
    urgent,
    unreadMessages: messages.filter((message) => message.unread).length,
  };
}

export type MobileCustomer = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  bookings: MobilePaidBooking[];
  upcomingCount: number;
  /** Money actually kept from paid bookings (paid − refunded). Null when any booking's amount is unclear. */
  totalSpendGbp: number | null;
  lastTripDate: string;
};

function normaliseMobile(raw?: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("44")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

/**
 * One entry per real customer: bookings are merged when they share an email address
 * or a mobile number, so the same person isn't listed twice.
 */
export function buildCustomerDirectory(bookings: MobilePaidBooking[], today: string): MobileCustomer[] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const keysFor = (booking: MobilePaidBooking): string[] => {
    const keys: string[] = [];
    const email = String(booking.customerEmail || "").trim().toLowerCase();
    const mobile = normaliseMobile(booking.mobileNumber);
    if (email) keys.push(`e:${email}`);
    if (mobile.length >= 9) keys.push(`m:${mobile}`);
    if (!keys.length) keys.push(`r:${booking.paymentReference}`);
    return keys;
  };

  for (const booking of bookings) {
    const keys = keysFor(booking);
    for (const key of keys) if (!parent.has(key)) parent.set(key, key);
    for (const key of keys.slice(1)) union(keys[0], key);
  }

  const groups = new Map<string, MobilePaidBooking[]>();
  for (const booking of bookings) {
    const root = find(keysFor(booking)[0]);
    const list = groups.get(root) || [];
    if (!list.some((existing) => existing.paymentReference === booking.paymentReference)) list.push(booking);
    groups.set(root, list);
  }

  const customers: MobileCustomer[] = [];
  for (const [id, list] of groups) {
    const sorted = [...list].sort((a, b) => String(b.tripDate || "").localeCompare(String(a.tripDate || "")));
    const latest = sorted[0];
    let total: number | null = 0;
    for (const booking of sorted) {
      if (isOwnerOpsAwaitingPaymentStatus(booking.status)) continue;
      const paid = parseOwnerMoneyGbp(booking.amountPaid) || Number(booking.amount) || 0;
      if (!(paid > 0)) {
        total = null;
        break;
      }
      const refunded = parseOwnerMoneyGbp(booking.amountRefunded);
      total = Math.round((total + paid - refunded) * 100) / 100;
    }
    customers.push({
      id,
      name: sorted.find((b) => b.customerName?.trim())?.customerName?.trim() || "Customer",
      email: sorted.find((b) => b.customerEmail?.trim())?.customerEmail?.trim(),
      mobile: sorted.find((b) => b.mobileNumber?.trim())?.mobileNumber?.trim(),
      bookings: sorted,
      upcomingCount: sorted.filter(
        (b) => !paidBookingIsCancelled(b) && String(b.tripDate || "").slice(0, 10) >= today,
      ).length,
      totalSpendGbp: total,
      lastTripDate: String(latest?.tripDate || ""),
    });
  }
  return customers.sort((a, b) => b.lastTripDate.localeCompare(a.lastTripDate) || a.name.localeCompare(b.name));
}

export function matchesBookingSearch(booking: MobilePaidBooking, leg: OwnerOpsLeg, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    booking.customerName,
    booking.customerEmail,
    booking.mobileNumber,
    booking.paymentReference,
    booking.customerReference,
    booking.flightNumber,
    booking.returnFlightNumber,
    leg.pickup,
    leg.dropoff,
    leg.scheduledDate,
    leg.scheduledDate.split("-").reverse().join("/"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** wa.me link for a UK/IE mobile, or null when the number can't be used. */
export function whatsAppLink(mobile?: string, text?: string): string | null {
  const digits = normaliseMobile(mobile);
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function telLink(mobile?: string): string | null {
  const digits = normaliseMobile(mobile);
  return digits.length >= 10 ? `tel:+${digits}` : null;
}

export function mapsLink(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
}
