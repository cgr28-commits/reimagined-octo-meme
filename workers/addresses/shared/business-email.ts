/** Canonical business mailbox for My Airport Taxi NI — all site mail uses this. */
export const BUSINESS_MAILBOX = "bookings@myairporttaxini.co.uk";
export const BUSINESS_NAME = "My Airport Taxi NI";
export const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
/** Matches site brand tokens in globals.css (--color-navy / --color-emerald). */
export const BRAND_NAVY = "#071c38";
export const BRAND_EMERALD = "#2fbf4a";
export const BUSINESS_PHONE_DISPLAY = "07549 815538";
export const BUSINESS_PHONE_TEL = "+447549815538";
/** Office landline, shown alongside the mobile in customer emails. */
export const BUSINESS_LANDLINE_DISPLAY = "028 9602 2952";
export const BUSINESS_LANDLINE_TEL = "+442896022952";
/** Same digits as website SITE.whatsapp — never show this number in customer email copy. */
export const BUSINESS_WHATSAPP_DIGITS = "447549815538";
export const BUSINESS_WHATSAPP_USERNAME = "belfasttaxi";
export const BUSINESS_WHATSAPP_DEFAULT_MESSAGE = "Hi, I'd like some help.";

/** Canonical website click-to-chat URL (number is in the href only, never as visible copy). */
export function businessWhatsAppChatUrl(
  message = BUSINESS_WHATSAPP_DEFAULT_MESSAGE,
): string {
  return `https://wa.me/${BUSINESS_WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
}

/**
 * Number-free WhatsApp route for plain-text emails (owner request, 11 Nov 2026: the landline
 * is the only number customers see; WhatsApp is offered as a link, never as a number).
 */
export const BUSINESS_WHATSAPP_TEXT_ROUTE = "@belfasttaxi";

/** Number-free branded page that already hosts the website WhatsApp chat control. */
export function businessWhatsAppPublicPageUrl(siteUrl = BUSINESS_WEBSITE): string {
  return `${siteUrl.replace(/\/$/, "")}/contact/`;
}

/**
 * Current side-by-side brand logo (white wordmark for the navy email header), as PNG so
 * Gmail, Outlook and Apple Mail all show it (owner, 13 Nov 2026; replaced the stacked logo.png).
 * Public HTTPS URL — the file is not attached to the message.
 */
export const BUSINESS_EMAIL_LOGO_URL = `${BUSINESS_WEBSITE}/logo-email-wide.png`;
export const BUSINESS_EMAIL_LOGO_ALT = "My Airport Taxi NI";
/** Display size. Source artwork is 600×105, over 2.5× the display width for sharp retina screens. */
export const BUSINESS_EMAIL_LOGO_WIDTH = 228;
export const BUSINESS_EMAIL_LOGO_HEIGHT = 40;

/** Accepted card / wallet marks for payment-link emails (PNG — email clients don't show SVG). */
export const BUSINESS_EMAIL_PAYMENT_METHODS_URL = `${BUSINESS_WEBSITE}/email/payment-methods.png`;
export const BUSINESS_EMAIL_PAYMENT_METHODS_ALT = "Visa, Mastercard, American Express, Apple Pay, Google Pay";

export const BUSINESS_EMAIL_PAYMENT_CARDS_URL = `${BUSINESS_WEBSITE}/email/payment-cards.png`;

/**
 * Card (and, where the payment page offers them, wallet) logos + a "Secure card payment"
 * line, placed straight under a pay button. Pass wallets: false for links whose payment
 * page doesn't offer Apple Pay / Google Pay.
 */
export function paymentMethodsEmailHtml(options: { wallets?: boolean } = {}): string {
  const wallets = options.wallets !== false;
  const src = wallets ? BUSINESS_EMAIL_PAYMENT_METHODS_URL : BUSINESS_EMAIL_PAYMENT_CARDS_URL;
  const alt = wallets ? BUSINESS_EMAIL_PAYMENT_METHODS_ALT : "Visa, Mastercard, American Express";
  const width = wallets ? 248 : 147;
  return `<br /><img src="${src}" alt="${alt}" width="${width}" height="32" border="0" style="display:inline-block;margin:14px auto 0;width:${width}px;max-width:100%;height:auto;border:0;outline:none;" /><br /><span style="display:inline-block;margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:normal;color:#64748b;">&#128274; Secure card payment</span>`;
}

