/**
 * Premium typography pass for customer emails, so they match the website:
 * - Manrope for all text (falls back to Helvetica / Arial where web fonts are blocked, e.g. Gmail);
 * - prices in the site's price face (Cormorant Garamond, falling back to Georgia), with
 *   lining, tabular figures, as in the quote panel;
 * - buttons with the site's proportions: generous padding, 12px radius, bold 16px label;
 * - calmer reading rhythm (line height, paragraph spacing).
 *
 * Pure string transform on the final HTML. Text, links and layout are unchanged.
 * Idempotent (safe to run twice) via a marker in <head>.
 */

export const EMAIL_SANS_STACK = "'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif";
export const EMAIL_PRICE_STACK = "'Cormorant Garamond',Georgia,'Times New Roman',serif";

const MARKER = 'data-matni-email-polish="1"';
const FONT_LINK =
  `<link ${MARKER} href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" type="text/css" />` +
  `<style type="text/css">` +
  `body,table,td,p,a,span,div,li,strong,h1,h2,h3{font-family:${EMAIL_SANS_STACK};}` +
  `.matni-price{font-family:${EMAIL_PRICE_STACK} !important;}` +
  `</style>`;

const PRICE_RE = /£\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
const PRICE_ONLY_RE = /^£\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/;

const PRICE_STYLE =
  `font-family:${EMAIL_PRICE_STACK};font-weight:700;letter-spacing:-0.01em;` +
  `font-variant-numeric:lining-nums tabular-nums;`;

function addStyle(tag: string, css: string): string {
  if (/\bstyle="/i.test(tag)) return tag.replace(/\bstyle="([^"]*)"/i, (_m, s: string) => `style="${s.replace(/;?\s*$/, ";")}${css}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` style="${css}"${end}`);
}

function setProps(tag: string, props: Record<string, string>): string {
  let style = /\bstyle="([^"]*)"/i.exec(tag)?.[1] ?? "";
  for (const [prop, value] of Object.entries(props)) {
    style = style.replace(new RegExp(`(^|;)\\s*${prop}\\s*:[^;]*`, "gi"), "$1");
    style = `${style.replace(/;?\s*$/, ";")}${prop}:${value}`;
  }
  style = style.replace(/^;+/, "");
  return /\bstyle="/i.test(tag) ? tag.replace(/\bstyle="[^"]*"/i, `style="${style}"`) : tag.replace(/\s*>$/, ` style="${style}">`);
}

/** True for a link styled as a button (filled background). */
function isButton(tag: string): boolean {
  return /^<a\b/i.test(tag) && /background(?:-color)?\s*:\s*#(?:2fbf4a|3ebf55|1f9a36|071c38|0c2a52)/i.test(tag);
}

export function polishCustomerEmailHtml(html: string | undefined): string {
  if (!html) return html ?? "";
  if (html.includes(MARKER)) return html;
  let out = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${FONT_LINK}</head>`) : FONT_LINK + html;

  // Swap the old Arial stacks for Manrope everywhere (inline styles win over <style> in most clients).
  out = out.replace(/font-family\s*:\s*(?:'?Arial'?|Helvetica|'Helvetica Neue'|"Helvetica Neue")[^;"]*/gi, `font-family:${EMAIL_SANS_STACK}`);

  const parts = out.split(/(<[^>]+>)/);
  let skip = 0; // inside <head>/<style>/<title>/<script>
  let inLink = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    if (part.startsWith("<")) {
      const tag = /^<\/?\s*([a-z0-9]+)/i.exec(part)?.[1]?.toLowerCase() ?? "";
      const closing = /^<\//.test(part);
      if (tag === "head" || tag === "style" || tag === "title" || tag === "script") {
        skip += closing ? -1 : part.endsWith("/>") ? 0 : 1;
        continue;
      }
      if (tag === "a") inLink += closing ? -1 : 1;
      if (closing || skip > 0) continue;
      let next = part;
      if (isButton(next)) {
        // Site button proportions (.btn-primary): ~50px tall, 12px radius, bold 16px label.
        next = setProps(next, {
          display: "inline-block",
          padding: "16px 34px",
          "border-radius": "12px",
          "font-size": "16px",
          "font-weight": "700",
          "line-height": "1.2",
          "letter-spacing": "-0.01em",
          "text-decoration": "none",
          "mso-padding-alt": "0",
        });
      } else if (tag === "p") {
        const hasLineHeight = /line-height\s*:/i.test(next);
        if (!hasLineHeight) next = addStyle(next, "line-height:1.65;");
      } else if (tag === "body") {
        next = addStyle(next, `font-family:${EMAIL_SANS_STACK};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;`);
      }
      // A cell/heading whose whole text is a price becomes a price figure.
      const text = parts[i + 1] ?? "";
      if (inLink === 0 && /^(td|div|p|span|strong|h1|h2|h3)$/.test(tag) && PRICE_ONLY_RE.test(text.trim())) {
        next = addStyle(next, PRICE_STYLE);
        next = /class="/i.test(next) ? next.replace(/class="/i, 'class="matni-price ') : next.replace(/\s*>$/, ' class="matni-price">');
        parts[i] = next;
        i += 1; // leave the price text itself as-is
        continue;
      }
      parts[i] = next;
      continue;
    }
    if (skip > 0 || inLink > 0) continue;
    // Prices inside sentences: price face, a touch larger so the figure reads like the site.
    if (PRICE_RE.test(part)) {
      PRICE_RE.lastIndex = 0;
      parts[i] = part.replace(
        PRICE_RE,
        (m) => `<span class="matni-price" style="${PRICE_STYLE}font-size:1.14em;">${m}</span>`,
      );
    }
    PRICE_RE.lastIndex = 0;
  }
  return parts.join("");
}
