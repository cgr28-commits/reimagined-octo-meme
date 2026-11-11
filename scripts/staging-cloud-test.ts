/**
 * Stage 1 end-to-end tests against the deployed, isolated staging Worker (real Cloudflare D1).
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
  await check("Staging sent nothing out during the tests", async () => {
    const r = await call("GET", "/staging/sandbox-status");
    expect(r.body.sandbox === true, "sandbox off");
    console.log(`      blocked outbound attempts recorded: ${r.body.recentBlocked?.length ?? 0}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSTAGE 1 CLOUD RESULT: ${results.length - failed.length}/${results.length} passed — ${failed.length ? "NO-GO" : "GO"}`);
  if (failed.length) {
    console.log(`::error::Stage 1 cloud tests: ${failed.length} failed — ${failed.map((f) => f.name).join("; ")}`);
    process.exit(1);
  }
  console.log(`::notice::Stage 1 cloud tests: ${results.length}/${results.length} passed (GO)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
