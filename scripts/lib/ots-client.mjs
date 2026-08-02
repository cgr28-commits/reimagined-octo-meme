/** Live OTS quotes from https://www.airporttaxis-uk.co.uk/ (Onward Travel Solutions). */
const OTS_QUOTE_URL = "https://www.airporttaxis-uk.co.uk/";
const OTS_USER_AGENT =
  "Mozilla/5.0 (compatible; MyAirportTaxiNI/1.0; +https://www.myairporttaxini.co.uk)";

const DEFAULT_DELAY_MS = 250;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEstateOneWayPrice(html) {
  const estateSection = html.match(/<h2>\s*Estate Car\s*<\/h2>[\s\S]*?(?=<div class="group vehicle">|<\/form>)/i);
  if (!estateSection) {
    throw new Error("OTS estate vehicle section missing from quote page");
  }

  const oneWayMatch = estateSection[0].match(
    /<label[^>]*class=["']single["'][\s\S]*?&pound;(\d+(?:\.\d{2})?)/i,
  );
  if (!oneWayMatch) {
    throw new Error("OTS estate one-way price missing from quote page");
  }

  return Number(oneWayMatch[1]);
}

export async function fetchOtsEstateQuote(pickup, dropoff, options = {}) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = new URLSearchParams();
      body.append("waypoints[]", pickup);
      body.append("waypoints[]", dropoff);
      body.append("action", "Quote Now");

      const res = await fetch(OTS_QUOTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OTS_USER_AGENT,
          Referer: OTS_QUOTE_URL,
        },
        body,
        redirect: "follow",
      });

      if (!res.ok) {
        throw new Error(`OTS quote request failed (${res.status})`);
      }

      const html = await res.text();
      const price = parseEstateOneWayPrice(html);

      await sleep(delayMs);
      return price;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError ?? new Error("OTS quote failed");
}
