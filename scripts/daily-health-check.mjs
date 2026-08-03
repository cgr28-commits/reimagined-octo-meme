/**
 * Daily site + worker health check for My Airport Taxi NI.
 *
 * Covers live pages, Cloudflare Worker APIs, dashboard/demo features from
 * recent builds, demo data integrity, build/typecheck, and sitemap auto-fix.
 *
 * Exits 0 when healthy (or only warnings). Exits 1 when critical checks fail.
 * Writes reports/daily-health-YYYY-MM-DD.json
 *
 * Env:
 *   HEALTH_CHECK_SITE_URL     default https://www.myairporttaxini.co.uk
 *   HEALTH_CHECK_WORKER_URL   default https://reimagined-octo-meme.cgr28.workers.dev
 *   HEALTH_CHECK_NOTIFY_EMAIL default bookings@myairporttaxini.co.uk
 *   WEB3FORMS_ACCESS_KEY      optional — sends daily summary email when set
 *   HEALTH_CHECK_SKIP_BUILD   set 1 to skip npm run build (faster)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE_URL = (process.env.HEALTH_CHECK_SITE_URL ?? "https://www.myairporttaxini.co.uk").replace(
  /\/$/,
  "",
);
const WORKER_URL = (
  process.env.HEALTH_CHECK_WORKER_URL ?? "https://reimagined-octo-meme.cgr28.workers.dev"
).replace(/\/$/, "");
const NOTIFY_EMAIL =
  process.env.HEALTH_CHECK_NOTIFY_EMAIL ?? "bookings@myairporttaxini.co.uk";
const WEB3FORMS_KEY = process.env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
const RUN_DATE = new Date().toISOString().slice(0, 10);
const REPORT_DIR = join(process.cwd(), "reports");

/** @type {{ name: string; status: "pass" | "fail" | "warn" | "fixed"; detail: string }[]} */
const checks = [];
/** @type {{ action: string; detail: string }[]} */
const fixes = [];

function record(name, status, detail) {
  checks.push({ name, status, detail });
  const icon = status === "pass" ? "✓" : status === "fixed" ? "🔧" : status === "warn" ? "!" : "✗";
  console.log(`${icon} ${name}: ${detail}`);
}

async function fetchRaw(url, options = {}) {
  const { method = "GET", body, headers, timeoutMs = 20_000, redirect = "follow" } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCheck(name, url, options = {}) {
  const { expectStatus = 200, expectStatuses, method = "GET", body, headers, timeoutMs = 20_000 } =
    options;
  const allowed = expectStatuses ?? [expectStatus];

  try {
    const response = await fetchRaw(url, { method, body, headers, timeoutMs });

    if (!allowed.includes(response.status)) {
      record(
        name,
        "fail",
        `HTTP ${response.status} (expected ${allowed.join(" or ")}) — ${url}`,
      );
      return null;
    }

    record(name, "pass", `HTTP ${response.status} — ${url}`);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, "fail", `${message} — ${url}`);
    return null;
  }
}

/**
 * @param {string} name
 * @param {string} url
 * @param {string[]} mustInclude
 * @param {{ critical?: boolean }} [opts]
 */
async function pageContentCheck(name, url, mustInclude, opts = {}) {
  const critical = opts.critical !== false;
  try {
    const response = await fetchRaw(url);
    if (response.status !== 200) {
      record(name, critical ? "fail" : "warn", `HTTP ${response.status} — ${url}`);
      return;
    }

    const html = await response.text();
    const missing = mustInclude.filter((snippet) => !html.includes(snippet));
    if (missing.length > 0) {
      record(
        name,
        critical ? "fail" : "warn",
        `Missing content: ${missing.join(", ")} — ${url}`,
      );
      return;
    }

    record(name, "pass", `Found ${mustInclude.length} marker(s) — ${url}`);
  } catch (error) {
    record(
      name,
      critical ? "fail" : "warn",
      `${error instanceof Error ? error.message : String(error)} — ${url}`,
    );
  }
}

async function jsonCheck(name, url, options = {}) {
  const {
    expectStatuses = [200],
    method = "GET",
    body,
    headers,
    assert,
    critical = true,
  } = options;

  try {
    const response = await fetchRaw(url, { method, body, headers });
    if (!expectStatuses.includes(response.status)) {
      record(
        name,
        critical ? "fail" : "warn",
        `HTTP ${response.status} (expected ${expectStatuses.join(" or ")}) — ${url}`,
      );
      return null;
    }

    const data = await response.json().catch(() => null);
    if (assert) {
      const result = assert(data, response.status);
      if (result !== true) {
        record(name, critical ? "fail" : "warn", `${result || "Assertion failed"} — ${url}`);
        return data;
      }
    }

    record(name, "pass", `HTTP ${response.status} — ${url}`);
    return data;
  } catch (error) {
    record(
      name,
      critical ? "fail" : "warn",
      `${error instanceof Error ? error.message : String(error)} — ${url}`,
    );
    return null;
  }
}

