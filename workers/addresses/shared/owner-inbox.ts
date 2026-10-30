/**
 * Owner dashboard inbox: emails to bookings@ (copied in from the GoDaddy mailbox via Resend
 * receiving) and replies / new emails sent from the dashboard with the branded signature.
 * Pure helpers shared by the Worker and the website.
 */
import {
  BRAND_EMERALD,
  BRAND_NAVY,
  BUSINESS_EMAIL_LOGO_ALT,
  BUSINESS_EMAIL_LOGO_URL,
  BUSINESS_MAILBOX,
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_TEL,
  BUSINESS_WEBSITE,
  businessWhatsAppChatUrl,
} from "./business-email";

export const INBOX_MESSAGE_MAX = 10_000;
export const INBOX_SUBJECT_MAX = 200;
export const INBOX_SIGNATURE_NAME = "Brian Rice";

export type InboxDirection = "in" | "out";

export type InboxAttachmentMeta = {
  id: string;
  filename: string;
  contentType: string;
  size?: number;
};

export type InboxMessage = {
  id: string;
  direction: InboxDirection;
  /** Customer side of the conversation (sender for "in", recipient for "out"). */
  counterpartEmail: string;
  counterpartName?: string;
  subject: string;
  text: string;
  /** Original HTML for received mail (shown sandboxed). Sent mail keeps text only. */
  html?: string;
  at: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: InboxAttachmentMeta[];
  bookingRef?: string;
  read?: boolean;
  archived?: boolean;
  threadKey: string;
};

export type InboxThreadSummary = {
  threadKey: string;
  counterpartEmail: string;
  counterpartName?: string;
  subject: string;
  lastAt: string;
  lastSnippet: string;
  lastDirection: InboxDirection;
  unread: number;
  count: number;
  bookingRef?: string;
  archived: boolean;
};

export function normalizeInboxEmail(raw: unknown): string {
  const value = String(raw ?? "").trim();
  const angle = /<([^>]+)>/.exec(value)?.[1] ?? value;
  const email = angle.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

/** "Sarah Jones <sarah@x.com>" → "Sarah Jones". */
export function displayNameFromAddress(raw: unknown): string {
  const value = String(raw ?? "").trim();
  const match = /^"?([^"<]+?)"?\s*</.exec(value);
  return match?.[1]?.trim() ?? "";
}

