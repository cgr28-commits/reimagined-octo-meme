/**
 * OSRM identifying headers + sequential fallback.
 * Public mirrors return 403 from Cloudflare Workers without User-Agent/Referer.
 *
 * Run: npx tsx scripts/check-osrm-identifying-headers.ts
 */
import assert from "node:assert/strict";
import {
  OSRM_REFERER,
  OSRM_USER_AGENT,
  buildOsrmFetchHeaders,
  fetchOsrmTripRouteMetrics,
  fetchRoadTripRouteMetrics,
  isOsrmServerRuntime,
  isRoadRouteMetrics,
  estimateTripRouteMetrics,
} from "../src/lib/trip-route";

const BHD = { lat: 54.6181, lng: -5.8724 };
const BFS = { lat: 54.6575, lng: -6.2158 };

type CapturedRequest = {
  url: string;
  headers: Record<string, string>;
};

function headerMap(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      out[key] = value;
    }
    return out;
  }
  for (const [key, value] of Object.entries(init)) {
    out[key] = value;
  }
  return out;
}

function osrmSuccessBody(distanceM = 18_500, durationS = 1_500) {
  return JSON.stringify({
    code: "Ok",
    routes: [{ distance: distanceM, duration: durationS }],
  });
}

async function withMockFetch<T>(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  fn: () => Promise<T>,
): Promise<{ result: T; calls: CapturedRequest[] }> {
  const realFetch = globalThis.fetch;
  const calls: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, headers: headerMap(init?.headers) });
    return handler(url, init);
  }) as typeof fetch;
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`OK  ${label}`))
    .catch((error) => {
      console.error(`FAIL  ${label}`);
      throw error;
    });
}

async function main() {
  await check("1. Node/Worker runtime is treated as server-side", () => {
    assert.equal(isOsrmServerRuntime(), true);
  });

  await check("2. Server headers include Accept, User-Agent, Referer", () => {
    const headers = buildOsrmFetchHeaders();
    assert.equal(headers.Accept, "application/json");
    assert.equal(headers["User-Agent"], OSRM_USER_AGENT);
    assert.equal(headers.Referer, OSRM_REFERER);
    assert.match(OSRM_USER_AGENT, /MyAirportTaxiNI\/1\.0/);
    assert.match(OSRM_USER_AGENT, /myairporttaxini\.co\.uk\/contact/);
    assert.equal(OSRM_REFERER, "https://www.myairporttaxini.co.uk/");
  });

  await check("3. Browser path must not set User-Agent (simulated)", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    try {
      assert.equal(isOsrmServerRuntime(), false);
      const headers = buildOsrmFetchHeaders();
      assert.equal(headers.Accept, "application/json");
      assert.equal(headers["User-Agent"], undefined);
      assert.equal(headers.Referer, undefined);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });

  await check("4. Server OSRM fetch sends identifying headers", async () => {
    const { result, calls } = await withMockFetch(
      () =>
        new Response(osrmSuccessBody(), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => fetchOsrmTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng),
    );
    assert.ok(result);
    assert.equal(result?.source, "osrm");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.Accept, "application/json");
    assert.equal(calls[0].headers["User-Agent"], OSRM_USER_AGENT);
    assert.equal(calls[0].headers.Referer, OSRM_REFERER);
    assert.match(calls[0].url, /router\.project-osrm\.org/);
  });

  await check("5. Browser OSRM fetch does not set User-Agent", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    try {
      const { calls } = await withMockFetch(
        () =>
          new Response(osrmSuccessBody(), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        () => fetchOsrmTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng),
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers.Accept, "application/json");
      assert.equal(calls[0].headers["User-Agent"], undefined);
      assert.equal(calls[0].headers.Referer, undefined);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });

  await check("6. Failed first OSRM host tries the second", async () => {
    const { result, calls } = await withMockFetch(async (url) => {
      if (url.includes("router.project-osrm.org")) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(osrmSuccessBody(19_200, 1_620), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }, () => fetchOsrmTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng));

    assert.ok(result);
    assert.equal(result?.source, "osrm");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /router\.project-osrm\.org/);
    assert.match(calls[1].url, /routing\.openstreetmap\.de/);
    assert.equal(calls[0].headers["User-Agent"], OSRM_USER_AGENT);
    assert.equal(calls[1].headers["User-Agent"], OSRM_USER_AGENT);
    assert.ok(Math.abs((result?.distanceKm ?? 0) - 19.2) < 0.001);
  });

  await check("7. Successful road route remains source osrm", async () => {
    const { result } = await withMockFetch(
      () =>
        new Response(osrmSuccessBody(21_000, 1_800), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      () => fetchRoadTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng),
    );
    assert.ok(result);
    assert.equal(result?.source, "osrm");
    assert.equal(isRoadRouteMetrics(result), true);
  });

  await check("8. Estimates are never accepted for pricing", () => {
    const estimate = estimateTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng);
    assert.ok(estimate);
    assert.equal(estimate?.source, "estimate");
    assert.equal(isRoadRouteMetrics(estimate), false);
  });

  await check("9. Both hosts 403 → null (no estimate invented)", async () => {
    const { result, calls } = await withMockFetch(
      () => new Response("Forbidden", { status: 403 }),
      () => fetchRoadTripRouteMetrics(BHD.lat, BHD.lng, BFS.lat, BFS.lng),
    );
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  });

  console.log("OK  OSRM identifying headers + fallback coverage");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
