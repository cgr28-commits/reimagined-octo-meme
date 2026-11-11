/**
 * Build-time list of approved Belfast events, so the Events hub is crawlable.
 * The browser then loads the live list from the Worker (hybrid publishing), so
 * newly approved events and cancellations show without a site rebuild.
 *
 * Order: live Worker (only when the public pages are enabled, 4s timeout) →
 * committed snapshot (src/data/belfast-events-snapshot.json). A Worker outage
 * never breaks the build.
 */
import snapshot from "@/data/belfast-events-snapshot.json";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { BESPOKE_PUBLIC_PAGES_ENABLED } from "@/lib/bespoke-public";
import { sortBelfastEvents, todayInLondon, type BelfastEventPublic } from "../../shared/belfast-events";

function upcoming(events: BelfastEventPublic[]): BelfastEventPublic[] {
  const today = todayInLondon();
  return sortBelfastEvents(events.filter((e) => e.date >= today));
}

export async function loadBuildTimeBelfastEvents(): Promise<BelfastEventPublic[]> {
  const fallback = upcoming((snapshot as { events: BelfastEventPublic[] }).events ?? []);
  if (!BESPOKE_PUBLIC_PAGES_ENABLED) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${resolveWorkerBaseUrl()}/events/public`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { events?: BelfastEventPublic[] };
    return Array.isArray(data.events) ? upcoming(data.events) : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
