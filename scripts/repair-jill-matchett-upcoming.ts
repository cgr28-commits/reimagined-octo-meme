/**
 * Production repair: Jill Matchett Sunday 23 Aug 2026 11:30 only.
 *
 * Inspects paid booking + tracking KV, clears only erroneous finished/refunded
 * tracking fields when the paid booking is still live/confirmed, then verifies
 * Owner Dashboard APIs show her as upcoming (not completed).
 *
 * Env:
 *   OWNER_ACCESS_KEY (required)
 *   CLOUDFLARE_API_TOKEN (required for KV write)
 *   CLOUDFLARE_ACCOUNT_ID (optional; defaults to known account)
 *   TRACKING_STORE_NAMESPACE_ID (optional; defaults to production TRACKING_STORE)
 *   WORKER_BASE_URL (optional)
 *   DRY_RUN=1 (inspect only, no writes)
 */

import {
  isLivePaidBookingStatus,
  matchesJillMatchettTarget,
  planErroneousTrackingStatusRepair,
} from "../shared/repair-erroneous-tracking-status";

const WORKER_BASE =
  process.env.WORKER_BASE_URL?.trim() || "https://reimagined-octo-meme.cgr28.workers.dev";
const OWNER_KEY = process.env.OWNER_ACCESS_KEY?.trim() || "";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "36c5c88df4c1f0259413d555f2679f3c";
const NAMESPACE_ID =
  process.env.TRACKING_STORE_NAMESPACE_ID?.trim() || "53fa3cc2bd46436f90ae19200e599ea1";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const TARGET_DATE = "2026-08-23";

if (!OWNER_KEY) {
  console.error("OWNER_ACCESS_KEY is required");
  process.exit(1);
}
if (!CF_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required");
  process.exit(1);
}

