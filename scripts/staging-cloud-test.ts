/**
 * Stage 1 and Stage 2 end-to-end tests against the deployed, isolated staging Worker (real Cloudflare D1).
 * Run by deploy-dashboard-staging.yml. Needs STAGING_URL and STAGING_OWNER_KEY.
 * Refuses to run against anything but the dashboard staging Worker.
 */
const BASE = (process.env.STAGING_URL || "").replace(/\/+$/, "");
const KEY = process.env.STAGING_OWNER_KEY || "";
if (!/^https:\/\/matni-dashboard-staging\.[a-z0-9-]+\.workers\.dev$/.test(BASE)) {
  console.error("Refusing to run: STAGING_URL is not the dashboard staging Worker.");
  process.exit(1);
}
if (!KEY) {
  console.error("STAGING_OWNER_KEY missing.");
  process.exit(1);
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

type Res = { status: number; body: Record<string, any> };
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}
const owner = { "X-Owner-Key": KEY };
const drv = (t: string) => ({ "X-Driver-Account-Session": t });
const stamp = Date.now();
const email = `cloud-test-${stamp}@example.com`;
const inYears = (n: number) => `${new Date().getUTCFullYear() + n}-06-30`;

/**
 * A freshly set Worker secret takes a short while to reach every Cloudflare location.
 * Wait until the owner key is accepted 10 times in a row before testing.
 */