/**
 * Asks clients that honour it to keep our navy header instead of inverting the logo.
 */
export function businessEmailClientMeta(): string {
  return `<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<style type="text/css">
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .matni-header, .matni-logo { background-color: #071c38 !important; }
  @media (prefers-color-scheme: dark) {
    .matni-header, .matni-logo { background-color: #071c38 !important; }
  }
</style>`;
}

/**
 * Shared customer-email header mark. One logo, linked to the website.
 * Alt text is the company name, which clients show when images are blocked.
 */
export function businessEmailLogoHtml(width = BUSINESS_EMAIL_LOGO_WIDTH, logoUrl = BUSINESS_EMAIL_LOGO_URL): string {
  const height = Math.round(width * BUSINESS_EMAIL_LOGO_HEIGHT / BUSINESS_EMAIL_LOGO_WIDTH);
  return `<a href="${BUSINESS_WEBSITE}/" style="text-decoration:none;display:inline-block;">
<img class="matni-logo" src="${logoUrl}" alt="${BUSINESS_EMAIL_LOGO_ALT}" width="${width}" height="${height}" border="0" bgcolor="#071c38" style="display:block;margin:0 auto;width:${width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;background-color:#071c38;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;" />
</a>`;
}

type EmailHeaderRange = { start: number; end: number };

/** Locate only the logo's header cell/div, never its containing booking table. */
function emailHeaderRanges(html: string): EmailHeaderRange[] {
  type Node = { tag: string; start: number; end?: number; opening: string; parent?: Node };
  const stack: Node[] = [];
  const headers = new Set<Node>();
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const token = match[0];
    const start = match.index!;
    if (token.startsWith("</")) {
      const index = stack.map(node => node.tag).lastIndexOf(tag);
      if (index >= 0) {
        for (const node of stack.splice(index)) node.end = start + token.length;
      }
      continue;
    }
    if (tag === "img" && /\/(?:logo|logo-email-wide|google-business-logo)\.png(?:["?])/i.test(token)) {
      const header = [...stack].reverse().find(node =>
        node.tag === "td" || (node.tag === "div" && /\bmatni-header\b/.test(node.opening)));
      if (header) headers.add(header);
    }
    if (!["img", "br", "meta", "link", "hr", "input", "source", "wbr"].includes(tag) && !token.endsWith("/>")) {
      stack.push({ tag, start, opening: token, parent: stack.at(-1) });
    }
  }
  return [...headers].filter(node => node.end != null)
    .map(node => ({ start: node.start, end: node.end! })).sort((a, b) => a.start - b.start);
}

function setHeaderStyle(tag: string, properties: Record<string, string>): string {
  let style = /\bstyle="([^"]*)"/i.exec(tag)?.[1] ?? "";
  for (const [property, value] of Object.entries(properties)) {
    style = style.replace(new RegExp("(^|;)\\s*" + property + "\\s*:[^;]*", "gi"), "$1");
    style += ";" + property + ":" + value;
  }
  return /\bstyle="/i.test(tag)
    ? tag.replace(/\bstyle="[^"]*"/i, `style="${style}"`)
    : tag.replace(/>$/, ` style="${style}">`);
}

