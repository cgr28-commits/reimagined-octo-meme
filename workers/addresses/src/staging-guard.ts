/**
 * Payment staging Worker only (STAGING_ACCESS_KEY_SHA256 is set nowhere else).
 *
 * - Private: every page and API call needs the staging access cookie, which is set by opening
 *   the private link once (?access=<key>). Only the SHA-256 of the key is stored in config.
 *   Stripe's webhook is let through (Stripe signs it; the Worker verifies the signature).
 * - Never indexed: X-Robots-Tag on every response, a blocking robots.txt and a robots meta tag.
 * - Clearly labelled: a TEST MODE strip on every page and "[TEST]" at the start of each title.
 *
 * The live Worker never sets STAGING_ACCESS_KEY_SHA256, so none of this runs there.
 */
export type StagingGuardEnv = {
  STAGING_ACCESS_KEY_SHA256?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

const COOKIE = "matni_staging";
const ROBOTS = "noindex, nofollow, noarchive, nosnippet";
const innerRequests = new WeakSet<Request>();

export function stagingGuardActive(env: StagingGuardEnv): boolean {
  const active = Boolean(env.STAGING_ACCESS_KEY_SHA256?.trim());
  if (active) blockOutboundMessaging();
  return active;
}

/**
 * Staging must never contact customers, the business inbox or ad accounts. Every outbound call to
 * an email, WhatsApp/SMS or Google Ads service is answered locally with a "blocked" failure, so the
 * normal code paths run but nothing leaves the Worker. Stripe (sandbox) and address lookup are allowed.
 */
const BLOCKED_HOSTS = [
  "formsubmit.co",
  "api.web3forms.com",
  "api.resend.com",
  "graph.facebook.com",
  "waba-v2.360dialog.io",
  "waba.360dialog.io",
  "googleads.googleapis.com",
  "www.googleadservices.com",
  "api.twilio.com",
  "www.googleapis.com/calendar",
];
let messagingBlocked = false;
export const blockedOutbound: string[] = [];
function blockOutboundMessaging(): void {
  if (messagingBlocked) return;
  messagingBlocked = true;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const lower = target.toLowerCase();
    const hit = BLOCKED_HOSTS.find((h) => lower.startsWith(`https://${h}`) || lower.startsWith(`http://${h}`));
    if (hit) {
      blockedOutbound.push(hit);
      console.log(`[staging] blocked outbound message to ${hit}`);
      return new Response(JSON.stringify({ success: false, error: "Blocked on staging" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

/** True for the request the guard has already checked and handed to the normal Worker code. */
export function isStagingInnerRequest(request: Request): boolean {
  return innerRequests.has(request);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function lockedResponse(request: Request): Response {
  const wantsHtml = (request.headers.get("Accept") ?? "").includes("text/html");
  if (!wantsHtml) {
    return new Response(JSON.stringify({ error: "Private test site" }), {
      status: 401,
      headers: { "content-type": "application/json", "x-robots-tag": ROBOTS, "cache-control": "no-store" },
    });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="${ROBOTS}">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>[TEST] Private test site</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f7fa;color:#071c38;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border:1px solid #dde4ec;border-radius:16px;padding:28px 32px;max-width:420px;text-align:center}
b{display:inline-block;background:#b45309;color:#fff;border-radius:999px;padding:4px 12px;font-size:12px;letter-spacing:.08em}</style></head>
<body><main><b>TEST MODE</b><h1 style="font-size:22px">Private test site</h1>
<p>This is the My Airport Taxi NI staging site. Open it with the private link you were given.</p>
<p>The live website is <a href="https://www.myairporttaxini.co.uk">www.myairporttaxini.co.uk</a>.</p></main></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": ROBOTS, "cache-control": "no-store" },
  });
}

const BANNER_CSS = `<style id="matni-test-mode-css">
#matni-test-mode{position:fixed;top:0;left:0;right:0;z-index:2147483647;height:26px;display:flex;align-items:center;justify-content:center;gap:8px;
background:#b45309;color:#fff;font:700 12px/1 system-ui,sans-serif;letter-spacing:.06em;pointer-events:none;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px}
@media (max-width:640px){#matni-test-mode{font-size:10px;letter-spacing:.03em}}
html body{padding-top:26px!important}
header[data-site-header]{top:26px!important}
</style>`;
const BROWSER_BLOCK = `<script id="matni-test-mode-block">(function(){var bad=/formsubmit\\.co|web3forms\\.com|googleadservices\\.com|googletagmanager\\.com|google-analytics\\.com|doubleclick\\.net/i;
var f=window.fetch;window.fetch=function(u,o){try{var s=String(u&&u.url||u);if(bad.test(s))return Promise.resolve(new Response('{"success":false,"blocked":"staging"}',{status:503,headers:{"content-type":"application/json"}}));}catch(e){}return f.apply(this,arguments);};
if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return bad.test(String(u))?true:sb(u,d);};}
document.addEventListener("submit",function(e){var a=e.target&&e.target.action||"";if(bad.test(a))e.preventDefault();},true);
try{var live=/https:\\/\\/(?:www\\.)?myairporttaxini\\.co\\.uk\\/(pay|booking-confirmed|manage-booking)\\//g;[window.localStorage,window.sessionStorage].forEach(function(st){for(var i=0;i<st.length;i++){var k=st.key(i),v=st.getItem(k);if(v&&live.test(v)){live.lastIndex=0;st.setItem(k,v.replace(live,location.origin+"/$1/"));}live.lastIndex=0;}});}catch(e){}
var fs=HTMLFormElement.prototype.submit;HTMLFormElement.prototype.submit=function(){if(bad.test(this.action||""))return;return fs.call(this);};
var label="TEST MODE · staging site · Stripe sandbox only · no real bookings, payments or messages";
function ensure(){try{if(document.body&&!document.getElementById("matni-test-mode")){var b=document.createElement("div");b.id="matni-test-mode";b.setAttribute("role","note");b.textContent=label;document.body.prepend(b);}
if(document.title&&document.title.indexOf("[TEST]")!==0)document.title="[TEST] "+document.title;
var ms=document.querySelectorAll('meta[name="robots"]');for(var i=0;i<ms.length;i++){if(ms[i].getAttribute("content")!=="${ROBOTS}")ms[i].setAttribute("content","${ROBOTS}");}}catch(e){}}
document.addEventListener("DOMContentLoaded",ensure);window.addEventListener("load",ensure);setInterval(ensure,800);
var ce=Document.prototype.createElement;Document.prototype.createElement=function(t){var el=ce.apply(this,arguments);if(String(t).toLowerCase()==="script"){var d=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,"src");Object.defineProperty(el,"src",{get:function(){return d.get.call(el);},set:function(v){if(bad.test(String(v)))return;d.set.call(el,v);}});}return el;};
})();</script>`;
const BANNER_HTML = `<div id="matni-test-mode" role="note" aria-label="Test mode">TEST MODE · staging site · Stripe sandbox only · no real bookings, payments or messages</div>`;

const LIVE_LINK = /https:\/\/(?:www\.)?myairporttaxini\.co\.uk\/(pay|booking-confirmed|manage-booking)\//g;

async function decorate(response: Response, origin: string): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    // Payment links stored or built with the live address would open the live site, which
    // cannot load a sandbox session. Point them back at this staging site.
    const text = await response.text();
    const out = new Response(text.replace(LIVE_LINK, `${origin}/$1/`), response);
    out.headers.delete("content-length");
    out.headers.set("x-robots-tag", ROBOTS);
    return out;
  }
  const out = new Response(response.body, response);
  out.headers.set("x-robots-tag", ROBOTS);
  if (!type.includes("text/html")) return out;
  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.prepend(BROWSER_BLOCK, { html: true });
        el.append(`<meta name="robots" content="${ROBOTS}">${BANNER_CSS}`, { html: true });
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute("content", ROBOTS);
      },
    })
    .on("title", {
      text(chunk) {
        if (chunk.text && !chunk.text.startsWith("[TEST]")) chunk.replace(`[TEST] ${chunk.text}`);
      },
    })
    .on("body", {
      element(el) {
        el.prepend(BANNER_HTML, { html: true });
      },
    })
    .transform(out);
}

export async function stagingGuardFetch(
  request: Request,
  env: StagingGuardEnv,
  next: (request: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const expected = env.STAGING_ACCESS_KEY_SHA256!.trim().toLowerCase();

  if (url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain", "x-robots-tag": ROBOTS },
    });
  }

  const isStripeWebhook =
    request.method === "POST" &&
    (url.pathname === "/payments/stripe-webhook" || url.pathname === "/api/payments/stripe-webhook");

  if (!isStripeWebhook) {
    const fromLink = url.searchParams.get("access");
    if (fromLink !== null) {
      if ((await sha256Hex(fromLink)) !== expected) return lockedResponse(request);
      url.searchParams.delete("access");
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.pathname + (url.search || "") + url.hash,
          "Set-Cookie": `${COOKIE}=${encodeURIComponent(fromLink)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
          "x-robots-tag": ROBOTS,
          "cache-control": "no-store",
        },
      });
    }
    const cookie = cookieValue(request, COOKIE);
    if (!cookie || (await sha256Hex(cookie)) !== expected) return lockedResponse(request);
  }

  if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return decorate(asset, new URL(request.url).origin);
  }
  innerRequests.add(request);
  return decorate(await next(request), new URL(request.url).origin);
}