async function waitForOwnerKey(): Promise<void> {
  let streak = 0;
  for (let i = 0; i < 120 && streak < 10; i++) {
    const r = await call("GET", "/owner/driver-accounts", undefined, owner);
    streak = r.status === 200 ? streak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (streak < 10) throw new Error("Staging owner key was not accepted consistently after 4 minutes.");
  console.log("Staging owner key active everywhere; starting tests.");
}

async function main() {
  await waitForOwnerKey();
  let driverId = "";
  let invite = "";
  let session = "";

  await check("Outbound sandbox is on (no email, WhatsApp, Stripe or Ads can leave staging)", async () => {
    const r = await call("GET", "/staging/sandbox-status");
    expect(r.status === 200 && r.body.sandbox === true, `status ${r.status}, sandbox ${r.body.sandbox}`);
  });
  await check("Owner routes refuse a missing or wrong key", async () => {
    expect((await call("GET", "/owner/driver-accounts")).status === 401, "no key accepted");
    expect((await call("GET", "/owner/driver-accounts", undefined, { "X-Owner-Key": "wrong-key" })).status === 401, "wrong key accepted");
    expect((await call("GET", `/owner/driver-accounts?key=${encodeURIComponent("wrong-key")}`)).status === 401, "wrong url key accepted");
  });
  await check("Invite a driver (link returned, nothing sent)", async () => {
    const r = await call("POST", "/owner/driver-accounts/invite", { name: "Cloud Test Driver", email, mobile: "07700 900123" }, owner);
    expect(r.status === 201 && String(r.body.inviteToken).startsWith("dinv_"), `status ${r.status}`);
    driverId = r.body.driverId;
    invite = r.body.inviteToken;
  });
  await check("Driver applies; invite link is single-use", async () => {
    const r = await call("POST", "/driver-portal/account/accept-invite", { token: invite, operatorName: "Cloud Test Cars", operatorLicenceNumber: "OL-TEST", confirmOwnOperatorLicence: true });
    expect(r.status === 200 && r.body.sessionToken, `status ${r.status} ${r.body.error ?? ""}`);
    session = r.body.sessionToken;
    const again = await call("POST", "/driver-portal/account/accept-invite", { token: invite, operatorName: "x", operatorLicenceNumber: "y", confirmOwnOperatorLicence: true });
    expect(again.status === 410, `reuse gave ${again.status}`);
  });
  await check("Approval is blocked until documents are accepted", async () => {
    const r = await call("POST", "/owner/driver-accounts/status", { driverId, action: "approve" }, owner);
    expect(r.status === 409 && r.body.missing?.length === 4, `status ${r.status}`);
  });
  await check("Driver adds 4 documents; owner accepts; driver approved", async () => {
    for (const kind of ["operator_licence", "phv_driver_licence", "vehicle_licence", "insurance"]) {
      const d = await call("POST", "/driver-portal/account/documents", { kind, expiresOn: inYears(1), reference: "REF" }, drv(session));
      expect(d.status === 201, `${kind} submit ${d.status}`);
      const a = await call("POST", "/owner/driver-accounts/document-review", { documentId: d.body.documentId, decision: "accept" }, owner);
      expect(a.status === 200, `${kind} accept ${a.status}`);
    }
    const r = await call("POST", "/owner/driver-accounts/status", { driverId, action: "approve" }, owner);
    expect(r.status === 200, `approve ${r.status} ${r.body.error ?? ""}`);
  });
  await check("Support number: receptionist line and invalid numbers refused by the server", async () => {
    for (const bad of ["028 9602 2952", "+44 28 9602 2952", "12345"]) {
      expect((await call("POST", "/owner/driver-accounts/support-contact", { phone: bad }, owner)).status === 400, `${bad} accepted`);
    }
  });
  await check("Support number only reaches approved, signed-in drivers", async () => {
    expect((await call("POST", "/owner/driver-accounts/support-contact", { phone: "07700 900456" }, owner)).status === 200, "save failed");
    expect((await call("GET", "/driver-portal/account/me")).status === 401, "anonymous allowed");
    expect((await call("GET", "/driver-portal/account/me", undefined, drv("dacc_forged"))).status === 401, "forged session allowed");
    const me = await call("GET", "/driver-portal/account/me", undefined, drv(session));
    expect(me.body.contactOffice?.mode === "phone" && me.body.contactOffice.phone === "07700900456", "approved driver did not get the number");
    expect((await call("GET", "/owner/driver-accounts/support-contact", undefined, drv(session))).status === 401, "driver read owner setting");
    // Clear the test number again so staging is left clean.
    expect((await call("POST", "/owner/driver-accounts/support-contact", { phone: "" }, owner)).status === 200, "clear failed");
  });
  let urgentId = "";
  await check("Availability, and an urgent report goes to the top until handled", async () => {
    expect((await call("POST", "/driver-portal/account/availability", { available: true }, drv(session))).status === 200, "availability");
    const u = await call("POST", "/driver-portal/account/contact-office", { message: "Cloud test: breakdown report", category: "breakdown" }, drv(session));
    expect(u.status === 201 && u.body.priority === "urgent", `urgent ${u.status}`);
    urgentId = u.body.messageId;
    const s = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
    expect(s.body.urgent?.some((m: any) => m.id === urgentId), "urgent not in summary");
    const list = await call("GET", "/owner/driver-accounts", undefined, owner);
    expect(list.body.drivers?.[0]?.urgentMessages >= 1, "urgent driver not sorted first");
    await call("POST", "/owner/driver-accounts/messages/read", { driverId }, owner);
    const s2 = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
    expect(s2.body.urgent?.some((m: any) => m.id === urgentId), "urgent cleared by a plain read");
    expect((await call("POST", "/owner/driver-accounts/messages/handled", { messageId: urgentId }, owner)).status === 200, "handled");
    const s3 = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
    expect(!s3.body.urgent?.some((m: any) => m.id === urgentId), "urgent still listed after handled");
  });
  await check("Suspend: reason required, session revoked at once, offers blocked, audited", async () => {
    expect((await call("POST", "/owner/driver-accounts/status", { driverId, action: "suspend" }, owner)).status === 400, "no reason accepted");
    const r = await call("POST", "/owner/driver-accounts/status", { driverId, action: "suspend", reason: "Cloud test suspension" }, owner);
    expect(r.status === 200 && Array.isArray(r.body.reviewBookings), `suspend ${r.status}`);
    expect((await call("GET", "/driver-portal/account/me", undefined, drv(session))).status === 401, "session still works");
    const d = await call("GET", `/owner/driver-accounts/detail?id=${driverId}`, undefined, owner);
    expect(d.body.canReceiveOffers === false && d.body.driver.available === false, "offers not blocked");
    const a = d.body.audit.find((x: any) => x.action === "driver.suspended");
    expect(a && a.detail.reason === "Cloud test suspension" && a.detail.by && a.detail.sessionsRevoked === true, "audit incomplete");
    expect((await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner)).status === 409, "suspended driver got a link");
  });
  await check("Booking review: unknown item refused; no whole-alert shortcut exists for listed bookings", async () => {
    expect((await call("POST", "/owner/driver-accounts/alerts/item", { itemId: "itm_missing", status: "cancelled" }, owner)).status === 404, "unknown item accepted");
    expect((await call("POST", "/owner/driver-accounts/alerts/resolve", { alertId: "alr_missing", note: "checked" }, owner)).status === 404, "unknown alert accepted");
  });
  await check("Reinstate; sign-in link works once only", async () => {
    expect((await call("POST", "/owner/driver-accounts/status", { driverId, action: "reinstate" }, owner)).status === 200, "reinstate");
    const l = await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner);
    expect(l.status === 201, `link ${l.status}`);
    const s1 = await call("POST", "/driver-portal/account/sign-in", { token: l.body.signInToken });
    expect(s1.status === 200, `sign-in ${s1.status}`);
    expect((await call("POST", "/driver-portal/account/sign-in", { token: l.body.signInToken })).status === 410, "link reused");
    session = s1.body.sessionToken;
  });
  await check("Remove driver: signed out for good; audit trail complete", async () => {
    expect((await call("POST", "/owner/driver-accounts/status", { driverId, action: "remove", reason: "Cloud test finished" }, owner)).status === 200, "remove");
    expect((await call("GET", "/driver-portal/account/me", undefined, drv(session))).status === 401, "removed driver still signed in");
    const d = await call("GET", `/owner/driver-accounts/detail?id=${driverId}`, undefined, owner);
    const actions = new Set(d.body.audit.map((x: any) => x.action));
    for (const a of ["driver.invited", "driver.applied", "document.submitted", "document.accepted", "driver.approved", "driver.available", "driver.urgent_report", "message.handled", "driver.suspended", "driver.signed_in", "driver.removed"]) {
      expect(actions.has(a), `audit missing ${a}`);
    }
    expect(!JSON.stringify(d.body.audit).includes("07700900456"), "support number leaked into audit");
  });

  // ---------- Stage 2: offers, bids, jobs, changes, alerts ----------
  const london = (d: Date) => ({
    ymd: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    hm: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
  });
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function newDriver(label: string, reg: string) {
    const inv = await call("POST", "/owner/driver-accounts/invite", { name: `Cloud ${label}`, email: `cloud-${label.toLowerCase()}-${stamp}@example.com`, mobile: "07700 900124" }, owner);
    expect(inv.status === 201, `invite ${inv.status}`);
    const acc = await call("POST", "/driver-portal/account/accept-invite", { token: inv.body.inviteToken, operatorName: "Cloud Cars", operatorLicenceNumber: "OL-2", confirmOwnOperatorLicence: true, vehicleSummary: "Skoda Superb" });
    expect(acc.status === 200, `apply ${acc.status}`);
    const token = acc.body.sessionToken as string;
    for (const kind of ["operator_licence", "phv_driver_licence", "vehicle_licence", "insurance"]) {
      const d = await call("POST", "/driver-portal/account/documents", { kind, expiresOn: inYears(1), reference: "REF" }, drv(token));
      expect((await call("POST", "/owner/driver-accounts/document-review", { documentId: d.body.documentId, decision: "accept" }, owner)).status === 200, "doc accept");
    }
    expect((await call("POST", "/owner/driver-accounts/status", { driverId: inv.body.driverId, action: "approve" }, owner)).status === 200, "approve");
    expect((await call("POST", "/driver-portal/account/availability", { available: true }, drv(token))).status === 200, "available");
    if (reg) expect((await call("POST", "/driver-portal/jobs/vehicle", { vehicleReg: reg }, drv(token))).status === 200, "reg");
    return { id: inv.body.driverId as string, token };
  }
  const testBooking = async (body: Record<string, unknown>) => call("POST", "/staging/test-booking", body, owner);
  let a = { id: "", token: "" };
  let b = { id: "", token: "" };
  let bookingId = "";
  let bookingId2 = "";
  let jobId = "";
  const soon = london(new Date(Date.now() + 3 * 3_600_000));
  const later = london(new Date(Date.now() + 5 * 3_600_000));
  const offerWhenReady = async (body: Record<string, unknown>) => {
    // A new test booking can take a few seconds to be readable everywhere.
    for (let i = 0; i < 30; i++) {
      const r = await call("POST", "/owner/driver-jobs/offers", body, owner);
      if (r.status !== 404) return r;
      await pause(3000);
    }
    throw new Error("test booking never became readable");
  };

  await check("Stage 2: driver-job routes refuse a missing owner key and a missing driver session", async () => {
    expect((await call("GET", "/owner/driver-jobs")).status === 401, "owner board open");
    expect((await call("GET", "/driver-portal/jobs")).status === 401, "driver jobs open");
    expect((await call("POST", "/staging/test-booking", { action: "create" })).status === 401, "test-booking route open");
  });
  await check("Stage 2: two approved test drivers and two staging test bookings", async () => {
    a = await newDriver("Alpha", "AB12 CDE");
    b = await newDriver("Bravo", "XY66 ZZZ");
    const one = await testBooking({ action: "create", tripDate: soon.ymd, tripTime: soon.hm });
    const two = await testBooking({ action: "create", tripDate: later.ymd, tripTime: later.hm, pickup: "9 Sample Road, Antrim, BT41 1ZZ" });
    expect(one.status === 201 && two.status === 201, `create ${one.status}/${two.status}`);
    bookingId = one.body.id;
    bookingId2 = two.body.id;
    expect((await testBooking({ action: "delete", id: "MATNI-REAL-1" })).status === 403, "route can touch a non-test booking");
  });
  await check("Stage 2: fixed-price offer shows a driver the area and their fee only", async () => {
    const o = await offerWhenReady({ reference: bookingId, mode: "fixed", feePence: 4500, driverIds: [a.id, b.id] });
    expect(o.status === 201, `offer ${o.status} ${JSON.stringify(o.body)}`);
    const res = await fetch(`${BASE}/driver-portal/jobs`, { headers: drv(a.token) });
    const raw = await res.text();
    const view = JSON.parse(raw);
    expect(view.offers.length === 1 && view.offers[0].feeLabel === "£45.00", "offer not shown");
    for (const secret of ["Test Street", "07700900555", "185", "Staging Test", bookingId]) expect(!raw.includes(secret), `offer leaked ${secret}`);
  });
  await check("Stage 2: two drivers accept at the same moment — exactly one gets the job", async () => {
    const offers = (await call("GET", "/driver-portal/jobs", undefined, drv(a.token))).body.offers;
    const [x, y] = await Promise.all([
      call("POST", "/driver-portal/jobs/offer-response", { offerId: offers[0].id, action: "accept" }, drv(a.token)),
      call("POST", "/driver-portal/jobs/offer-response", { offerId: offers[0].id, action: "accept" }, drv(b.token)),
    ]);
    expect([x.status, y.status].sort().join() === "200,409", `got ${x.status}/${y.status}`);
    if (y.status === 200) [a, b] = [b, a]; // "a" is the driver with the job from here on
    const mine = await fetch(`${BASE}/driver-portal/jobs`, { headers: drv(a.token) });
    const raw = await mine.text();
    const view = JSON.parse(raw);
    expect(view.jobs.length === 1, "winner has no job");
    jobId = view.jobs[0].id;
    expect(view.jobs[0].pickup.includes("Test Street") && view.jobs[0].customerMobile === "07700900555", "winner lacks full details");
    expect(!raw.includes("185") && !/fare|margin|quotedPrice|amountPaid/i.test(raw), "customer price reached the driver");
    const other = await call("GET", "/driver-portal/jobs", undefined, drv(b.token));
    expect(other.body.jobs.length === 0 && other.body.offers.length === 0, "other driver can see the job");
  });
  await check("Stage 2: the booking records the driver; the customer email was attempted and blocked by the sandbox", async () => {
    let read = await testBooking({ action: "read", id: bookingId });
    for (let i = 0; i < 20 && read.body.driverAccountId !== a.id; i++) {
      await pause(3000);
      read = await testBooking({ action: "read", id: bookingId });
    }
    expect(read.body.driverAccountId === a.id && read.body.assignment === "accepted", `booking shows ${JSON.stringify(read.body)}`);
    const board = await call("GET", "/owner/driver-jobs", undefined, owner);
    const job = board.body.jobs.find((j: any) => j.id === jobId);
    expect(job, "job not on the owner board");
    // On staging nothing can leave, so the customer email is recorded as not sent.
    expect(job.customerToldAt === null, "a customer email left staging");
  });
  await check("Stage 2: status buttons in order, own job only; location optional; completion pays nothing", async () => {
    const set = (token: string, status: string, location?: unknown) => call("POST", "/driver-portal/jobs/status", { jobId, status, location }, drv(token));
    expect((await set(b.token, "on_the_way")).status === 404, "another driver changed the job");
    expect((await set(a.token, "completed")).status === 409, "skipped steps");
    expect((await set(a.token, "on_the_way")).status === 200, "on the way");
    const arrived = await set(a.token, "arrived", { lat: 54.6181, lng: -5.8725, accuracy: 9 });
    expect(arrived.body.locationVerified === true, "location not stored");
    const done = await set(a.token, "completed", null);
    expect(done.status === 200 && done.body.locationVerified === false, "complete without location failed");
    const board = await call("GET", "/owner/driver-jobs", undefined, owner);
    const job = board.body.recent.find((j: any) => j.id === jobId);
    expect(job?.arrivedLocation?.verified === true && job?.completedLocation?.verified === false, "evidence wrong");
    expect(/your approval/i.test(job.payment), "payment wording");
    const mine = await (await fetch(`${BASE}/driver-portal/jobs`, { headers: drv(a.token) })).text();
    expect(!mine.includes("54.6181") && !mine.includes("07700900555"), "driver sees evidence or old customer phone");
  });
  await check("Stage 2: bids are private and the owner chooses (the higher bid here)", async () => {
    const o = await offerWhenReady({ reference: bookingId2, mode: "bids", driverIds: [a.id, b.id] });
    expect(o.status === 201, `offer ${o.status} ${JSON.stringify(o.body)}`);
    const offerId = o.body.offerId;
    expect((await call("POST", "/driver-portal/jobs/offer-response", { offerId, action: "accept" }, drv(a.token))).status === 409, "accepted a bidding job");
    expect((await call("POST", "/driver-portal/jobs/offer-response", { offerId, action: "bid", bidPence: 9000 }, drv(a.token))).status === 200, "bid a");
    expect((await call("POST", "/driver-portal/jobs/offer-response", { offerId, action: "bid", bidPence: 11000 }, drv(b.token))).status === 200, "bid b");
    const raw = await (await fetch(`${BASE}/driver-portal/jobs`, { headers: drv(b.token) })).text();
    expect(!raw.includes("9000") && !raw.includes("£90"), "saw another driver's bid");
    const before = await call("GET", "/owner/driver-jobs", undefined, owner);
    expect(!before.body.jobs.some((j: any) => j.reference === bookingId2), "awarded automatically");
    const award = await call("POST", "/owner/driver-jobs/offers/award", { offerId, driverId: b.id }, owner);
    expect(award.status === 200 && award.body.feeLabel === "£110.00", `award ${award.status}`);
    expect((await call("POST", "/owner/driver-jobs/offers/award", { offerId, driverId: a.id }, owner)).status === 409, "awarded twice");
  });
  await check("Stage 2: booking time change → Can't Do New Time → urgent owner alert; driver stays assigned", async () => {
    const changed = london(new Date(Date.now() + 6 * 3_600_000));
    expect((await testBooking({ action: "update", id: bookingId2, tripTime: changed.hm, tripDate: changed.ymd })).status === 200, "update");
    let job: any;
    for (let i = 0; i < 20 && !job?.change; i++) {
      await pause(3000);
      job = (await call("GET", "/driver-portal/jobs", undefined, drv(b.token))).body.jobs?.find((j: any) => j.reference === bookingId2);
    }
    expect(job?.change?.to?.tripTime === changed.hm, "driver not asked about the change");
    const r = await call("POST", "/driver-portal/jobs/change-response", { changeId: job.change.id, action: "cant_do" }, drv(b.token));
    expect(r.status === 200 && r.body.stillAssigned === true, "cant_do");
    const board = await call("GET", "/owner/driver-jobs", undefined, owner);
    const live = board.body.jobs.find((j: any) => j.reference === bookingId2);
    expect(live?.status === "confirmed" && live.change?.status === "cant_do", "driver was removed or change not flagged");
    const esc = board.body.escalations.find((e: any) => /can't do the new time/.test(e.title));
    expect(esc?.priority === "high" && !esc.acknowledgedAt, "no urgent alert");
    expect((await call("POST", "/owner/driver-jobs/escalations/close", { id: esc.id, note: "Sorted it" }, owner)).status === 409, "unresolved alert could be closed");
    expect((await call("POST", "/owner/driver-jobs/escalations/ack", { id: esc.id }, owner)).body.stillOpen === true, "acknowledge");
    expect((await call("POST", "/owner/driver-jobs/jobs/release", { jobId: live.id, reason: "" }, owner)).status === 400, "released without a reason");
    const rel = await call("POST", "/owner/driver-jobs/jobs/release", { jobId: live.id, reason: "Cloud test: can't do new time" }, owner);
    expect(rel.status === 200 && rel.body.bookingChanged === false && rel.body.customerTold === false, "release");
    const after = await call("GET", "/owner/driver-jobs", undefined, owner);
    expect(!after.body.escalations.some((e: any) => e.id === esc.id), "alert stayed after release");
    const read = await testBooking({ action: "read", id: bookingId2 });
    expect(read.body.status === "paid", "booking was changed");
  });
  await check("Stage 2: direct assignment declined → urgent owner alert; urgent driver report alerts at once", async () => {
    const o = await offerWhenReady({ reference: bookingId2, mode: "direct", feePence: 5000, driverIds: [a.id] });
    expect(o.status === 201, `direct ${o.status} ${JSON.stringify(o.body)}`);
    expect((await call("POST", "/driver-portal/jobs/offer-response", { offerId: o.body.offerId, action: "decline" }, drv(a.token))).status === 200, "decline");
    const msg = await call("POST", "/driver-portal/account/contact-office", { message: "Cloud test breakdown report", category: "breakdown" }, drv(a.token));
    expect(msg.status === 201, "report");
    const s = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
    const declined = s.body.escalations.find((e: any) => /declined/.test(e.title));
    const report = s.body.escalations.find((e: any) => e.sourceType === "message" && e.sourceId === msg.body.messageId);
    expect(declined?.priority === "high" && report?.priority === "high", "alerts missing");
    expect((await call("POST", "/owner/driver-jobs/escalations/ack", { id: declined.id }, owner)).status === 200, "ack");
    expect((await call("POST", "/owner/driver-jobs/escalations/close", { id: declined.id, note: "Cloud test finished" }, owner)).status === 200, "close");
    expect((await call("POST", "/owner/driver-accounts/messages/handled", { messageId: msg.body.messageId }, owner)).status === 200, "handled");
    const s2 = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
    expect(!s2.body.escalations.some((e: any) => e.id === report.id || e.id === declined.id), "alerts stayed open");
  });
  await check("Stage 2: tidy up — test bookings deleted, test drivers removed, audit trail complete", async () => {
    const d = await call("GET", `/owner/driver-accounts/detail?id=${b.id}`, undefined, owner);
    const actions = new Set(d.body.audit.map((x: any) => x.action));
    for (const act of ["offer.bid", "job.confirmed", "job.change_cant_do", "job.released"]) expect(actions.has(act), `audit missing ${act}`);
    for (const id of [bookingId, bookingId2]) expect((await testBooking({ action: "delete", id })).status === 200, "delete booking");
    for (const id of [a.id, b.id]) expect((await call("POST", "/owner/driver-accounts/status", { driverId: id, action: "remove", reason: "Cloud test finished" }, owner)).status === 200, "remove driver");
  });
  await check("Staging sent nothing out during the tests", async () => {
    const r = await call("GET", "/staging/sandbox-status");
    expect(r.body.sandbox === true, "sandbox off");
    console.log(`      blocked outbound attempts recorded: ${r.body.recentBlocked?.length ?? 0}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSTAGE 1 + 2 CLOUD RESULT: ${results.length - failed.length}/${results.length} passed — ${failed.length ? "NO-GO" : "GO"}`);
  if (failed.length) {
    console.log(`::error::Stage 1 + 2 cloud tests: ${failed.length} failed — ${failed.map((f) => f.name).join("; ")}`);
    process.exit(1);
  }
  console.log(`::notice::Stage 1 + 2 cloud tests: ${results.length}/${results.length} passed (GO)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