function customerHeaderBlock(header: string): string {
  if (header.includes('data-matni-customer-header="true"')) return header;
  // The linked original artwork is over five times its 124px display width.
  const logo = businessEmailLogoHtml().match(/<img\b[^>]*>/)![0];
  let result = header.replace(/<img\b[^>]*src="[^"]*\/(?:logo|logo-email-wide|google-business-logo)\.png"[^>]*>/gi, logo);
  // The logo already says the business name: drop a separate "My Airport Taxi NI" label line.
  result = result.replace(/<(div|p|span)\b[^>]*>\s*My Airport Taxi NI\s*<\/\1>/gi, "");
  let first = true;
  const source = result;
  result = result.replace(/<(td|div|p|h[1-6]|span|a)\b[^>]*>/gi, (tag, name: string, offset: number) => {
    const greenLabel = /color:\s*#2fbf4a/i.test(tag);
    const color = greenLabel ? "#2fbf4a" : "#ffffff";
    const properties: Record<string, string> = {
      color: color + " !important",
      "-webkit-text-fill-color": color + " !important",
      // One house style: logo and heading centred in the navy header (owner, 13 Nov 2026).
      "text-align": "center !important",
    };
    if (first) {
      first = false;
      properties["background"] = "#071c38 !important";
      properties["background-color"] = "#071c38 !important";
      tag = tag.replace(/\s(?:bgcolor|data-matni-customer-header)="[^"]*"/gi, "").replace(/>$/, ' bgcolor="#071c38" data-matni-customer-header="true">');
    } else if (name === "div") {
      const originalBackground = /(?:^|;)\s*background(?:-color)?:([^;"]+)/i.exec(tag)?.[1]?.trim();
      properties["background-color"] = (originalBackground ?? "#071c38").replace(/!important/gi, "").trim() + " !important";
    }
    const font = /font-size:\s*(\d+)px/i.exec(tag)?.[1];
    const nextText = source.slice(offset + tag.length).split("<", 1)[0].trim();
    if (font && Number(font) >= 20 && /^(div|p|h[1-6])$/i.test(name) && !/^[£€$]\d/.test(nextText)) {
      properties["font-size"] = "18px";
      tag = /\bmatni-customer-title\b/.test(tag) ? tag : /class="/.test(tag)
        ? tag.replace(/class="/, 'class="matni-customer-title ')
        : tag.replace(/>$/, ' class="matni-customer-title">');
    }
    return setHeaderStyle(tag, properties);
  });
  return result;
}

/** Replace header markup only; everything outside those ranges stays byte-for-byte intact. */
export function customerEmailHeaderHtml(html: string, originalHtml = html): string {
  const ranges = emailHeaderRanges(html);
  const originals = emailHeaderRanges(originalHtml);
  if (!ranges.length || ranges.length !== originals.length) return html;
  let result = html;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    const original = originals[i];
    result = result.slice(0, range.start) +
      customerHeaderBlock(originalHtml.slice(original.start, original.end)) +
      result.slice(range.end);
  }
  if (!result.includes('id="matni-customer-header-style"')) {
    result = result.replace(/<\/head>/i, `<style id="matni-customer-header-style" type="text/css">
@media only screen and (max-width:480px) { .matni-customer-title { font-size:16px !important; } }
@media only screen and (max-width:360px) { .matni-customer-title { font-size:15px !important; } }
</style></head>`);
  }
  return brandFrameEmailHtml(result);
}

const BRAND_FRAME_STYLE_ID = "matni-brand-frame-style";

/** The one footer every customer email ends with: site navy, white name, green contact links. */
export function standardEmailFooterHtml(contacts: { phone?: boolean; email?: boolean; whatsApp?: boolean } = { phone: true, email: true, whatsApp: true }): string {
  const link = (href: string, label: string) =>
    `<a href="${href}" style="color:${BRAND_EMERALD};-webkit-text-fill-color:${BRAND_EMERALD};text-decoration:none;font-weight:bold;">${label}</a>`;
  const dot = `<span style="color:#8fa3bd;-webkit-text-fill-color:#8fa3bd;">&nbsp;· </span>`;
  return `<tr><td class="matni-footer matni-frame" bgcolor="${BRAND_NAVY}" align="center" style="background-color:${BRAND_NAVY};padding:22px 24px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#ffffff;">
<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#ffffff;-webkit-text-fill-color:#ffffff;">${BUSINESS_NAME}</p>
<p style="margin:0 0 10px;color:#ffffff;-webkit-text-fill-color:#ffffff;">${[
    link(`${BUSINESS_WEBSITE}/`, "myairporttaxini.co.uk"),
    contacts.phone ? link(`tel:${BUSINESS_LANDLINE_TEL}`, `Call&nbsp;${BUSINESS_LANDLINE_DISPLAY.replace(/ /g, "&nbsp;")}`) : "",
    contacts.whatsApp ? link(businessWhatsAppChatUrl(), `WhatsApp&nbsp;${BUSINESS_WHATSAPP_TEXT_ROUTE}`) : "",
    contacts.email ? link(`mailto:${BUSINESS_MAILBOX}`, BUSINESS_MAILBOX) : "",
  ].filter(Boolean).join(dot)}</p>
<p style="margin:0;font-size:11px;color:#c9d4e2;-webkit-text-fill-color:#c9d4e2;">Fixed-price airport transfers across Northern Ireland and Ireland${dot}${link(`${BUSINESS_WEBSITE}/terms/`, "Terms")}${dot}${link(`${BUSINESS_WEBSITE}/privacy/`, "Privacy")}</p>
</td></tr>`;
}

/**
 * Swap the card's own sign-off row ("My Airport Taxi NI" + contact links) for the standard
 * footer, or add the standard footer when the email has none. Only a simple row (no nested
 * table) is replaced.
 */
function standardFooterEmailHtml(html: string): string {
  if (html.includes("matni-footer")) return html;
  // The footer offers only the contact routes the email itself already gives (reminders, for
  // example, deliberately leave out the office phone or mailbox).
  const contacts = {
    phone: /href="tel:/i.test(html),
    email: html.includes(BUSINESS_MAILBOX),
    whatsApp: /wa\.me\/|@belfasttaxi/i.test(html),
  };
  // The old one-line tagline is part of the standard footer now.
  html = html
    .replace(/<tr\b[^>]*>\s*<td\b[^>]*>\s*Premium airport transfers across Northern Ireland[^<]*<\/td>\s*<\/tr>/gi, "")
    .replace(/<p\b[^>]*>\s*Premium airport transfers across Northern Ireland[^<]*<\/p>/gi, "");
  const footer = standardEmailFooterHtml(contacts);
  const rows = [...html.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>/gi)];
  for (let i = rows.length - 1; i >= 0; i--) {
    const start = rows[i].index!;
    const end = html.indexOf("</tr>", start);
    if (end < 0) continue;
    const row = html.slice(start, end + 5);
    if (/<table\b/i.test(row)) continue;
    const text = row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/^My Airport Taxi NI\b/.test(text) && /Questions\?/.test(text)) break; // keep its help row; add the footer below
    if (/^My Airport Taxi NI\b/.test(text) && text.length < 420 && /myairporttaxini\.co\.uk/.test(text)) {
      return html.slice(0, start) + footer + html.slice(end + 5);
    }
    if (/^My Airport Taxi NI$/.test(text)) return html.slice(0, start) + footer + html.slice(end + 5);
  }
  // No sign-off row: add the footer as the card's last row (the card closes just before the outer table).
  const closes = [...html.matchAll(/<\/table>/gi)];
  if (closes.length < 2) return html;
  const cardClose = closes[closes.length - 2].index!;
  return html.slice(0, cardClose) + footer + html.slice(cardClose);
}

