/**
 * Catch email typos before payment, so the customer gets their confirmation and the
 * owner can reach them. Real case (Oct 2026): "name@gmail.comEZY" — a flight code typed
 * into the email box; the payment failed and the customer could not be contacted.
 */

const BASIC = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Common providers and the domain each should be. */
const PROVIDERS: Record<string, string> = {
  gmail: "gmail.com",
  googlemail: "googlemail.com",
  hotmail: "hotmail.com",
  outlook: "outlook.com",
  live: "live.com",
  yahoo: "yahoo.com",
  icloud: "icloud.com",
  me: "me.com",
  aol: "aol.com",
  btinternet: "btinternet.com",
  sky: "sky.com",
  eircom: "eircom.net",
};

/** Typos of the provider name itself. */
const MISSPELT: Record<string, string> = {
  gmial: "gmail",
  gmai: "gmail",
  gamil: "gmail",
  gmaill: "gmail",
  gnail: "gmail",
  hotmial: "hotmail",
  hotmai: "hotmail",
  hotamil: "hotmail",
  outlok: "outlook",
  yahooo: "yahoo",
  icoud: "icloud",
  iclod: "icloud",
};

const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  comm: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  "co.uj": "co.uk",
  "co.ul": "co.uk",
  "couk": "co.uk",
};

/**
 * A corrected address when the domain looks like a known typo, e.g.
 * "x@gmail.comEZY" → "x@gmail.com", "x@gmial.com" → "x@gmail.com". Null when it looks fine.
 */
export function emailTypoSuggestion(value: string): string | null {
  const email = String(value ?? "").trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  const m = domain.match(/^([a-z0-9-]+)\.(.+)$/);
  if (!m) return null;
  const name = MISSPELT[m[1]!] ?? m[1]!;
  let rest = m[2]!;
  const known = PROVIDERS[name];

  if (known) {
    const expected = known.slice(name.length + 1); // "com", "net"
    // gmail.comEZY / gmail.com1 / gmail.comm → gmail.com (UK variants like hotmail.co.uk are fine).
    const fineVariants = new Set([expected, "co.uk", "ie", "fr", "de", "es", "it"]);
    if (!fineVariants.has(rest)) {
      if (rest.startsWith(expected) || TLD_TYPOS[rest] === expected || rest.startsWith("co.uk")) {
        rest = rest.startsWith("co.uk") ? "co.uk" : expected;
      } else if (TLD_TYPOS[rest]) {
        rest = TLD_TYPOS[rest]!;
      } else {
        return null;
      }
    }
    const fixed = `${local}@${name}.${rest}`;
    return fixed.toLowerCase() === email.toLowerCase() ? null : fixed;
  }

  // Any other domain: only obvious TLD slips (".con", ".comm").
  if (TLD_TYPOS[rest]) return `${local}@${m[1]}.${TLD_TYPOS[rest]}`;
  return null;
}

/** Null when the address is usable; otherwise a short message for the customer. */
export function emailAddressProblem(value: string): string | null {
  const email = String(value ?? "").trim();
  if (!email) return "Please enter your email address.";
  if (!BASIC.test(email)) return "Please enter a valid email address.";
  const suggestion = emailTypoSuggestion(email);
  if (suggestion) return `Please check your email address — did you mean ${suggestion}?`;
  return null;
}

export function isUsableEmailAddress(value: string): boolean {
  return emailAddressProblem(value) === null;
}
