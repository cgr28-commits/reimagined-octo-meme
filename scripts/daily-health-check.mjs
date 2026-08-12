/**
 * Daily website health check for My Airport Taxi NI.
 *
 * Focus: make sure the live site works for customers, and auto-fix what we can.
 *
 * Checks:
 *   - Public pages load (home, contact, terms, privacy, quote shell, etc.)
 *   - Key on-page content / assets (branding, contact card, vCard logo)
 *   - Core APIs the website needs (addresses, bookings validation, contact.vcf)
 *
 * Auto-fixes:
 *   - Regenerate / patch public/sitemap.xml when required URLs are missing
 *   - Regenerate contact vCard (+ shared worker copy) when PHOTO is missing
 *
 * The GitHub Actions workflow also redeploys the worker / Pages site when
 * live checks still fail after auto-fixes.
 *
 * Exits 0 when healthy (or only warnings). Exits 1 when critical checks fail.
 * Writes reports/daily-health-YYYY-MM-DD.json
 *
 * Env:
 *   HEALTH_CHECK_SITE_URL     default https://www.myairporttaxini.co.uk
 *   HEALTH_CHECK_WORKER_URL   default https://reimagined-octo-meme.cgr28.workers.dev
 *   HEALTH_CHECK_NOTIFY_EMAIL ignored — always bookings@myairporttaxini.co.uk
 *   WEB3FORMS_ACCESS_KEY      optional — sends daily summary email when set
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
const NOTIFY_EMAIL = "bookings@myairporttaxini.co.uk";
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
    return await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect,
    });
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

async function pageContentCheck(name, url, mustInclude, opts = {}) {
  const critical = opts.critical !== false;
  try {
    const response = await fetchRaw(url);
    if (response.status !== 200) {
      record(name, critical ? "fail" : "warn", `HTTP ${response.status} — ${url}`);
      return false;
    }

    const html = await response.text();
    const missing = mustInclude.filter((snippet) => !html.includes(snippet));
    if (missing.length > 0) {
      record(
        name,
        critical ? "fail" : "warn",
        `Missing content: ${missing.join(", ")} — ${url}`,
      );
      return false;
    }

    record(name, "pass", `Found ${mustInclude.length} marker(s) — ${url}`);
    return true;
  } catch (error) {
    record(
      name,
      critical ? "fail" : "warn",
      `${error instanceof Error ? error.message : String(error)} — ${url}`,
    );
    return false;
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

function vcardHasPhoto(text) {
  // Accept Apple-style PHOTO lines, including X-ABCROP-RECTANGLE params before `:`.
  return /PHOTO;[^:\n]*ENCODING=b[^:\n]*TYPE=JP(E)?G/i.test(text)
    || /PHOTO;[^:\n]*TYPE=JP(E)?G[^:\n]*ENCODING=b/i.test(text);
}

function tryFixSitemap() {
  const sitemapPath = join(process.cwd(), "public", "sitemap.xml");
  const requiredPaths = [
    "/",
    "/privacy/",
    "/contact/",
    "/terms/",
    "/unsubscribe/",
  ];
  let content = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";
  const missing = requiredPaths.filter((path) => {
    const loc = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
    return !content.includes(`<loc>${loc}</loc>`) && !content.includes(loc);
  });

  if (missing.length === 0) {
    record("Sitemap coverage", "pass", `All ${requiredPaths.length} required paths present`);
    return false;
  }

  try {
    execSync("node scripts/generate-sitemap.mjs", { stdio: "pipe" });
    content = readFileSync(sitemapPath, "utf8");
    const stillMissing = requiredPaths.filter((path) => {
      const loc = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
      return !content.includes(loc);
    });

    if (stillMissing.length > 0) {
      for (const path of stillMissing) {
        const loc = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
        const block = `  <url>
    <loc>${loc}</loc>
    <lastmod>${RUN_DATE}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/" ? "1.0" : "0.6"}</priority>
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

function tryFixContactVcard() {
  const vcardPath = join(process.cwd(), "public", "my-airport-taxi-ni.vcf");
  const photoPath = join(process.cwd(), "public", "contact-photo.jpg");

  if (!existsSync(photoPath)) {
    record("Contact vCard auto-fix", "fail", "public/contact-photo.jpg is missing");
    return false;
  }

  const current = existsSync(vcardPath) ? readFileSync(vcardPath, "utf8") : "";
  if (current.includes("BEGIN:VCARD") && vcardHasPhoto(current)) {
    record("Contact vCard local file", "pass", "Local vCard has embedded PHOTO");
    return false;
  }

  try {
    execSync("node scripts/generate-contact-vcf.mjs", { stdio: "pipe" });
    if (existsSync(join(process.cwd(), "scripts/sync-worker-shared.mjs"))) {
      try {
        execSync("node scripts/sync-worker-shared.mjs", { stdio: "pipe" });
      } catch {
        // Shared sync is best-effort; Pages vCard is the customer-facing fix.
      }
    }

    const next = readFileSync(vcardPath, "utf8");
    if (!vcardHasPhoto(next)) {
      record("Contact vCard auto-fix", "fail", "Regenerated vCard still missing PHOTO");
      return false;
    }

    fixes.push({
      action: "Regenerated contact vCard",
      detail: "public/my-airport-taxi-ni.vcf rebuilt with embedded logo PHOTO",
    });
    record("Contact vCard auto-fix", "fixed", "Regenerated vCard with logo PHOTO");
    return true;
  } catch (error) {
    record(
      "Contact vCard auto-fix",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
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
      ? `Daily website health OK — ${SITE_URL.replace("https://", "")} (${RUN_DATE})`
      : `Daily website health ISSUES — ${failed.length} failure(s) (${RUN_DATE})`;

  const body = [
    `My Airport Taxi NI — daily website health check`,
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
        name: "My Airport Taxi NI",
        from_name: "My Airport Taxi NI",
        replyto: NOTIFY_EMAIL,
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
    ["Contact card", "/contact/"],
    ["Terms page", "/terms/"],
    ["Privacy page", "/privacy/"],
    ["Unsubscribe", "/unsubscribe/"],
    ["Driver dashboard", "/driver/"],
    ["Owner dashboard", "/owner/"],
    ["Track page", "/track/"],
    ["Favicon", "/favicon.ico"],
    ["Logo", "/logo.png"],
  ];

  for (const [name, path] of pages) {
    await fetchCheck(name, `${SITE_URL}${path}`);
  }

  console.log("\n— Customer-facing content —");

  // Holding page mode (SITE_OFFLINE) — accept either full homepage or offline page.
  let siteOffline = false;
  try {
    const homeResponse = await fetchRaw(`${SITE_URL}/`);
    if (homeResponse.status !== 200) {
      record("Homepage branding + quote", "fail", `HTTP ${homeResponse.status} — ${SITE_URL}/`);
    } else {
      const homeHtml = await homeResponse.text();
      siteOffline =
        homeHtml.includes("Temporarily offline") ||
        homeHtml.includes("temporarily offline for a short break");
      if (siteOffline) {
        const markers = ["My Airport Taxi", "Temporarily offline", "WhatsApp", "028 9602 2952"];
        const missing = markers.filter((snippet) => !homeHtml.includes(snippet));
        if (missing.length > 0) {
          record(
            "Homepage branding + quote",
            "fail",
            `Holding page missing: ${missing.join(", ")} — ${SITE_URL}/`,
          );
        } else {
          record(
            "Homepage branding + quote",
            "pass",
            `Holding page active (SITE_OFFLINE) — ${SITE_URL}/`,
          );
        }
      } else {
        const markers = ["My Airport Taxi", "Get a Quote", "WhatsApp"];
        const missing = markers.filter((snippet) => !homeHtml.includes(snippet));
        if (missing.length > 0) {
          record(
            "Homepage branding + quote",
            "fail",
            `Missing content: ${missing.join(", ")} — ${SITE_URL}/`,
          );
        } else {
          record("Homepage branding + quote", "pass", `Found ${markers.length} marker(s) — ${SITE_URL}/`);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record("Homepage branding + quote", "fail", `${message} — ${SITE_URL}/`);
  }

  if (siteOffline) {
    record(
      "Contact card markers",
      "pass",
      "Skipped while SITE_OFFLINE holding page is active",
    );
  } else {
    await pageContentCheck("Contact card markers", `${SITE_URL}/contact/`, [
      "My Airport Taxi",
      "Save to contacts",
      "Get a quote",
      "028 9602 2952",
    ]);
  }

  await fetchCheck("Contact QR image", `${SITE_URL}/contact-qr.png`);
  await fetchCheck("Contact photo image", `${SITE_URL}/contact-photo.jpg`);

  const vcardResponse = await fetchCheck(
    "Contact vCard file",
    `${SITE_URL}/my-airport-taxi-ni.vcf`,
  );
  if (vcardResponse) {
    const vcardText = await vcardResponse.text();
    if (vcardHasPhoto(vcardText)) {
      record("Contact vCard logo photo", "pass", "Live vCard embeds JPEG/JPG PHOTO");
    } else {
      record("Contact vCard logo photo", "fail", "Live vCard missing embedded PHOTO");
    }
  }
}

async function checkWebsiteApis() {
  console.log("\n— Website APIs (Cloudflare Worker) —");

  await fetchCheck("Worker contact vCard", `${WORKER_URL}/contact.vcf`);

  await jsonCheck("Addresses autocomplete API", `${WORKER_URL}/addresses?q=Donegall%20Place&airport=BFS`, {
    assert: (data) => {
      if (!data || typeof data !== "object") return "Expected addresses JSON";
      if (data.error) return `Addresses API error: ${data.error}`;
      if (!Array.isArray(data.suggestions)) return "Missing suggestions array";
      if (data.suggestions.length === 0) {
        const configured = data.configured
          ? ` configured=${JSON.stringify(data.configured)}`
          : "";
        return `No address suggestions returned${configured}`;
      }
      return true;
    },
  });

  await jsonCheck("Bookings API validation", `${WORKER_URL}/bookings`, {
    method: "POST",
    expectStatuses: [400],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assert: (data) =>
      data && typeof data === "object" && data.error
        ? true
        : "Expected validation error for empty booking",
  });

  await jsonCheck("Quote leads API validation", `${WORKER_URL}/quote-leads`, {
    method: "POST",
    expectStatuses: [400],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    assert: (data) =>
      data && typeof data === "object" && data.error
        ? true
        : "Expected validation error for empty quote lead",
  });

  await jsonCheck(
    "Flight lookup API",
    `${WORKER_URL}/flights?flight=BA1234&date=${RUN_DATE}&airport=BHD&direction=from-airport`,
    {
      expectStatuses: [200, 404, 503],
      assert: (data, status) => {
        if (!data || typeof data !== "object") return "Expected flight JSON";
        if (data.configured === false && status === 503) return true;
        if ("ok" in data || "error" in data || "flight" in data) return true;
        return "Unexpected flight response shape";
      },
      critical: false,
    },
  );
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`Daily website health check — ${RUN_DATE}`);
  console.log(`Site: ${SITE_URL}`);
  console.log(`Worker: ${WORKER_URL}`);

  await checkLiveWebsite();
  await checkWebsiteApis();

  console.log("\n— Auto-fixes —");
  tryFixSitemap();
  tryFixContactVcard();

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
    console.log("\nAll critical website checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
