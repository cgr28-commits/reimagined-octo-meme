/**
 * Christmas video viewing figures — anonymous counters (no cookies, ids or personal data).
 * Each call adds 1 to today's total for that event on the Owner Dashboard → Marketing.
 * Fire-and-forget: never blocks or breaks the page.
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { ChristmasVideoEvent } from "../../shared/christmas-video-stats";

const WORKER_BASE = resolveWorkerBaseUrl();
const sentThisPage = new Set<string>();

export function trackChristmasVideo(event: ChristmasVideoEvent, { oncePerPage = true } = {}): void {
  if (typeof window === "undefined") return;
  if (oncePerPage && sentThisPage.has(event)) return;
  sentThisPage.add(event);
  try {
    // text/plain keeps this a "simple" request (no CORS preflight); keepalive survives navigation.
    void fetch(`${WORKER_BASE}/christmas-video/event`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ event }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    // ignore
  }
}