function runCommand(name, command, { allowFail = false } = {}) {
  try {
    execSync(command, { stdio: "pipe", encoding: "utf8" });
    record(name, "pass", command);
    return true;
  } catch (error) {
    const output =
      (error instanceof Error && "stdout" in error ? error.stdout : "") ||
      (error instanceof Error && "stderr" in error ? error.stderr : "") ||
      (error instanceof Error ? error.message : String(error));
    if (allowFail) {
      record(name, "warn", String(output).slice(0, 300));
      return false;
    }
    record(name, "fail", String(output).slice(0, 500));
    return false;
  }
}

function tryFixSitemap() {
  const sitemapPath = join(process.cwd(), "public", "sitemap.xml");
  const requiredPaths = [
    "/privacy/",
    "/contact/",
    "/driver/",
    "/owner/",
    "/track/",
    "/track/demo/",
    "/track/demo/early/",
    "/track/demo/waiting/",
    "/track/demo/live/",
    "/terms/",
    "/tours/",
    "/unsubscribe/",
  ];
  let content = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";
  const missing = requiredPaths.filter((path) => !content.includes(`${SITE_URL}${path}`));

  if (missing.length === 0) {
    record("Sitemap coverage", "pass", `All ${requiredPaths.length} required paths present`);
    return false;
  }

  try {
    execSync("node scripts/generate-sitemap.mjs", { stdio: "pipe" });
    content = readFileSync(sitemapPath, "utf8");
    const stillMissing = requiredPaths.filter((path) => !content.includes(`${SITE_URL}${path}`));

    if (stillMissing.length > 0) {
      for (const path of stillMissing) {
        const block = `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${RUN_DATE}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
        content = content.replace("</urlset>", `${block}\n</urlset>`);
      }
      writeFileSync(sitemapPath, content, "utf8");
    }

    fixes.push({
      action: "Regenerated/patched sitemap.xml",
      detail: `Added missing paths: ${missing.join(", ")}`,
    });
    record("Sitemap auto-fix", "fixed", `Added ${missing.join(", ")}`);
    return true;
  } catch (error) {
    record(
      "Sitemap auto-fix",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

function checkDemoDataIntegrity() {
  try {
    const output = execSync("npx tsx scripts/check-demo-features.ts", {
      stdio: "pipe",
      encoding: "utf8",
    });
    const summary = output.trim().split("\n").filter(Boolean).at(-1) ?? "Demo features OK";
    record("Demo feature integrity", "pass", summary);
    return true;
  } catch (error) {
    const output =
      (error instanceof Error && "stdout" in error ? error.stdout : "") ||
      (error instanceof Error && "stderr" in error ? error.stderr : "") ||
      (error instanceof Error ? error.message : String(error));
    record("Demo feature integrity", "fail", String(output).slice(0, 600));
    return false;
  }
}

async function sendNotificationEmail() {
  if (!WEB3FORMS_KEY) {
    record("Email notification", "warn", "WEB3FORMS_ACCESS_KEY not set — skipped email");
    return;
  }

  const failed = checks.filter((c) => c.status === "fail");
  const subject =
    failed.length === 0
      ? `Daily health check OK — ${SITE_URL.replace("https://", "")} (${RUN_DATE})`
      : `Daily health check ISSUES — ${failed.length} failure(s) (${RUN_DATE})`;

  const body = [
    `My Airport Taxi NI — daily automated health check`,
    `Date: ${RUN_DATE}`,
    `Overall: ${failed.length === 0 ? "ALL OK" : `${failed.length} issue(s) need attention`}`,
    "",
    "--- Checks ---",
    ...checks.map((c) => `[${c.status.toUpperCase()}] ${c.name}: ${c.detail}`),
    "",
    fixes.length > 0 ? "--- Auto-fixes applied ---" : "",
    ...fixes.map((f) => `• ${f.action}: ${f.detail}`),
    "",
    `GitHub Actions run: ${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? "repo"}/actions/runs/${process.env.GITHUB_RUN_ID ?? "local"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject,
        email: NOTIFY_EMAIL,
        name: "MATNI Health Monitor",
        message: body,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      record(
        "Email notification",
        "warn",
        `Web3Forms failed: ${payload?.message ?? response.status}`,
      );
      return;
    }

    record("Email notification", "pass", `Sent summary to ${NOTIFY_EMAIL}`);
  } catch (error) {
    record(
      "Email notification",
      "warn",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function checkLiveWebsite() {
  console.log("\n— Live website pages —");

  const pages = [
    ["Homepage", "/"],
    ["Terms page", "/terms/"],
    ["Privacy page", "/privacy/"],
    ["Contact card", "/contact/"],
    ["Driver dashboard", "/driver/"],
    ["Owner dashboard", "/owner/"],
    ["Track page", "/track/"],
    ["Track demo hub", "/track/demo/"],
    ["Track demo early", "/track/demo/early/"],
    ["Track demo waiting", "/track/demo/waiting/"],
    ["Track demo live", "/track/demo/live/"],
    ["Tours", "/tours/"],
    ["Admin refund", "/admin/refund/"],
    ["Unsubscribe", "/unsubscribe/"],
    ["Favicon", "/favicon.ico"],
  ];

  for (const [name, path] of pages) {
    await fetchCheck(name, `${SITE_URL}${path}`);
  }

  console.log("\n— Live page feature markers —");

  await pageContentCheck("Homepage branding", `${SITE_URL}/`, [
    "My Airport Taxi",
    "WhatsApp",
  ]);

  await pageContentCheck("Contact card markers", `${SITE_URL}/contact/`, [
    "My Airport Taxi",
    "@belfasttaxi",
    "Get a quote & book",
    "Save to contacts",
    "Scan QR code",
    "Download QR image",
    "028 9602 2952",
  ]);

  await fetchCheck("Contact QR image", `${SITE_URL}/contact-qr.png`);
  await fetchCheck("Contact photo image", `${SITE_URL}/contact-photo.jpg`);

  const vcardResponse = await fetchCheck(
    "Contact vCard file",
    `${SITE_URL}/my-airport-taxi-ni.vcf`,
  );
  if (vcardResponse) {
    const vcardText = await vcardResponse.text();
    if (vcardText.includes("PHOTO;") && vcardText.includes("TYPE=JPEG")) {
      record("Contact vCard logo photo", "pass", "vCard embeds JPEG PHOTO");
    } else {
      record("Contact vCard logo photo", "fail", "vCard missing embedded PHOTO");
    }
  }

  await pageContentCheck("Driver page links", `${SITE_URL}/driver/`, [
    "/owner/",
    "demo-driver-key",
  ]);

  await pageContentCheck("Owner page markers", `${SITE_URL}/owner/`, [
    "Owner dashboard",
    "demo-owner-key",
  ]);

  await pageContentCheck("Track demo scenarios", `${SITE_URL}/track/demo/`, [
    "Too early",
    "Waiting for driver",
    "Live map",
    "demo-early",
    "demo-waiting",
    "demo-live",
  ]);

  // Customer names load client-side from demo data; assert shell + token markers.
  await pageContentCheck("Live track demo markers", `${SITE_URL}/track/demo/live/`, [
    "demo-live",
    "Demo preview",
    "Belfast",
  ]);

  await pageContentCheck("Airport track demo markers", `${SITE_URL}/track/demo/waiting/`, [
    "demo-waiting",
    "Demo preview",
    "flight",
  ]);

  await pageContentCheck(
    "Refund admin page",
    `${SITE_URL}/admin/refund/`,
    ["refund", "payment"],
    { critical: false },
  );
}

async function checkWorkerApis() {
  console.log("\n— Cloudflare Worker APIs —");

  const calendar = await jsonCheck(
    "Worker calendar-status",
    `${WORKER_URL}/calendar-status`,
    {
      assert: (data) => (data && typeof data === "object" ? true : "Expected JSON object"),
    },
  );

  if (calendar) {
    if (calendar.configured && !calendar.connected) {
      record("Google Calendar", "warn", calendar.reason ?? "Configured but not connected");
    } else if (calendar.connected) {
      record("Google Calendar", "pass", "Connected");
    } else if (!calendar.configured) {
      record("Google Calendar", "warn", "Calendar secrets not configured on worker");
    }
  }

  const driverStatus = await jsonCheck(
    "Worker driver/status",
    `${WORKER_URL}/driver/status?key=health-check-invalid`,
    {
      expectStatuses: [200, 401, 403],
      assert: (data) => {
        if (!data || typeof data !== "object") {
          return "Expected JSON status payload";
        }
        if (data.authConfigured !== true) {
          return "authConfigured is not true — DRIVER_ACCESS_KEY may be missing";
        }
        return true;
      },
    },
  );

  if (driverStatus) {
    if (driverStatus.hasDriverKey) {
      record("Driver access key secret", "pass", "DRIVER_ACCESS_KEY configured on worker");
    } else {
      record("Driver access key secret", "fail", "hasDriverKey=false — set DRIVER_ACCESS_KEY");
    }

    if (driverStatus.hasOwnerKey) {
      record("Owner access key secret", "pass", "OWNER_ACCESS_KEY configured on worker");
    } else {
      record(
        "Owner access key secret",
        "warn",
        "hasOwnerKey=false — set OWNER_ACCESS_KEY in Cloudflare for owner dashboard / refunds",
      );
    }
  }

  await fetchCheck("Worker driver jobs auth", `${WORKER_URL}/driver/jobs?scope=today&key=invalid`, {
    expectStatuses: [401, 403],
  });

  await fetchCheck("Worker driver roster auth", `${WORKER_URL}/driver/roster?key=invalid`, {
    expectStatuses: [401, 403],
  });

  await fetchCheck(
    "Worker driver vehicle profiles auth",
    `${WORKER_URL}/driver/vehicle/profiles?key=invalid`,
    { expectStatuses: [401, 403] },
  );

  await fetchCheck(
    "Worker location-history auth",
    `${WORKER_URL}/driver/location-history?token=x&key=invalid`,
    { expectStatuses: [401, 403] },
  );

  await fetchCheck("Worker tracking sharing API", `${WORKER_URL}/track/sharing`, {
    method: "POST",
    expectStatuses: [400, 404],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "health-check-invalid", active: true }),
  });

  await fetchCheck("Worker track lookup", `${WORKER_URL}/track/health-check-invalid-token`, {
    expectStatus: 404,
  });

  await jsonCheck("Worker addresses API", `${WORKER_URL}/addresses?q=BT20`, {
    assert: (data) => {
      if (!data || typeof data !== "object") {
        return "Expected addresses JSON";
      }
      if (!("suggestions" in data) && !("error" in data)) {
        return "Missing suggestions/error field";
      }
      return true;
    },
  });

  await jsonCheck(
    "Worker flights API",
    `${WORKER_URL}/flights?flight=BA1234&date=${RUN_DATE}&airport=BHD&direction=from-airport`,
    {
      expectStatuses: [200, 404, 503],
      assert: (data, status) => {
        if (!data || typeof data !== "object") {
          return "Expected flight JSON";
        }
        if (data.configured === false && status === 503) {
          return true;
        }
        if ("ok" in data || "error" in data || "flight" in data) {
          return true;
        }
        return "Unexpected flight response shape";
      },
    },
  );

  await jsonCheck("Worker bookings validation", `${WORKER_URL}/bookings`, {
    method: "POST",
    expectStatuses: [400],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assert: (data) =>
      data && typeof data === "object" && data.error
        ? true
        : "Expected validation error for empty booking",
  });

  await jsonCheck("Worker quote-leads validation", `${WORKER_URL}/quote-leads`, {
    method: "POST",
    expectStatuses: [400],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assert: (data) =>
      data && typeof data === "object" && data.error
        ? true
        : "Expected validation error for empty quote lead",
  });

  await jsonCheck("Worker SumUp webhook", `${WORKER_URL}/payments/webhook`, {
    method: "POST",
    expectStatuses: [200],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "CHECKOUT_STATUS_CHANGED", id: "health-check" }),
    assert: (data) => (data && data.ok === true ? true : "Webhook did not acknowledge"),
  });

  await jsonCheck("Worker refund auth gate", `${WORKER_URL}/bookings/refund`, {
    method: "POST",
    expectStatuses: [401, 403],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assert: (data) =>
      data && typeof data === "object" && /owner|unauthorized|access key/i.test(String(data.error))
        ? true
        : `Unexpected refund auth response: ${JSON.stringify(data)}`,
  });

  await jsonCheck("Worker marketing opt-in validation", `${WORKER_URL}/marketing/opt-in`, {
    method: "POST",
    expectStatuses: [400, 405],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    critical: false,
  });
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`Daily health check — ${RUN_DATE}`);
  console.log(`Site: ${SITE_URL}`);
  console.log(`Worker: ${WORKER_URL}`);

  await checkLiveWebsite();
  await checkWorkerApis();

  console.log("\n— Demo / feature integrity —");
  checkDemoDataIntegrity();

  console.log("\n— Build / typecheck —");
  if (process.env.HEALTH_CHECK_SKIP_BUILD !== "1") {
    runCommand("Worker typecheck", "npm --prefix workers/addresses run typecheck");
    runCommand("Site build", "npm run build");
  } else {
    record("Site build", "warn", "Skipped (HEALTH_CHECK_SKIP_BUILD=1)");
  }

  console.log("\n— Auto-fixes —");
  tryFixSitemap();

  const failures = checks.filter((c) => c.status === "fail");
  const report = {
    runDate: RUN_DATE,
    siteUrl: SITE_URL,
    workerUrl: WORKER_URL,
    ok: failures.length === 0,
    summary: {
      pass: checks.filter((c) => c.status === "pass").length,
      fail: failures.length,
      warn: checks.filter((c) => c.status === "warn").length,
      fixed: checks.filter((c) => c.status === "fixed").length,
    },
    checks,
    fixes,
  };

  const reportPath = join(REPORT_DIR, `daily-health-${RUN_DATE}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nReport: ${reportPath}`);

  await sendNotificationEmail();

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll critical checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