/** Strip Re:/Fwd:/Fw: prefixes (any number) for threading. */
export function baseSubject(subject: string): string {
  let s = String(subject ?? "").trim();
  for (;;) {
    const next = s.replace(/^\s*(re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

export function inboxThreadKey(counterpartEmail: string, subject: string): string {
  return `${normalizeInboxEmail(counterpartEmail)}|${baseSubject(subject).toLowerCase().replace(/\s+/g, " ")}`;
}

export function replySubject(subject: string): string {
  const base = baseSubject(subject);
  return base ? `Re: ${base}` : "Re: your email";
}

/** First MAT-#### reference in the text, if any. */
export function findBookingRef(...parts: Array<string | undefined>): string | undefined {
  for (const part of parts) {
    const match = /\bMAT-\d{3,6}\b/i.exec(part ?? "");
    if (match) return match[0].toUpperCase();
  }
  return undefined;
}

/** Plain text from simple email HTML (fallback when a message has no text part). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function snippet(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function escapeInboxHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortPlace(label: string): string {
  return (label ?? "").split(",")[0]?.trim() || label;
}

function niceDate(date: string, time: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!date || Number.isNaN(d.getTime())) return [date, time].filter(Boolean).join(" ");
  // Built by hand so every runtime (Worker, browser, Node) prints the same thing.
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return time ? `${day}, ${time}` : day;
}

export type InboxBookingDetails = {
  reference: string;
  customerName: string;
  customerEmail: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  flightNumber?: string;
  manageUrl?: string;
};

/** "MAT-1563 · Fri 20 Nov 2026, 05:30 · Glengormley → Belfast International Airport" */
export function bookingEmailSubject(booking: InboxBookingDetails): string {
  return [
    booking.reference,
    niceDate(booking.tripDate, booking.tripTime),
    `${shortPlace(booking.pickupLabel)} → ${shortPlace(booking.dropoffLabel)}`,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, INBOX_SUBJECT_MAX);
}

function bookingDetailLines(booking: InboxBookingDetails): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ["Booking", booking.reference],
    ["Pickup", `${niceDate(booking.tripDate, booking.tripTime)} — ${booking.pickupLabel}`],
    ["Drop-off", booking.dropoffLabel],
  ];
  if (booking.returnJourney && booking.returnDate) {
    lines.push(["Return", niceDate(booking.returnDate, booking.returnTime ?? "")]);
  }
  const party = [
    booking.passengers ? `${booking.passengers} passenger${booking.passengers === 1 ? "" : "s"}` : "",
    typeof booking.suitcases === "number" ? `${booking.suitcases} case${booking.suitcases === 1 ? "" : "s"}` : "",
    booking.vehicle ?? "",
  ].filter(Boolean);
  if (party.length) lines.push(["Party", party.join(" · ")]);
  if (booking.flightNumber) lines.push(["Flight", booking.flightNumber]);
  return lines;
}

export function signatureText(): string {
  return [
    INBOX_SIGNATURE_NAME,
    BUSINESS_NAME,
    `Tel: ${BUSINESS_PHONE_DISPLAY}`,
    `Email: ${BUSINESS_MAILBOX}`,
    BUSINESS_WEBSITE.replace(/^https?:\/\//, ""),
  ].join("\n");
}

/** Branded signature: logo on the navy brand block, then name and contact details. */
export function signatureHtml(): string {
  const site = BUSINESS_WEBSITE;
  const link = `color:${BRAND_NAVY};text-decoration:none;`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e6e9ee;padding-top:16px;font-family:Arial,Helvetica,sans-serif;">` +
    `<tr>` +
    `<td valign="middle" style="padding:16px 16px 0 0;">` +
    `<a href="${site}/" style="display:inline-block;background:${BRAND_NAVY};border-radius:10px;padding:8px 10px;text-decoration:none;">` +
    `<img src="${BUSINESS_EMAIL_LOGO_URL}" alt="${escapeInboxHtml(BUSINESS_EMAIL_LOGO_ALT)}" width="84" height="65" border="0" style="display:block;width:84px;height:auto;border:0;background:${BRAND_NAVY};" />` +
    `</a></td>` +
    `<td valign="middle" style="padding:16px 0 0 0;font-size:13px;line-height:1.55;color:#1d2433;">` +
    `<div style="font-size:15px;font-weight:bold;color:${BRAND_NAVY};">${escapeInboxHtml(INBOX_SIGNATURE_NAME)}</div>` +
    `<div style="font-weight:bold;color:${BRAND_EMERALD};">${escapeInboxHtml(BUSINESS_NAME)}</div>` +
    `<div>Tel: <a href="tel:${BUSINESS_PHONE_TEL}" style="${link}">${BUSINESS_PHONE_DISPLAY}</a></div>` +
    `<div>Email: <a href="mailto:${BUSINESS_MAILBOX}" style="${link}">${BUSINESS_MAILBOX}</a></div>` +
    `<div><a href="${site}/" style="${link}">${site.replace(/^https?:\/\//, "")}</a> · ` +
    `<a href="${businessWhatsAppChatUrl()}" style="color:${BRAND_EMERALD};text-decoration:none;font-weight:bold;">Chat on WhatsApp</a></div>` +
    `</td></tr></table>`
  );
}

function paragraphsHtml(message: string): string {
  return message
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeInboxHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Email sent from the dashboard (reply or new). Plain business-letter look with the
 * signature, optional booking details box, and the previous message quoted underneath.
 */
export function buildOwnerOutgoingEmail(input: {
  message: string;
  booking?: InboxBookingDetails | null;
  quoted?: { from: string; at: string; text: string } | null;
}): { text: string; html: string } {
  const message = input.message.trim();
  const details = input.booking ? bookingDetailLines(input.booking) : [];
  const quoted = input.quoted?.text?.trim() ? input.quoted : null;
  const quotedText = quoted ? quoted.text.trim().split("\n").slice(0, 60).join("\n") : "";

  const text =
    `${message}\n\n` +
    (details.length
      ? `Your booking\n${details.map(([k, v]) => `${k}: ${v}`).join("\n")}\n` +
        (input.booking?.manageUrl ? `Manage your booking: ${input.booking.manageUrl}\n` : "") +
        "\n"
      : "") +
    `--\n${signatureText()}` +
    (quoted
      ? `\n\nOn ${quoted.at}, ${quoted.from} wrote:\n${quotedText.split("\n").map((l) => `> ${l}`).join("\n")}`
      : "");

  const detailsHtml = details.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 4px;border:1px solid #e6e9ee;border-radius:10px;background:#f7f9fb;">` +
      `<tr><td style="padding:12px 16px 4px;font-size:13px;font-weight:bold;color:${BRAND_NAVY};">Your booking</td></tr>` +
      details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 16px;font-size:13px;line-height:1.5;color:#1d2433;"><span style="color:#6b7280;">${escapeInboxHtml(k)}:</span> ${escapeInboxHtml(v)}</td></tr>`,
        )
        .join("") +
      (input.booking?.manageUrl
        ? `<tr><td style="padding:8px 16px 12px;font-size:13px;"><a href="${escapeInboxHtml(input.booking.manageUrl)}" style="color:${BRAND_NAVY};font-weight:bold;">Change or cancel your booking</a></td></tr>`
        : `<tr><td style="padding:0 0 8px;"></td></tr>`) +
      `</table>`
    : "";

  const quotedHtml = quoted
    ? `<div style="margin-top:22px;font-size:12px;color:#6b7280;">On ${escapeInboxHtml(quoted.at)}, ${escapeInboxHtml(quoted.from)} wrote:</div>` +
      `<blockquote style="margin:6px 0 0;padding:0 0 0 12px;border-left:3px solid #d5dae1;color:#6b7280;font-size:13px;line-height:1.5;">${escapeInboxHtml(quotedText).replace(/\n/g, "<br>")}</blockquote>`
    : "";

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;">` +
    `<div style="max-width:600px;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2433;">` +
    paragraphsHtml(message) +
    detailsHtml +
    signatureHtml() +
    quotedHtml +
    `</div></body></html>`;
  return { text, html };
}

/** Group messages into threads, newest activity first. */
export function summarizeInboxThreads(messages: InboxMessage[]): InboxThreadSummary[] {
  const byKey = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const list = byKey.get(m.threadKey) ?? [];
    list.push(m);
    byKey.set(m.threadKey, list);
  }
  const threads: InboxThreadSummary[] = [];
  for (const [threadKey, list] of byKey) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    const last = list[list.length - 1]!;
    const firstIn = list.find((m) => m.direction === "in");
    threads.push({
      threadKey,
      counterpartEmail: last.counterpartEmail,
      counterpartName: firstIn?.counterpartName || list.find((m) => m.counterpartName)?.counterpartName,
      subject: baseSubject(list[0]!.subject) || "(no subject)",
      lastAt: last.at,
      lastSnippet: snippet(last.text),
      lastDirection: last.direction,
      unread: list.filter((m) => m.direction === "in" && !m.read).length,
      count: list.length,
      bookingRef: list.find((m) => m.bookingRef)?.bookingRef,
      archived: list.every((m) => m.archived),
    });
  }
  return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
