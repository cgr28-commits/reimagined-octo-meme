/** Canonical business mailbox for My Airport Taxi NI — all site mail uses this. */
export const BUSINESS_MAILBOX = "bookings@myairporttaxini.co.uk";
export const BUSINESS_NAME = "My Airport Taxi NI";
export const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
/** Matches site brand tokens in globals.css (--color-navy / --color-emerald). */
export const BRAND_NAVY = "#071c38";
export const BRAND_EMERALD = "#2fbf4a";
export const BUSINESS_PHONE_DISPLAY = "07549 815538";
export const BUSINESS_PHONE_TEL = "+447549815538";
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

/** Number-free branded page that already hosts the website WhatsApp chat control. */
export function businessWhatsAppPublicPageUrl(siteUrl = BUSINESS_WEBSITE): string {
  return `${siteUrl.replace(/\/$/, "")}/contact/`;
}

/**
 * Original high-resolution PNG artwork for all email headers.
 * Compatible with Gmail, Outlook, and Apple Mail.
 * Public HTTPS URL — the file is not attached to the message.
 */
export const BUSINESS_EMAIL_LOGO_URL = `${BUSINESS_WEBSITE}/logo.png`;
export const BUSINESS_EMAIL_LOGO_ALT = "My Airport Taxi NI";
/** Display size. Original source artwork is 697×541, over 3× the default display width. */
export const BUSINESS_EMAIL_LOGO_WIDTH = 124;
export const BUSINESS_EMAIL_LOGO_HEIGHT = 96;

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
    if (tag === "img" && /\/(?:logo|google-business-logo)\.png(?:["?])/i.test(token)) {
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
  const logo = businessEmailLogoHtml(124).match(/<img\b[^>]*>/)![0];
  let result = header.replace(/<img\b[^>]*src="[^"]*\/(?:logo|google-business-logo)\.png"[^>]*>/gi, logo);
  let first = true;
  const source = result;
  result = result.replace(/<(td|div|p|h[1-6]|span|a)\b[^>]*>/gi, (tag, name: string, offset: number) => {
    const greenLabel = /color:\s*#2fbf4a/i.test(tag);
    const color = greenLabel ? "#2fbf4a" : "#ffffff";
    const properties: Record<string, string> = {
      color: color + " !important",
      "-webkit-text-fill-color": color + " !important",
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
      properties["font-size"] = "16px";
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
@media only screen and (max-width:480px) { .matni-customer-title { font-size:11px !important; } }
@media only screen and (max-width:360px) { .matni-customer-title { font-size:10px !important; } }
</style></head>`);
  }
  return result;
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
