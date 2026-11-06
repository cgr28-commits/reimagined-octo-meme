"use client";

/**
 * Find Your Driver — driver/owner side.
 *
 * DriverLocatorProvider lives at the top of the dashboard page so a sharing
 * session keeps running while the driver switches tabs or shows the Name Board
 * (the board is an overlay on this same page, so watchPosition stays alive).
 * iPhone still pauses GPS when the screen locks or Safari is backgrounded: we
 * show the age of the last update and resume as soon as the page is visible.
 *
 * Opt-in only: nothing is sent until the driver taps Start, and the server
 * re-checks eligibility on every upload.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { locatorApi } from "@/lib/driver-locator-api";
import { accuracyBand, locatorAirport, shouldSendFix, type LocatorFix } from "../../shared/driver-locator";

type SharingPhase = "starting" | "sharing" | "ended" | "error";

export type LocatorSession = {
  jobToken: string;
  phase: SharingPhase;
  /** Last fix the phone produced (sent or not). */
  lastFix: LocatorFix | null;
  /** Last time the server accepted or acknowledged an update. */
  lastAcceptedAt: number | null;
  withheldNearBase: boolean;
  message: string | null;
  permissionDenied: boolean;
};

type LocatorContextValue = {
  enabled: boolean;
  isOwner: boolean;
  session: LocatorSession | null;
  start: (jobToken: string) => Promise<boolean>;
  stop: (reason: "stopped" | "collected") => Promise<void>;
  resume: () => void;
  ownerKey: string | null;
  driverKey: string | null;
};

const LocatorContext = createContext<LocatorContextValue | null>(null);

export function useDriverLocator(): LocatorContextValue | null {
  return useContext(LocatorContext);
}

type WakeSentinel = { released: boolean; release: () => Promise<void> };

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : "over an hour ago";
}