/**
 * House style for every customer email (owner, 13 Nov 2026): the site's three colours — the page
 * around the email is site navy, the email itself a white card, buttons and labels site green — with
 * the logo always on navy (the header). Recolours only the outer page (body, the full-width outer
 * table and its first cell); the card and everything inside it are untouched. Idempotent.
 */
export function brandFrameEmailHtml(html: string): string {
  const bodyAt = html.search(/<body\b/i);
  if (bodyAt < 0) return html;
  const wanted = ["body", "table", "td"];
  let index = 0;
  const head = html.slice(0, bodyAt);
  let cardFollows = false;
  const rest = html.slice(bodyAt).replace(/<(body|table|td)\b[^>]*>/gi, (tag, name: string, offset: number, whole: string) => {
    if (index >= wanted.length || name.toLowerCase() !== wanted[index]) return tag;
    // Only the classic layout is framed: an outer cell that holds the email card table.
    if (index === 2) cardFollows = /^\s*<table\b/i.test(whole.slice(offset + tag.length));
    index += 1;
    let next = tag
      .replace(/\sbgcolor="[^"]*"/gi, "")
      .replace(/style="([^"]*)"/i, (_attribute: string, style: string) =>
        `style="${style.replace(/(^|;)\s*background(?:-color|-image)?\s*:[^;]*/gi, "$1")};background-color:${BRAND_NAVY};background-image:linear-gradient(${BRAND_NAVY},${BRAND_NAVY});"`);
    if (!/style="/i.test(next)) next = next.replace(/>$/, ` style="background-color:${BRAND_NAVY};">`);
    if (!/matni-frame/.test(next)) {
      next = /class="/i.test(next)
        ? next.replace(/class="([^"]*)"/i, 'class="$1 matni-frame"')
        : next.replace(/>$/, ' class="matni-frame">');
    }
    return next.replace(/>$/, ` bgcolor="${BRAND_NAVY}">`);
  });
  if (index < wanted.length || !cardFollows) return html;
  const withFooter = standardFooterEmailHtml(head + rest);
  const style = `<style id="${BRAND_FRAME_STYLE_ID}" type="text/css">
  .matni-footer, .matni-footer td { background-color: ${BRAND_NAVY} !important; }
  .matni-footer, .matni-footer p, .matni-footer div, .matni-footer span, .matni-footer strong,
  .matni-footer.matni-footer p, .matni-footer.matni-footer span, .matni-footer.matni-footer strong { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
  .matni-footer a, .matni-footer.matni-footer a { color: ${BRAND_EMERALD} !important; -webkit-text-fill-color: ${BRAND_EMERALD} !important; background-color: transparent !important; }
  .matni-frame, .matni-frame.matni-frame, body.matni-frame, table.matni-frame, td.matni-frame { background-color: ${BRAND_NAVY} !important; background-image: linear-gradient(${BRAND_NAVY},${BRAND_NAVY}) !important; }
  @media (prefers-color-scheme: dark) { .matni-frame, table.matni-frame, td.matni-frame { background-color: ${BRAND_NAVY} !important; } }
</style>`;
  const framed = withFooter;
  if (framed.includes(BRAND_FRAME_STYLE_ID)) return framed;
  return /<\/head>/i.test(framed) ? framed.replace(/<\/head>/i, `${style}</head>`) : framed.replace(/<body\b/i, `${style}<body`);
}

