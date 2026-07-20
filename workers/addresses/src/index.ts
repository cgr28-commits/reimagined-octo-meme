import {
  corsHeaders,
  resolveGooglePlace,
  reverseGeocodeGoogle,
  searchGooglePlaces,
  searchGoogleStreetAddresses,
  isStreetOnlyQuery,
} from "../../../shared/google-places";
import {
  resolveGetAddress,
  searchGetAddress,
} from "../../../shared/getaddress";

type Env = {
  GOOGLE_PLACES_API_KEY: string;
  GETADDRESS_API_KEY?: string;
};

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function routePath(pathname: string): "addresses" | "geocode" | null {
  if (pathname === "/addresses" || pathname === "/api/addresses") {
    return "addresses";
  }

  if (pathname === "/geocode" || pathname === "/api/geocode") {
    return "geocode";
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const route = routePath(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (request.method !== "GET" || !route) {
      return json({ error: "Not found" }, 404, origin);
    }

    if (!env.GOOGLE_PLACES_API_KEY && !env.GETADDRESS_API_KEY) {
      return json({ error: "Address lookup is not configured" }, 503, origin);
    }

    if (route === "geocode") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";

      if (!lat || !lon) {
        return json({ error: "Missing coordinates" }, 400, origin);
      }

      const latitude = Number(lat);
      const longitude = Number(lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return json({ error: "Invalid coordinates" }, 400, origin);
      }

      try {
        const address = await reverseGeocodeGoogle(
          env.GOOGLE_PLACES_API_KEY,
          latitude,
          longitude,
          airportCode,
        );

        if (!address) {
          return json({ error: "Location is outside the service area" }, 404, origin);
        }

        return json({ address, provider: "google" }, 200, origin);
      } catch {
        return json({ error: "Geocoding failed" }, 502, origin);
      }
    }

    const id = url.searchParams.get("id")?.trim();
    const query = url.searchParams.get("q")?.trim() ?? "";
    const airportCode = url.searchParams.get("airport")?.trim().toUpperCase() ?? "";
    const sessionToken = url.searchParams.get("session")?.trim() ?? undefined;

    if (id) {
      try {
        if (id.startsWith("ga:") && env.GETADDRESS_API_KEY) {
          const address = await resolveGetAddress(env.GETADDRESS_API_KEY, id, airportCode);
          if (!address) {
            return json({ error: "Address not found" }, 404, origin);
          }
          return json({ address, provider: "getaddress" }, 200, origin);
        }

        if (!env.GOOGLE_PLACES_API_KEY) {
          return json({ error: "Address lookup is not configured" }, 503, origin);
        }

        const address = await resolveGooglePlace(
          env.GOOGLE_PLACES_API_KEY,
          id,
          airportCode,
          sessionToken,
        );

        if (!address) {
          return json({ error: "Address not found" }, 404, origin);
        }

        return json({ address, provider: "google" }, 200, origin);
      } catch {
        return json({ error: "Address lookup failed" }, 502, origin);
      }
    }

    if (query.length < 3) {
      return json({ suggestions: [] }, 200, origin);
    }

    try {
      const suggestions: Awaited<ReturnType<typeof searchGooglePlaces>> = [];

      if (env.GETADDRESS_API_KEY && airportCode !== "DUB") {
        suggestions.push(...(await searchGetAddress(env.GETADDRESS_API_KEY, query, airportCode)));
      }

      if (env.GOOGLE_PLACES_API_KEY) {
        suggestions.push(
          ...(await searchGooglePlaces(
            env.GOOGLE_PLACES_API_KEY,
            query,
            airportCode,
            sessionToken,
          )),
        );

        if (isStreetOnlyQuery(query)) {
          suggestions.push(
            ...(await searchGoogleStreetAddresses(
              env.GOOGLE_PLACES_API_KEY,
              query,
              airportCode,
            )),
          );
        }
      }

      const seen = new Set<string>();
      const merged = suggestions.filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      return json(
        {
          suggestions: merged.slice(0, 8),
          provider: env.GETADDRESS_API_KEY ? "getaddress+google" : "google",
        },
        200,
        origin,
      );
    } catch {
      return json({ error: "Address lookup failed" }, 502, origin);
    }
  },
};