export function DriverLocatorProvider({
  accessKey,
  role,
  children,
}: {
  accessKey: string | null;
  role: "owner" | "driver" | null;
  children: React.ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<LocatorSession | null>(null);
  const sessionRef = useRef<LocatorSession | null>(null);
  const watchRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const lastSentRef = useRef<LocatorFix | null>(null);
  const sendingRef = useRef(false);
  const backoffUntilRef = useRef(0);
  const wakeRef = useRef<WakeSentinel | null>(null);

  const update = useCallback((patch: Partial<LocatorSession> | null) => {
    if (patch === null) {
      sessionRef.current = null;
      setSession(null);
      return;
    }
    const next = { ...(sessionRef.current as LocatorSession), ...patch };
    sessionRef.current = next;
    setSession(next);
  }, []);

  // One probe per sign-in: hide every control unless the Worker has it switched on for this user.
  useEffect(() => {
    let cancelled = false;
    setEnabled(false);
    if (!accessKey || !role) return;
    void locatorApi.probe(accessKey).then((result) => {
      if (!cancelled) setEnabled(result.ok && result.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, [accessKey, role]);

  const stopWatching = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    lastSentRef.current = null;
    const wake = wakeRef.current;
    wakeRef.current = null;
    if (wake && !wake.released) void wake.release().catch(() => undefined);
  }, []);

  const send = useCallback(
    async (fix: LocatorFix, force = false) => {
      const current = sessionRef.current;
      if (!accessKey || !current || current.phase !== "sharing") return;
      update({ lastFix: fix });
      if (sendingRef.current || Date.now() < backoffUntilRef.current) return;
      if (!force && !shouldSendFix(lastSentRef.current, fix)) return;
      sendingRef.current = true;
      try {
        const result = await locatorApi.position(accessKey, current.jobToken, fix);
        if (sessionRef.current?.jobToken !== current.jobToken) return;
        if (result.ok) {
          lastSentRef.current = fix;
          update({ lastAcceptedAt: Date.now(), withheldNearBase: Boolean(result.withheld), message: null });
        } else if (result.httpStatus === 409 || result.httpStatus === 410 || result.httpStatus === 403) {
          // Collected, cancelled, window closed or no longer assigned: stop for good.
          stopWatching();
          update({ phase: "ended", message: result.error });
        } else {
          // Offline / limits: keep the latest fix only and try again shortly. Never backfill.
          backoffUntilRef.current = Date.now() + (result.httpStatus === 429 ? 30_000 : 10_000);
          update({ message: result.httpStatus === 0 ? "No signal — will retry automatically." : result.error });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [accessKey, stopWatching, update],
  );

  const onPosition = useCallback(
    (position: GeolocationPosition, force = false) => {
      void send(
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          at: Date.now(),
        },
        force,
      );
    },
    [send],
  );

  const onGeoError = useCallback(
    (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        const current = sessionRef.current;
        stopWatching();
        update({
          phase: "error",
          permissionDenied: true,
          message:
            "Location permission is off. On iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using the App, then tap Start again.",
        });
        if (accessKey && current) void locatorApi.stop(accessKey, current.jobToken, "stopped");
      } else {
        update({ message: "Waiting for a GPS signal…" });
      }
    },
    [accessKey, stopWatching, update],
  );

  const requestWake = useCallback(async () => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeSentinel> } };
    if (!nav.wakeLock?.request || (wakeRef.current && !wakeRef.current.released)) return;
    try {
      wakeRef.current = await nav.wakeLock.request("screen");
    } catch {
      // Not allowed here — the dashboard explains Auto-Lock instead.
    }
  }, []);

  const resume = useCallback(() => {
    if (sessionRef.current?.phase !== "sharing" || !navigator.geolocation) return;
    void requestWake();
    navigator.geolocation.getCurrentPosition((p) => onPosition(p, true), onGeoError, { ...GEO_OPTIONS, maximumAge: 0 });
  }, [onGeoError, onPosition, requestWake]);

  const start = useCallback(
    async (jobToken: string) => {
      if (!accessKey) return false;
      if (!navigator.geolocation) {
        update({ jobToken, phase: "error", lastFix: null, lastAcceptedAt: null, withheldNearBase: false, permissionDenied: false, message: "This browser has no GPS location." });
        return false;
      }
      if (sessionRef.current?.phase === "sharing" && sessionRef.current.jobToken !== jobToken) {
        await locatorApi.stop(accessKey, sessionRef.current.jobToken, "stopped");
      }
      stopWatching();
      update({ jobToken, phase: "starting", lastFix: null, lastAcceptedAt: null, withheldNearBase: false, permissionDenied: false, message: null });
      const started = await locatorApi.start(accessKey, jobToken);
      if (!started.ok) {
        update({ phase: "error", message: started.error });
        return false;
      }
      update({ phase: "sharing" });
      void requestWake();
      watchRef.current = navigator.geolocation.watchPosition((p) => onPosition(p), onGeoError, GEO_OPTIONS);
      // iPhone sends few fixes when stationary: ask for one if nothing went out for 30 s.
      heartbeatRef.current = window.setInterval(() => {
        const last = lastSentRef.current?.at ?? 0;
        if (document.visibilityState === "visible" && Date.now() - last >= 30_000) {
          navigator.geolocation.getCurrentPosition((p) => onPosition(p), onGeoError, { ...GEO_OPTIONS, maximumAge: 10_000 });
        }
      }, 10_000);
      return true;
    },
    [accessKey, onGeoError, onPosition, requestWake, stopWatching, update],
  );

  const stop = useCallback(
    async (reason: "stopped" | "collected") => {
      const current = sessionRef.current;
      stopWatching();
      if (!current) return;
      update({ phase: "ended", message: reason === "collected" ? "Passenger collected — sharing stopped." : "Sharing stopped." });
      if (accessKey) await locatorApi.stop(accessKey, current.jobToken, reason);
    },
    [accessKey, stopWatching, update],
  );

  // Coming back from a locked phone / another app: resume straight away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resume]);

  // Signing out (or losing the key) ends sharing.
  useEffect(() => {
    if (accessKey) return;
    stopWatching();
    update(null);
  }, [accessKey, stopWatching, update]);

  useEffect(() => () => stopWatching(), [stopWatching]);

  const value = useMemo<LocatorContextValue>(
    () => ({
      enabled,
      isOwner: role === "owner",
      session,
      start,
      stop,
      resume,
      ownerKey: role === "owner" ? accessKey : null,
      driverKey: accessKey,
    }),
    [accessKey, enabled, resume, role, session, start, stop],
  );

  return <LocatorContext.Provider value={value}>{children}</LocatorContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Shared status line                                                  */
/* ------------------------------------------------------------------ */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function sharingSummary(session: LocatorSession, now: number): { text: string; tone: "live" | "warn" | "off" } {
  if (session.phase === "starting") return { text: "Starting location sharing…", tone: "warn" };
  if (session.phase !== "sharing") return { text: session.message ?? "Not sharing", tone: "off" };
  if (!session.lastAcceptedAt) return { text: session.message ?? "Sharing on — waiting for the first GPS fix…", tone: "warn" };
  const age = now - session.lastAcceptedAt;
  const stale = age > 75_000;
  const accuracy = session.lastFix ? Math.round(session.lastFix.accuracy) : null;
  const band = accuracy !== null ? accuracyBand(accuracy) : null;
  const acc = accuracy !== null ? ` · ±${accuracy} m${band === "poor" ? " (poor — customer sees the meeting point)" : ""}` : "";
  if (session.withheldNearBase) return { text: `Sharing on · hidden near home base · ${formatAge(age)}`, tone: "live" };
  if (stale) {
    return {
      text: `Updates paused · last sent ${formatAge(age)}. Keep this page open and the screen on.`,
      tone: "warn",
    };
  }
  return { text: `Sharing live location · updated ${formatAge(age)}${acc}`, tone: "live" };
}

/** Small pill for the Name Board while sharing. Tap = resume (a user gesture iOS needs). */
export function LocatorBoardBadge() {
  const ctx = useDriverLocator();
  const live = ctx?.session?.phase === "sharing";
  const now = useNow(Boolean(live));
  if (!ctx?.session || ctx.session.phase !== "sharing") return null;
  const summary = sharingSummary(ctx.session, now);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        ctx.resume();
      }}
      data-testid="locator-board-badge"
      aria-label={`Location sharing: ${summary.text}. Tap to refresh.`}
      style={{
        border: 0,
        borderRadius: 999,
        padding: "0.3em 0.9em",
        font: "inherit",
        fontSize: "clamp(10px, 1.6vh, 13px)",
        fontWeight: 700,
        background: summary.tone === "live" ? "rgba(47,191,74,0.18)" : "rgba(255,190,60,0.22)",
        color: "inherit",
        cursor: "pointer",
        maxWidth: "90vw",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {summary.tone === "live" ? "● " : "⚠ "}
      {summary.text}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Job card controls                                                   */
/* ------------------------------------------------------------------ */

export function DriverLocatorControls({
  job,
  canOperate,
  onShowNameBoard,
}: {
  job: { token: string; customerName: string; isAirportPickup?: boolean; airportCode?: string | null };
  canOperate: boolean;
  onShowNameBoard: ((passengerName: string) => void) | null;
}) {
  const ctx = useDriverLocator();
  const mine = ctx?.session?.jobToken === job.token ? ctx.session : null;
  const sharing = mine?.phase === "sharing" || mine?.phase === "starting";
  const now = useNow(Boolean(sharing));
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!ctx?.enabled || !canOperate || !job.isAirportPickup || !locatorAirport(job.airportCode)) return null;

  const summary = mine ? sharingSummary(mine, now) : null;

  async function startSharing(withBoard: boolean) {
    if (!ctx) return;
    setBusy(true);
    const ok = await ctx.start(job.token);
    setBusy(false);
    if (ok && withBoard && onShowNameBoard) onShowNameBoard(job.customerName);
  }

  async function createLink() {
    if (!ctx?.ownerKey) return;
    setBusy(true);
    const result = await locatorApi.createLink(ctx.ownerKey, job.token, note);
    setBusy(false);
    if (result.ok) {
      setLink({ url: result.url, expiresAt: result.expiresAt });
      setLinkMessage("Link created. It is not sent anywhere automatically — copy it to the customer yourself.");
    } else {
      setLinkMessage(result.error);
    }
  }

  async function revokeLink() {
    if (!ctx?.ownerKey) return;
    setBusy(true);
    const result = await locatorApi.revokeLink(ctx.ownerKey, job.token);
    setBusy(false);
    setLink(null);
    setLinkMessage(result.ok ? "Customer link revoked — it no longer works." : result.error);
  }

  return (
    <section
      className={`mt-4 rounded-xl border p-3 ${sharing ? "border-emerald/60 bg-emerald/10" : "border-white/10 bg-white/[0.03]"}`}
      aria-label="Find Your Driver live location"
      data-testid="locator-controls"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Find Your Driver</p>
      {summary ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-1 text-sm font-semibold ${summary.tone === "live" ? "text-emerald" : summary.tone === "warn" ? "text-amber-200" : "text-white/70"}`}
          data-testid="locator-status"
        >
          {summary.tone === "live" ? "● " : ""}
          {summary.text}
        </p>
      ) : (
        <p className="mt-1 text-sm text-white/65">
          Off. Only shared when you tap Start, only for this collection, and stops when the passenger is collected.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!sharing ? (
          <>
            {onShowNameBoard ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void startSharing(true)}
                className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-bold text-navy disabled:opacity-60"
                data-testid="locator-start-board"
              >
                Start sharing + Name board
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void startSharing(false)}
              className="min-h-11 rounded-xl border border-emerald/50 px-4 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="locator-start"
            >
              Start sharing location
            </button>
          </>
        ) : (
          <>
            {onShowNameBoard ? (
              <button
                type="button"
                onClick={() => onShowNameBoard(job.customerName)}
                className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-bold text-navy"
              >
                Show name board
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void ctx.stop("collected")}
              className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white"
              data-testid="locator-collected"
            >
              Passenger collected
            </button>
            <button
              type="button"
              onClick={() => void ctx.stop("stopped")}
              className="min-h-11 rounded-xl border border-red-300/40 px-4 text-sm font-semibold text-red-100"
              data-testid="locator-stop"
            >
              Stop sharing
            </button>
          </>
        )}
      </div>

      {sharing ? (
        <p className="mt-2 text-xs text-white/55">
          Keep this page open with the screen on. iPhone pauses location when the phone locks or you switch
          app; the customer then sees your last update and its age, never a guessed position.
        </p>
      ) : null}

      {ctx.isOwner ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <label className="block text-xs font-semibold text-white/70" htmlFor={`locator-note-${job.token}`}>
            Meeting note for the customer (optional)
          </label>
          <input
            id={`locator-note-${job.token}`}
            value={note}
            maxLength={240}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. I'm beside the Costa in Arrivals"
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy-dark px-3 py-2 text-sm text-white"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createLink()}
              className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="locator-create-link"
            >
              {link ? "Replace customer link" : "Create customer link"}
            </button>
            {link ? (
              <>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(link.url).then(() => setLinkMessage("Copied."))}
                  className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white"
                >
                  Copy link
                </button>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 text-sm font-semibold text-white"
                >
                  View customer page
                </a>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void revokeLink()}
              className="min-h-11 rounded-xl border border-red-300/40 px-4 text-sm font-semibold text-red-100 disabled:opacity-60"
              data-testid="locator-revoke-link"
            >
              Revoke link
            </button>
          </div>
          {linkMessage ? (
            <p className="mt-2 text-xs text-white/70" role="status">
              {linkMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