/** Always bookings@ — ignore env overrides that point elsewhere. */
export function businessMailbox(_candidate?: string | null): string {
  return BUSINESS_MAILBOX;
}

export function isBusinessMailbox(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === BUSINESS_MAILBOX;
}

/**
 * Force SumUp browser returns for /booking-confirmed/ onto the canonical www host.
 * Apex myairporttaxini.co.uk does not serve this route (404).
 */
export function canonicalizeBookingConfirmedRedirectUrl(redirectUrl: string): string {
  const trimmed = redirectUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath !== "/booking-confirmed") {
      return trimmed;
    }
    const canonical = new URL("/booking-confirmed/", `${BUSINESS_WEBSITE}/`);
    parsed.searchParams.forEach((value, key) => {
      canonical.searchParams.set(key, value);
    });
    if (parsed.hash) {
      canonical.hash = parsed.hash;
    }
    return canonical.toString();
  } catch {
    return trimmed;
  }
}

/**
 * White/navy customer email theme. Opt-in only: paid invoice HTML keeps its
 * existing theme. Inline colours support clients that strip head styles.
 */
export function lightCustomerEmailHtml(html: string): string {
  const meta = `<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<style type="text/css">
  :root { color-scheme: light; supported-color-schemes: light; }
  .matni-light { background-color: #ffffff !important; color: #071c38 !important; }
  @media (prefers-color-scheme: dark) {
    .matni-light, .matni-light table, .matni-light td, .matni-light div {
      background-color: #ffffff !important;
    }
    .matni-light, .matni-light p, .matni-light div, .matni-light td,
    .matni-light a, .matni-light span, .matni-light strong,
    .matni-light h1, .matni-light h2, .matni-light h3, .matni-light li {
      color: #071c38 !important; -webkit-text-fill-color: #071c38 !important;
    }
  }
</style>`;
  const themed = html
    .replace(businessEmailClientMeta(), meta)
    .replace(/<(body|table|td|div|p|h[1-6]|span|li|ul|ol|strong|a)\b[^>]*>/gi, (tag, name: string) => {
      const container = /^(body|table|td|div)$/i.test(name);
      let next = tag.replace(/style="([^"]*)"/i, (_attribute: string, style: string) => {
        const clean = style
          .replace(/(^|;)\s*color\s*:[^;]*/gi, "$1")
          .replace(name.toLowerCase() === "a" ? /(^|;)\s*background(?:-color)?\s*:[^;]*/gi : /$^/g, "$1background-color:#2fbf4a")
          .replace(container ? /(^|;)\s*background(?:-color|-image)?\s*:[^;]*/gi : /$^/g, "$1");
        return `style="${clean};color:#071c38;-webkit-text-fill-color:#071c38;${container ? "background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);" : ""}"`;
      });
      if (!/style="/i.test(next)) {
        next = next.replace(/>$/, ` style="color:#071c38;-webkit-text-fill-color:#071c38;${container ? "background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);" : ""}">`);
      }
      if (container) {
        next = next.replace(/\sbgcolor="[^"]*"/gi, "");
        next = next.replace(/>$/, ' bgcolor="#ffffff">');
      }
      if (name.toLowerCase() === "body") next = next.replace("<body", '<body class="matni-light"');
      return next;
    });
  return customerEmailHeaderHtml(themed, html);
}
