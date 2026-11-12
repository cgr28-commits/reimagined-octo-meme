/** Owner push notifications. Run: npx tsx scripts/check-owner-push.ts */
import assert from "node:assert/strict";
import {
  b64urlDecode,
  b64urlEncode,
  encryptPushPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  vapidAuthorization,
} from "../workers/addresses/src/web-push";
import { handleOwnerPushRequest, notifyOwnerPush, pushNoticeForInboundEmail } from "../workers/addresses/src/owner-push";

const enc = new TextEncoder();
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

/** A browser's side of RFC 8291: decrypt what the Worker produced. */
async function makeDevice() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const keys = { p256dh: b64urlEncode(pub), auth: b64urlEncode(auth) };
  const decrypt = async (body: Uint8Array) => {
    const salt = body.slice(0, 16);
    const idlen = body[20]!;
    const serverPub = body.slice(21, 21 + idlen);
    const ciphertext = body.slice(21 + idlen);
    const serverKey = await crypto.subtle.importKey("raw", serverPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, pair.privateKey, 256));
    const ikm = await hkdf(auth, shared, cat(enc.encode("WebPush: info\0"), pub, serverPub), 32);
    const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext));
    assert.equal(plain[plain.length - 1], 2, "final-record delimiter");
    return new TextDecoder().decode(plain.slice(0, -1));
  };
  return { keys, decrypt };
}

function kv() {
  const map = new Map<string, string>();
  return { map, get: async (k: string) => map.get(k) ?? null, put: async (k: string, v: string) => void map.set(k, v), delete: async (k: string) => void map.delete(k) } as any;
}