function mask(value) {
  const s = String(value || "");
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

async function ownerFetch(path) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": OWNER_KEY,
    },
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function kvGet(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV GET ${key} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function kvPut(key, value, expirationTtl = 60 * 60 * 24 * 45) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/${encodeURIComponent(key)}?expiration_ttl=${expirationTtl}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV PUT ${key} failed: ${res.status} ${text}`);
  }
}

async function listOwnerBookings() {
  const paths = [
    `/api/paid-bookings?mode=upcoming&pastDays=7&futureDays=90&limit=200`,
    `/api/paid-bookings?mode=recent&days=60&limit=200`,
  ];
  const byRef = new Map();
  for (const path of paths) {
    const { res, body } = await ownerFetch(path);
    if (!res.ok) {
      throw new Error(`paid-bookings ${path} → ${res.status} ${JSON.stringify(body)}`);
    }
    for (const booking of body?.bookings || []) {
      if (booking?.paymentReference) byRef.set(booking.paymentReference, booking);
    }
  }
  return [...byRef.values()];
}

function summarizeBooking(b) {
  return {
    customerName: b.customerName,
    tripDate: b.tripDate,
    tripTime: b.tripTime,
    status: b.status,
    paymentStatus: b.paymentStatus,
    journeyStatus: b.journeyStatus,
    outboundJourneyStatus: b.outboundJourneyStatus,
    returnJourneyStatus: b.returnJourneyStatus,
    allLegsCompleted: b.allLegsCompleted,
    refundedAt: b.refundedAt ?? null,
    paymentReference: mask(b.paymentReference),
    trackingToken: b.trackingToken ? mask(b.trackingToken) : null,
  };
}

async function loadJobsForDay(tripDate) {
  const index = await kvGet(`track:day:${tripDate}`);
  const tokens = Array.isArray(index) ? index.map(String) : [];
  const jobs = [];
  for (const token of tokens) {
    const job = await kvGet(`track:job:${token}`);
    if (job && typeof job === "object") jobs.push(job);
  }
  return jobs;
}

async function loadJobsByPaymentRef(paymentReference) {
  const index = await kvGet(`track:ref:${paymentReference}`);
  let tokens = [];
  if (Array.isArray(index)) tokens = index.map(String);
  else if (typeof index === "string" && index.trim()) tokens = [index.trim()];
  const jobs = [];
  for (const token of tokens) {
    const job = await kvGet(`track:job:${token}`);
    if (job && typeof job === "object") jobs.push(job);
  }
  return jobs;
}

async function main() {
  console.log(DRY_RUN ? "DRY_RUN=1 — inspect only" : "LIVE repair — will write KV if needed");
  console.log(`Worker: ${WORKER_BASE}`);

  const bookings = await listOwnerBookings();
  const matches = bookings.filter((b) =>
    matchesJillMatchettTarget({
      customerName: b.customerName,
      tripDate: b.tripDate,
      tripTime: b.tripTime,
    }),
  );

  if (matches.length === 0) {
    // Fallback: day index may still have the job even if list filters oddly
    console.log("No Jill match in paid-bookings list — scanning track:day index…");
  } else if (matches.length > 1) {
    console.error("Multiple Jill Matchett 2026-08-23 11:30 matches — aborting");
    console.error(JSON.stringify(matches.map(summarizeBooking), null, 2));
    process.exit(1);
  }

  let target = matches[0] || null;
  const dayJobs = await loadJobsForDay(TARGET_DATE);
  const dayJill = dayJobs.filter((j) =>
    matchesJillMatchettTarget({
      customerName: j.customerName,
      tripDate: j.tripDate,
      tripTime: j.tripTime,
    }),
  );

  console.log("=== Owner API match ===");
  console.log(target ? JSON.stringify(summarizeBooking(target), null, 2) : "(none)");
  console.log("=== Day-index Jill jobs ===");
  console.log(
    JSON.stringify(
      dayJill.map((j) => ({
        token: mask(j.token),
        paymentReference: j.paymentReference ? mask(j.paymentReference) : null,
        journeyStatus: j.journeyStatus || "idle",
        journeyCompletedAt: j.journeyCompletedAt || null,
        refundedAt: j.refundedAt || null,
        pairedToken: j.pairedToken ? mask(j.pairedToken) : null,
        tripDate: j.tripDate,
        tripTime: j.tripTime,
      })),
      null,
      2,
    ),
  );

  if (!target && dayJill.length === 1 && dayJill[0].paymentReference) {
    const paid = await kvGet(`booking:ref:${dayJill[0].paymentReference}`);
    if (paid && typeof paid === "object") {
      target = {
        ...paid,
        journeyStatus: dayJill[0].journeyStatus,
        trackingToken: dayJill[0].token,
      };
      console.log("Reconstructed target from KV paid booking + day job");
      console.log(JSON.stringify(summarizeBooking(target), null, 2));
    }
  }

  if (!target?.paymentReference) {
    console.error("Could not uniquely identify Jill Matchett booking — aborting");
    process.exit(1);
  }

  const paymentReference = String(target.paymentReference).trim();
  const paidRecord = await kvGet(`booking:ref:${paymentReference}`);
  if (!paidRecord || typeof paidRecord !== "object") {
    console.error("Paid booking KV record missing — aborting");
    process.exit(1);
  }

  console.log("=== Paid booking KV (status fields) ===");
  console.log(
    JSON.stringify(
      {
        customerName: paidRecord.customerName,
        tripDate: paidRecord.tripDate,
        tripTime: paidRecord.tripTime,
        status: paidRecord.status,
        paymentStatus: paidRecord.paymentStatus,
        refundedAt: paidRecord.refundedAt || null,
        cancelledAt: paidRecord.cancelledAt || null,
        amountPaidLabel: paidRecord.amountPaidLabel || paidRecord.amountPaid || null,
        paymentReference: mask(paymentReference),
      },
      null,
      2,
    ),
  );

  if (!isLivePaidBookingStatus(paidRecord.status)) {
    console.error(
      `Paid booking status is ${paidRecord.status} — refusing to modify (not a live confirmed booking)`,
    );
    process.exit(1);
  }

  // Do not alter paid booking money/status — only tracking job finished markers.
  let jobs = await loadJobsByPaymentRef(paymentReference);
  if (jobs.length === 0 && target.trackingToken) {
    const one = await kvGet(`track:job:${target.trackingToken}`);
    if (one) jobs = [one];
  }
  // Include day-index matches for same payment ref
  for (const j of dayJill) {
    if (j.paymentReference?.trim() === paymentReference && !jobs.some((x) => x.token === j.token)) {
      jobs.push(j);
    }
  }

  if (jobs.length === 0) {
    console.error("No tracking jobs found for Jill payment reference — aborting");
    process.exit(1);
  }

  const repairs = [];
  for (const job of jobs) {
    let pairedJobPaymentReference = null;
    if (job.pairedToken?.trim()) {
      const paired = await kvGet(`track:job:${job.pairedToken.trim()}`);
      pairedJobPaymentReference = paired?.paymentReference || null;
    }
    const plan = planErroneousTrackingStatusRepair({
      job,
      paidBookingStatus: paidRecord.status,
      pairedJobPaymentReference,
      tripStillUpcoming: true,
    });
    repairs.push({ job, plan, pairedJobPaymentReference });
  }

  console.log("=== Repair plans ===");
  for (const { job, plan, pairedJobPaymentReference } of repairs) {
    console.log(
      JSON.stringify(
        {
          token: mask(job.token),
          before: {
            journeyStatus: job.journeyStatus || "idle",
            journeyCompletedAt: job.journeyCompletedAt || null,
            refundedAt: job.refundedAt || null,
            pairedToken: job.pairedToken ? mask(job.pairedToken) : null,
            pairedJobPaymentReference: pairedJobPaymentReference
              ? mask(pairedJobPaymentReference)
              : null,
          },
          shouldRepair: plan.shouldRepair,
          reasons: plan.reasons,
          clearedFields: plan.clearedFields,
          after: plan.shouldRepair
            ? {
                journeyStatus: plan.next.journeyStatus || "idle",
                journeyCompletedAt: plan.next.journeyCompletedAt || null,
                refundedAt: plan.next.refundedAt || null,
                pairedToken: plan.next.pairedToken ? mask(plan.next.pairedToken) : null,
              }
            : null,
        },
        null,
        2,
      ),
    );
  }

  const toWrite = repairs.filter((r) => r.plan.shouldRepair);
  if (toWrite.length === 0) {
    console.log("No erroneous tracking fields found on Jill's jobs.");
  } else if (DRY_RUN) {
    console.log(`DRY_RUN: would update ${toWrite.length} tracking job(s)`);
  } else {
    for (const { plan } of toWrite) {
      // Also clear reverse bad pairing on foreign job if it points back here
      await kvPut(`track:job:${plan.next.token}`, plan.next);
      console.log(`Updated track:job:${mask(plan.next.token)}`);
    }

    // If we cleared a foreign pairedToken on Jill, and the foreign job points back, clear it too
    for (const { job, plan, pairedJobPaymentReference } of toWrite) {
      if (
        plan.clearedFields.includes("pairedToken") &&
        job.pairedToken?.trim() &&
        pairedJobPaymentReference &&
        pairedJobPaymentReference !== paymentReference
      ) {
        const foreign = await kvGet(`track:job:${job.pairedToken.trim()}`);
        if (foreign?.pairedToken === job.token) {
          const cleaned = { ...foreign };
          delete cleaned.pairedToken;
          await kvPut(`track:job:${foreign.token}`, cleaned);
          console.log(
            `Cleared reverse pairedToken on foreign job ${mask(foreign.token)} (different payment ref)`,
          );
        }
      }
    }
  }

  // Verify via Owner API
  const afterList = await listOwnerBookings();
  const after = afterList.find(
    (b) =>
      b.paymentReference === paymentReference ||
      matchesJillMatchettTarget({
        customerName: b.customerName,
        tripDate: b.tripDate,
        tripTime: b.tripTime,
      }),
  );

  console.log("=== Post-repair Owner API ===");
  console.log(after ? JSON.stringify(summarizeBooking(after), null, 2) : "(Jill not in list)");

  if (!after) {
    console.error("Jill booking missing from Owner API after repair");
    process.exit(1);
  }
  if (!isLivePaidBookingStatus(after.status)) {
    console.error(`Paid status unexpectedly ${after.status}`);
    process.exit(1);
  }
  const journeyDone =
    after.journeyStatus === "completed" ||
    after.allLegsCompleted === true ||
    after.outboundJourneyStatus === "completed";
  if (journeyDone) {
    console.error("Jill still appears completed after repair");
    process.exit(1);
  }

  // Calendar/upcoming semantics: idle → Upcoming
  const calendarStatus =
    after.status === "refunded" || after.status === "cancelled"
      ? "refunded"
      : after.journeyStatus === "completed"
        ? "completed"
        : "upcoming";
  console.log(`Derived calendar status: ${calendarStatus}`);
  if (calendarStatus !== "upcoming") {
    console.error("Expected calendar status upcoming");
    process.exit(1);
  }

  console.log("OK — Jill Matchett remains paid/confirmed and appears UPCOMING (not completed).");
  console.log(
    "Changed fields:",
    toWrite.length
      ? toWrite.map((r) => ({ token: mask(r.job.token), cleared: r.plan.clearedFields }))
      : "(none — already clean)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
