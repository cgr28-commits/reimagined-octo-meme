export const MARKETING_CONSENT_VERSION = "August 2026";

export type MarketingOptInSource =
  | "paid-booking"
  | "booking-request"
  | "tour-enquiry"
  | "vehicle-enquiry";

export type MarketingSubscriber = {
  email: string;
  name?: string;
  optedInAt: string;
  source: MarketingOptInSource;
  consentVersion: string;
  unsubscribedAt?: string;
  /** Random token for one-click unsubscribe links in marketing emails. */
  unsubscribeToken?: string;
};

export type MarketingOptInFields = {
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
};

export function formatMarketingOptInLine(fields: MarketingOptInFields): string | null {
  if (!fields.marketingOptIn) {
    return null;
  }

  const when = fields.marketingOptInAt?.trim();
  const version = fields.marketingConsentVersion?.trim() || MARKETING_CONSENT_VERSION;
  return when
    ? `Marketing updates: opted in (${when}, consent ${version})`
    : `Marketing updates: opted in (consent ${version})`;
}

/** Owner dashboard / CSV row (no tokens). */
export type MarketingSubscriberRow = Omit<MarketingSubscriber, "unsubscribeToken">;

function csvCell(value: string | undefined): string {
  const v = String(value ?? "");
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function marketingSubscribersCsv(rows: MarketingSubscriberRow[]): string {
  const header = ["Email", "Name", "Opted in", "Source", "Consent version", "Status", "Unsubscribed"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.name,
      r.optedInAt,
      r.source,
      r.consentVersion,
      r.unsubscribedAt ? "Unsubscribed" : "Subscribed",
      r.unsubscribedAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const MARKETING_SUBJECT_MAX = 150;
export const MARKETING_MESSAGE_MAX = 5000;

/**
 * Marketing email from the owner's message: plain text + simple branded HTML, a
 * "Get a quote" button and a one-click unsubscribe link in every email.
 */
export function buildMarketingEmail(input: {
  subject: string;
  message: string;
  name?: string;
  unsubscribeUrl: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const site = (input.siteUrl || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
  const first = input.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const message = input.message.trim();
  const text =
    `${greeting}\n\n${message}\n\n` +
    `Get a fixed-price quote: ${site}/\n\n` +
    `My Airport Taxi NI · ${site}\n` +
    `You're receiving this because you opted in to marketing updates from My Airport Taxi NI. ` +
    `Unsubscribe: ${input.unsubscribeUrl}`;
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html =
    `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d2433;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">` +
    `<tr><td style="background:#0b1b33;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">My Airport Taxi NI</td></tr>` +
    `<tr><td style="padding:24px;font-size:15px;line-height:1.55;">` +
    `<p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>${paragraphs}` +
    `<p style="margin:22px 0 6px;"><a href="${escapeHtml(site)}/" style="display:inline-block;background:#2fbf4a;color:#0b1b33;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Get a fixed-price quote</a></p>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid #e6e9ee;font-size:12px;line-height:1.5;color:#6b7280;">` +
    `You're receiving this because you opted in to marketing updates from My Airport Taxi NI. ` +
    `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe</a>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { subject: input.subject.trim(), text, html };
}
