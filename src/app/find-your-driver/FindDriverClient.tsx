"use client";

/**
 * Find Your Driver — customer page. No login, no app.
 *
 * The link secret arrives in the URL fragment; a beforeInteractive script in
 * the root layout moves it into this tab's sessionStorage and clears the
 * address bar before analytics run. It is sent only in a POST body to the
 * Worker, never in a URL.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { locatorApi } from "@/lib/driver-locator-api";
import {
  LOCATOR_FRAGMENT_STORAGE_KEY,
  LOCATOR_PRIVACY_NOTICE,
  parseLinkFragment,
  type CustomerLocatorView,
} from "../../../shared/driver-locator";
import { BUSINESS_LANDLINE_DISPLAY, BUSINESS_LANDLINE_TEL, businessWhatsAppChatUrl } from "../../../shared/business-email";

const FindDriverMap = dynamic(() => import("@/components/FindDriverMap"), {
  ssr: false,
  loading: () => <div style={{ height: "min(52vh, 420px)", borderRadius: 16, background: "rgba(255,255,255,0.05)" }} />,
});

type PageState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "down"; message: string }
  | { kind: "ready"; view: CustomerLocatorView; receivedAt: number; notice: string | null };

function readLink(): string | null {
  // Prefer a fragment still in the address bar (if the strip script didn't run), else this tab's copy.
  const fromHash = parseLinkFragment(typeof window !== "undefined" ? window.location.hash : "");
  if (fromHash) {
    const value = `${fromHash.objectId}.${fromHash.secret}`;
    try {
      window.sessionStorage.setItem(LOCATOR_FRAGMENT_STORAGE_KEY, value);
    } catch {
      // private mode: keep it in memory only
    }
    window.history.replaceState(window.history.state, "", window.location.pathname);
    return value;
  }
  try {
    const stored = window.sessionStorage.getItem(LOCATOR_FRAGMENT_STORAGE_KEY);
    return parseLinkFragment(stored) ? stored : null;
  } catch {
    return null;
  }
}

function ageText(seconds: number): string {
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const m = Math.floor(seconds / 60);
  return m === 1 ? "1 minute ago" : `${m} minutes ago`;
}

const STATUS_COPY: Record<CustomerLocatorView["status"], { title: string; detail: string }> = {
  waiting: {
    title: "Your driver hasn't started sharing yet",
    detail: "Location appears here once your driver starts sharing for your collection. Meanwhile, please use the meeting point below.",
  },
  sharing: { title: "Sharing live location", detail: "Approximate position from your driver's phone." },
  on_the_way: {
    title: "On the way to the airport",
    detail: "Your driver is sharing but isn't near the airport yet, so the map shows the airport only.",
  },
  stale: {
    title: "Location updates have paused",
    detail: "The grey dot is the last known location, not a live position. Please go to the meeting point below.",
  },
  unavailable: {
    title: "Live location isn't available right now",
    detail: "Please use the meeting point below. GPS is often unreliable inside and near terminal buildings.",
  },
  collected: { title: "Collection complete", detail: "Your driver has finished this collection. Location sharing has ended." },
  cancelled: { title: "This booking was cancelled", detail: "Location sharing is not available for this booking." },
  expired: { title: "This link has expired", detail: "Location sharing has ended for this collection." },
};

export default function FindDriverClient() {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const linkRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const link = linkRef.current;
    if (!link) {
      setState({ kind: "invalid" });
      return;
    }
    const result = await locatorApi.view(link);
    let nextDelay = 15_000;
    if (result.ok) {
      setState({ kind: "ready", view: result, receivedAt: Date.now(), notice: null });
      nextDelay = result.pollAfterMs;
    } else if (result.httpStatus === 404) {
      setState({ kind: "invalid" });
      return;
    } else {
      // Offline, rate limited or service limits reached: keep what we had, mark it, fall back to the meeting point.
      nextDelay = result.httpStatus === 429 ? 30_000 : 20_000;
      setState((current) =>
        current.kind === "ready"
          ? { ...current, notice: result.httpStatus === 0 ? "No connection — retrying." : "Live location is temporarily unavailable — retrying." }
          : {
              kind: "down",
              message:
                result.httpStatus === 0
                  ? "No connection right now — retrying."
                  : "Live location is temporarily unavailable — retrying.",
            },
      );
    }
    if (nextDelay > 0 && document.visibilityState === "visible") {
      timerRef.current = window.setTimeout(() => void load(), nextDelay);
    }
  }, []);

  useEffect(() => {
    linkRef.current = readLink();
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
      else if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(tick);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [load]);

  const whatsapp = businessWhatsAppChatUrl("Hi, I'm at the airport and looking for my driver.");

  return (
    <main className="min-h-screen bg-navy px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] text-white">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex items-center gap-3 border-b-2 border-emerald pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/name-board-emblem-dark.png" alt="" aria-hidden="true" width={72} height={34} />
          <span className="text-sm font-extrabold tracking-[0.14em]">
            MY AIRPORT TAXI <span className="text-emerald">NI</span>
          </span>
        </header>

        <h1 className="mt-5 text-2xl font-bold">Find Your Driver</h1>

        {state.kind === "loading" ? (
          <p className="mt-4 text-white/70" role="status">
            Loading…
          </p>
        ) : null}

        {state.kind === "invalid" ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid="find-driver-invalid">
            <p className="font-semibold">This link is not valid or has expired.</p>
            <p className="mt-2 text-sm text-white/70">
              Please use the meeting point in your booking emails, or contact us below.
            </p>
          </div>
        ) : null}

        {state.kind === "down" ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid="find-driver-down" role="status">
            <p className="font-semibold">{state.message}</p>
            <p className="mt-2 text-sm text-white/70">
              Please go to the meeting point in your booking emails. We&rsquo;ll keep trying while this page is open.
            </p>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <ReadyView view={state.view} receivedAt={state.receivedAt} now={now} notice={state.notice} />
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald px-4 font-bold text-navy"
          >
            Message us on WhatsApp
          </a>
          <a
            href={`tel:${BUSINESS_LANDLINE_TEL}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 px-4 font-semibold"
          >
            Call {BUSINESS_LANDLINE_DISPLAY}
          </a>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-white/55" data-testid="find-driver-privacy">
          {LOCATOR_PRIVACY_NOTICE}{" "}
          <a href="/privacy/" className="underline">
            Privacy policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}

function ReadyView({
  view,
  receivedAt,
  now,
  notice,
}: {
  view: CustomerLocatorView;
  receivedAt: number;
  now: number;
  notice: string | null;
}) {
  const copy = STATUS_COPY[view.status];
  const position = view.position;
  // Age keeps counting between refreshes; it never pretends to be fresher than it is.
  const ageSeconds = position ? position.ageSeconds + Math.max(0, Math.round((now - receivedAt) / 1000)) : 0;
  const stale = position ? position.lastKnown || ageSeconds > 75 : false;
  const finished = view.status === "collected" || view.status === "cancelled" || view.status === "expired";
  const showMap = !finished && (view.status === "sharing" || view.status === "stale" || view.status === "on_the_way");

  return (
    <>
      <section
        className={`mt-4 rounded-2xl border p-4 ${view.status === "sharing" && !stale ? "border-emerald/50 bg-emerald/10" : "border-white/10 bg-white/[0.04]"}`}
        aria-live="polite"
        data-testid="find-driver-status"
        data-status={stale && view.status === "sharing" ? "stale" : view.status}
      >
        <p className="text-sm text-white/65">Driver: {view.driverName}</p>
        <p className="mt-1 text-lg font-bold">{stale && view.status === "sharing" ? STATUS_COPY.stale.title : copy.title}</p>
        <p className="mt-1 text-sm text-white/75">{stale && view.status === "sharing" ? STATUS_COPY.stale.detail : copy.detail}</p>
        {position ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-white/55">{stale ? "Last known location" : "Last updated"}</dt>
              <dd className="font-semibold" data-testid="find-driver-age">
                {ageText(ageSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-white/55">GPS accuracy</dt>
              <dd className="font-semibold" data-testid="find-driver-accuracy">
                ±{position.accuracyM} m {position.band === "good" ? "(good)" : position.band === "approximate" ? "(approximate)" : "(poor)"}
              </dd>
            </div>
          </dl>
        ) : null}
        {position && position.band !== "good" ? (
          <p className="mt-2 text-sm font-semibold text-amber-200" data-testid="find-driver-approx-warning">
            This position is approximate. Use the meeting point below rather than walking to the dot.
          </p>
        ) : null}
        {notice ? (
          <p className="mt-2 text-sm text-amber-200" role="status">
            {notice}
          </p>
        ) : null}
      </section>

      {showMap ? (
        <div className="mt-4">
          <FindDriverMap
            airport={view.airport}
            driver={position ? { lat: position.lat, lng: position.lng, accuracyM: position.accuracyM, lastKnown: stale } : null}
          />
          <p className="mt-2 text-xs text-white/55">
            Green dot: your driver&rsquo;s reported position{stale ? " (grey = last known, not live)" : ""}. The circle shows
            GPS accuracy. Navy square: the airport. Positions inside terminals can be out by hundreds of metres; we
            don&rsquo;t provide indoor directions.
          </p>
        </div>
      ) : null}

      {!finished ? (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid="find-driver-meeting">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Meeting point · {view.airport.name}</p>
          <p className="mt-2 font-semibold">{view.meetingInstruction}</p>
          {view.meetingNote ? <p className="mt-2 text-sm text-white/80">Note from us: {view.meetingNote}</p> : null}
          {view.meetingMapImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.meetingMapImage}
              alt={`Map of the pick-up area at ${view.airport.name}`}
              className="mt-3 w-full rounded-xl"
              loading="lazy"
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
