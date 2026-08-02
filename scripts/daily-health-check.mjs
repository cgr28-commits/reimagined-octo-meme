/**
 * Daily site + worker health check for My Airport Taxi NI.
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

async function fetchCheck(name, url, options = {}) {
  const {
    expectStatus = 200,
    expectStatuses,
    method = "GET",
    body,
    headers,
    timeoutMs = 20_000,
  } = options;
  const allowed = expectStatuses ?? [expectStatus];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

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
      record(name, "warn", output.slice(0, 300));
      return false;
    }
    record(name, "fail", output.slice(0, 500));
    return false;
  }
}

function tryFixSitemap() {
  const sitemapPath = join(process.cwd(), "public", "sitemap.xml");
  const requiredPaths = ["/privacy/", "/driver/", "/track/demo/", "/terms/"];
  let content = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";
  const missing = requiredPaths.filter((path) => !content.includes(`${SITE_URL}${path}`));

  if (missing.length === 0) {
    return false;
  }

  try {
    execSync("node scripts/generate-sitemap.mjs", { stdio: "pipe" });
    content = readFileSync(sitemapPath, "utf8");
    const stillMissing = requiredPaths.filter((path) => !content.includes(`${SITE_URL}${path}`));

    if (stillMissing.length > 0) {
      // Patch sitemap directly if generator is behind
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

async function sendNotificationEmail(report) {
  if (!WEB3FORMS_KEY) {
    record("Email notification", "warn", "WEB3FORMS_ACCESS_KEY not set — skipped email");
    return;
  }

  const failed = checks.filter((c) => c.status === "fail");
  const fixed = checks.filter((c) => c.status === "fixed");
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

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`Daily health check — ${RUN_DATE}\n`);

  // --- Website ---
  await fetchCheck("Homepage", `${SITE_URL}/`);
  await fetchCheck("Terms page", `${SITE_URL}/terms/`);
  await fetchCheck("Privacy page", `${SITE_URL}/privacy/`);
  await fetchCheck("Driver page", `${SITE_URL}/driver/`);
  await fetchCheck("Track demo", `${SITE_URL}/track/demo/live/`);
  await fetchCheck("Favicon", `${SITE_URL}/favicon.ico`);

  // --- Worker API ---
  const calendar = await fetchCheck("Worker calendar-status", `${WORKER_URL}/calendar-status`);
  if (calendar) {
    const data = await calendar.json().catch(() => null);
    if (data && data.configured && !data.connected) {
      record("Google Calendar", "warn", data.reason ?? "Calendar configured but not connected");
    } else if (data?.connected) {
      record("Google Calendar", "pass", "Connected");
    } else if (data && !data.configured) {
      record("Google Calendar", "warn", "Calendar secrets not configured on worker");
    }
  }

  await fetchCheck("Worker tracking API", `${WORKER_URL}/track/sharing`, {
    method: "POST",
    expectStatuses: [400, 404],
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "health-check-invalid", active: true }),
  });

  await fetchCheck("Worker track lookup", `${WORKER_URL}/track/health-check-invalid-token`, {
    expectStatus: 404,
  });

  // --- Repo / build ---
  if (process.env.HEALTH_CHECK_SKIP_BUILD !== "1") {
    runCommand("Worker typecheck", "npm --prefix workers/addresses run typecheck");
    runCommand("Site build", "npm run build");
  } else {
    record("Site build", "warn", "Skipped (HEALTH_CHECK_SKIP_BUILD=1)");
  }

  // --- Auto-fixes ---
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

  await sendNotificationEmail(report);

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
