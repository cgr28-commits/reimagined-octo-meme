/**
 * Resend the latest paid booking confirmation via the live worker.
 * Uses OWNER_ACCESS_KEY from the environment (GitHub Actions secrets).
 *
 * Run locally (with secrets):
 *   OWNER_ACCESS_KEY=... node scripts/resend-latest-paid-confirmation.mjs
 */

const WORKER_BASE =
  process.env.WORKER_BASE_URL?.trim() || "https://reimagined-octo-meme.cgr28.workers.dev";
const OWNER_KEY = process.env.OWNER_ACCESS_KEY?.trim() || "";
const PAYMENT_REFERENCE = process.env.PAYMENT_REFERENCE?.trim() || "";

if (!OWNER_KEY) {
  console.error("OWNER_ACCESS_KEY is required");
  process.exit(1);
}

async function main() {
  const listUrl = `${WORKER_BASE}/api/paid-bookings?days=14&limit=10`;
  const listRes = await fetch(listUrl, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": OWNER_KEY,
    },
  });
  const listBody = await listRes.json().catch(() => null);
  console.log("List status", listRes.status);
  console.log(JSON.stringify(listBody, null, 2));

  if (!listRes.ok) {
    process.exit(1);
  }

  const resendRes = await fetch(`${WORKER_BASE}/api/paid-bookings/resend-confirmation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": OWNER_KEY,
    },
    body: JSON.stringify(
      PAYMENT_REFERENCE
        ? { paymentReference: PAYMENT_REFERENCE }
        : { latest: true },
    ),
  });
  const resendBody = await resendRes.json().catch(() => null);
  console.log("Resend status", resendRes.status);
  console.log(JSON.stringify(resendBody, null, 2));

  if (!resendRes.ok || !resendBody?.customerEmailSent) {
    process.exit(1);
  }

  if (!resendBody?.ownerEmailSent && !resendBody?.bookingsCopySent) {
    console.error("Customer email sent, but bookings@ copy failed");
    process.exit(1);
  }

  console.log(
    "OK resent to",
    resendBody.customerEmail,
    "and bookings@ copy:",
    Boolean(resendBody.bookingsCopySent || resendBody.ownerEmailSent),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
