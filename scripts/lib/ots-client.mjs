const OTS_AJAX = "https://onwardtravelsolutions.com/wp-admin/admin-ajax.php";

const DEFAULT_DELAY_MS = 250;
const MAX_RETRIES = 3;

let cachedNonce = null;
let nonceFetchedAt = 0;
const NONCE_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshOtsNonce() {
  const body = new URLSearchParams({ action: "otb_refresh_nonce" });
  const res = await fetch(OTS_AJAX, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`OTS nonce request failed (${res.status})`);
  }

  const json = await res.json();
  if (!json?.data?.nonce) {
    throw new Error("OTS nonce missing from response");
  }

  cachedNonce = json.data.nonce;
  nonceFetchedAt = Date.now();
  return cachedNonce;
}

async function getNonce() {
  if (cachedNonce && Date.now() - nonceFetchedAt < NONCE_TTL_MS) {
    return cachedNonce;
  }
  return refreshOtsNonce();
}

export async function fetchOtsEstateQuote(pickup, dropoff, options = {}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const pickupDatetime =
    options.pickupDatetime ?? `${new Date().toISOString().slice(0, 10)}T10:00`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const nonce = await getNonce();
      const body = new URLSearchParams({
        action: "otb_get_quote",
        nonce,
        pickup,
        dropoff,
        pickup_datetime: pickupDatetime,
        passengers: "2",
        luggage: "2",
        hand_luggage: "0",
        is_return: "0",
        extra_stops_count: "0",
        extra_stops: "[]",
      });

      const res = await fetch(OTS_AJAX, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        throw new Error(`OTS quote request failed (${res.status})`);
      }

      const json = await res.json();
      if (!json.success) {
        const message = json.data?.message ?? "OTS quote failed";
        if (/nonce/i.test(message) && attempt < MAX_RETRIES) {
          cachedNonce = null;
          await sleep(delayMs);
          continue;
        }
        throw new Error(message);
      }

      const estate = json.data.vehicles.find((vehicle) => /estate/i.test(vehicle.name));
      if (!estate?.price) {
        throw new Error("OTS estate price missing");
      }

      await sleep(delayMs);
      return estate.price;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        cachedNonce = null;
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError ?? new Error("OTS quote failed");
}