async function main() {
  // Encryption round trip.
  const device = await makeDevice();
  const body = await encryptPushPayload(JSON.stringify({ title: "New paid booking", body: "Sarah — £45" }), device.keys);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 16, 0], "record size 4096");
  assert.equal(body[20], 65);
  assert.equal(JSON.parse(await device.decrypt(body)).title, "New paid booking");

  // VAPID header: valid ES256 JWT for the push service origin.
  const vapid = await generateVapidKeys();
  assert.equal(b64urlDecode(vapid.publicKey).length, 65);
  const auth = await vapidAuthorization("https://web.push.apple.com/abc123", vapid, "mailto:bookings@myairporttaxini.co.uk");
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth)!;
  assert.equal(k, vapid.publicKey);
  const [h, c, sig] = token!.split(".");
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c!)));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600 + 5);
  const pubKey = await crypto.subtle.importKey("raw", b64urlDecode(vapid.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, b64urlDecode(sig!), enc.encode(`${h}.${c}`)), true);

  // Endpoints: only real push services.
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/QGx"), true);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x"), true);
  assert.equal(isAllowedPushEndpoint("https://evil.example.com/push"), false);
  assert.equal(isAllowedPushEndpoint("http://web.push.apple.com/x"), false);
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com.evil.com/x"), false);

  // Which emails alert the phone.
  const n = (from: string, subject: string, fromName?: string) => pushNoticeForInboundEmail({ from, fromName, subject, text: "Hello there" });
  const own = "bookings@myairporttaxini.co.uk";
  assert.equal(n(own, "Paid booking — Sarah Jones — £45.00")?.category, "bookings");
  assert.equal(n(own, "Paid booking — CASH DUE £30 — Sarah")?.title, "New paid booking");
  assert.equal(n(own, "WhatsApp: Kiarash wants to speak to you")?.category, "messages");
  assert.equal(n(own, "Booking Cancellation Confirmed – MAT-5452")?.category, "cancellations");
  assert.equal(n(own, "REFUND FAILED — Sarah — MAT-1")?.category, "payments");
  assert.equal(n(own, "Card payment unsuccessful — Leigh — £53")?.category, "payments");
  assert.equal(n(own, "Short-notice request — needs your decision")?.category, "requests");
  assert.equal(n("sarah@example.com", "Question about my booking", "Sarah Jones")?.title, "Email from Sarah Jones");
  assert.equal(n("alerts@fonio.ai", "New phone call (fonio) - check for booking request")?.category, "calls");
  for (const quiet of ["Quote viewed — £53 — Belfast International Airport", "Quote saved — £294.00 — x", "My Airport Taxi NI — Daily Quote Report — 11 November 2026", "Updated Booking Confirmation - MAT-5452", "Customer details captured — payment started — £45"]) {
    assert.equal(n(own, quiet), null, quiet);
  }
  assert.equal(n("no-reply@titan.email", "Titan confirmation code"), null);

  // Handlers.
  const store = kv();
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: "owner-key", DRIVER_ACCESS_KEY: "driver-key" } as any;
  const call = async (method: string, path: string, data?: unknown, key = "owner-key", fetchImpl?: typeof fetch) => {
    const res = await handleOwnerPushRequest(
      new Request(`https://w.test${path}`, { method, headers: { "content-type": "application/json", "X-Owner-Key": key }, body: data ? JSON.stringify(data) : undefined }),
      env, null, fetchImpl,
    );
    return res ? { status: res.status, body: (await res.json()) as any } : null;
  };
  assert.equal(await call("GET", "/owner/inbox"), null, "not a push route");
  assert.equal((await call("GET", "/owner/push", undefined, "wrong"))!.status, 401);
  const st = (await call("GET", "/owner/push"))!;
  assert.equal(st.status, 200);
  assert.equal(b64urlDecode(st.body.publicKey).length, 65);
  assert.equal(st.body.devices.length, 0);
  assert.equal((await call("GET", "/owner/push"))!.body.publicKey, st.body.publicKey, "stable key");
  assert.ok(!JSON.stringify(st.body).includes('"d"'), "private key never returned");

  assert.equal((await call("POST", "/owner/push/subscribe", { subscription: { endpoint: "https://evil.example.com/x", keys: device.keys } }))!.status, 400);
  const endpoint = "https://web.push.apple.com/device-1-abcdefghijklmnop";
  const sub = (await call("POST", "/owner/push/subscribe", { subscription: { endpoint, keys: device.keys }, label: "Colin's iPhone" }))!;
  assert.equal(sub.status, 200);
  assert.equal(sub.body.devices.length, 1);
  assert.ok(!JSON.stringify(sub.body).includes(endpoint), "full endpoint never returned");
  await call("POST", "/owner/push/subscribe", { subscription: { endpoint, keys: device.keys }, label: "Colin's iPhone" });
  assert.equal((await call("GET", "/owner/push"))!.body.devices.length, 1, "same device not duplicated");

  // Sending: encrypted for the device, correct headers, prefs respected, dead devices removed.
  const sent: { url: string; init: RequestInit }[] = [];
  let status = 201;
  const fakeFetch = (async (url: string, init: RequestInit) => { sent.push({ url, init }); return new Response(null, { status }); }) as unknown as typeof fetch;
  let r = await notifyOwnerPush(env, n(own, "Paid booking — Sarah Jones — £45.00")!, fakeFetch);
  assert.deepEqual(r, { sent: 1, removed: 0 });
  assert.equal(sent[0]!.url, endpoint);
  const headers = sent[0]!.init.headers as Record<string, string>;
  assert.equal(headers["Content-Encoding"], "aes128gcm");
  assert.match(headers.Authorization!, /^vapid t=/);
  const payload = JSON.parse(await device.decrypt(sent[0]!.init.body as Uint8Array));
  assert.equal(payload.title, "New paid booking");
  assert.equal(payload.url, "/owner/?ui=mobile#bookings");

  assert.equal((await call("POST", "/owner/push/prefs", { prefs: { bookings: false, bogus: true } }))!.body.prefs.bookings, false);
  r = await notifyOwnerPush(env, n(own, "Paid booking — x — £1")!, fakeFetch);
  assert.equal(r.sent, 0, "category switched off");
  const test = (await call("POST", "/owner/push/test", {}, "owner-key", fakeFetch))!;
  assert.equal(test.body.sent, 1, "test ignores prefs");

  status = 410;
  r = await notifyOwnerPush(env, n("sarah@example.com", "Hi")!, fakeFetch);
  assert.deepEqual(r, { sent: 0, removed: 1 });
  assert.equal((await call("GET", "/owner/push"))!.body.devices.length, 0);

  // A push failure never throws.
  await call("POST", "/owner/push/subscribe", { subscription: { endpoint, keys: device.keys } });
  const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
  assert.deepEqual(await notifyOwnerPush(env, n("sarah@example.com", "Hi")!, boom), { sent: 0, removed: 0 });
  const gone = (await call("POST", "/owner/push/unsubscribe", { endpointId: endpoint.slice(-16) }))!;
  assert.equal(gone.body.devices.length, 0);

  console.log("check-owner-push: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
