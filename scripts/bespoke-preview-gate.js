/**
 * Private-link gate for the bespoke preview website (Cloudflare Pages "_worker.js").
 * Copied into the built site by .github/workflows/deploy-bespoke-preview.yml only.
 * It is never part of the live GitHub Pages site.
 *
 * How it works: the owner opens the private link once (…/?k=<access code>). The code
 * is checked against the SHA-256 below, a cookie is set, and the code is removed from
 * the address bar. Without the cookie every page answers "Private preview".
 * Only the hash is stored here; the access code itself is not in the repository.
 */
const ACCESS_CODE_SHA256 = "b984499b56acd05ed31e2b9c70287ecc8fd5ae5b99cfa932b172d97f0e46ab96";
const COOKIE = "matni_preview";
const PREVIEW_CSP = [
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://js.stripe.com",
  "connect-src 'self' https://*.my-airport-taxi-ni-staging.workers.dev https://challenges.cloudflare.com https://api.stripe.com",
].join("; ");
const MAX_AGE = 60 * 60 * 24 * 30;

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function matches(code) {
  if (!code || code.length > 200) return false;
  const actual = await sha256Hex(code);
  // Constant-time compare of two equal-length hex strings.
  let diff = actual.length ^ ACCESS_CODE_SHA256.length;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ ACCESS_CODE_SHA256.charCodeAt(i % ACCESS_CODE_SHA256.length);
  return diff === 0;
}

function cookieValue(request) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function denied() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private preview</title><body style="font:16px system-ui;margin:3rem auto;max-width:28rem;padding:0 1rem;color:#071c38"><h1 style="font-size:1.4rem">Private preview</h1><p>This is a private test site. Please open the private link you were given.</p></body>',
    { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const offered = url.searchParams.get("k");
    if (offered) {
      if (!(await matches(offered))) return denied();
      url.searchParams.delete("k");
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.pathname + url.search,
          "Set-Cookie": `${COOKIE}=${encodeURIComponent(offered)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (!(await matches(cookieValue(request)))) return denied();
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "private, no-cache");
    // Test site: no advertising or analytics tags may load or report from here.
    // Scripts and data calls are limited to this site, the staging-account Worker,
    // Cloudflare's bot check and Stripe.
    if ((headers.get("Content-Type") || "").includes("text/html")) headers.set("Content-Security-Policy", PREVIEW_CSP);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
