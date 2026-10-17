"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import {
  readMeasurementConsent,
  writeCookieConsent,
  flushConsentWithdrawals,
  clearOptionalMeasurementStorage,
  hasPendingConsentWithdrawals,
} from "@/lib/cookie-consent";
import { stopMeasurementAndReload } from "@/lib/measurement-shutdown";
export default function CookieConsent() {
  const banner = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [advertising, setAdvertising] = useState(false),
    [analytics, setAnalytics] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = readMeasurementConsent();
    setOpen(!c);
    setAdvertising(c?.advertising === true);
    setAnalytics(c?.analytics === true);
    if (!c) clearOptionalMeasurementStorage();
    const pendingMessage = "Your choice is saved on this device. Optional tracking is stopped. Server withdrawal is pending and will retry when you reconnect.";
    const retry = () => {
      if (hasPendingConsentWithdrawals()) { setOpen(true); setMessage(pendingMessage); }
      void flushConsentWithdrawals().then((synced) => {
        if (synced) setMessage("");
        else { setOpen(true); setMessage(pendingMessage); }
      });
    };
    retry();
    const show = () => {
      const latest = readMeasurementConsent();
      setAdvertising(latest?.advertising === true);
      setAnalytics(latest?.analytics === true);
      setOpen(true);
    };
    window.addEventListener("matni-open-cookie-settings", show);
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("matni-open-cookie-settings", show);
      window.removeEventListener("online", retry);
    };
  }, []);
  useEffect(() => {
    const el = banner.current;
    if (!open || !el) {
      document.documentElement.style.removeProperty(
        "--matni-cookie-banner-offset",
      );
      return;
    }
    const sync = () =>
      document.documentElement.style.setProperty(
        "--matni-cookie-banner-offset",
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    sync();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty(
        "--matni-cookie-banner-offset",
      );
    };
  }, [open]);
  async function save(ads: boolean, stats: boolean) {
    const previous = readMeasurementConsent();
    setAdvertising(ads);
    setAnalytics(stats);
    const saved = writeCookieConsent(ads ? "accepted" : "rejected", stats);
    const reduced = (previous?.advertising && !ads) || (previous?.analytics && !stats);
    if (reduced || (!saved && (previous?.advertising || previous?.analytics))) {
      setMessage("Optional tracking is stopped. Withdrawal synchronisation will retry when you reconnect.");
      stopMeasurementAndReload();
      return;
    }
    if (!saved) {
      setMessage("Optional measurement is off on this page. Your browser could not save your choice; enable site storage and retry before leaving.");
      return;
    }
    setAdvertising(ads);
    setAnalytics(stats);
    const synced = await flushConsentWithdrawals();
    if (!synced) {
      setMessage(
        "Your choice is saved on this device. Optional tracking is stopped. Server withdrawal is pending and will retry when you reconnect.",
      );
      return;
    }
    setOpen(false);
    setMessage("");
  }
  if (!open) return null;
  return (
    <div
      ref={banner}
      role="dialog"
      aria-label="Cookie settings"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/20 bg-navy-dark p-4 text-white shadow-xl"
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="font-semibold">Cookies &amp; privacy</h2>
        <p className="my-2 text-sm">
          Essential storage keeps quotes and payments working. Optional
          measurement is off until you choose. You can change this anytime in
          Cookie Settings.
        </p>
        <label className="my-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={advertising}
            onChange={(e) => setAdvertising(e.target.checked)}
          />
          Advertising measurement — campaign attribution, Google Ads conversions
          and advertising-abuse monitoring.
        </label>
        <label className="my-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={analytics}
            onChange={(e) => setAnalytics(e.target.checked)}
          />
          Website analytics — optional quote-tool diagnostics. No personalised
          advertising.
        </label>
        <p className="text-sm">
          <Link href="/privacy/" className="underline">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/cookies/" className="underline">
            Cookie Policy
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="btn-secondary"
            onClick={() => void save(false, false)}
          >
            Essential only
          </button>
          <button
            className="btn-primary"
            onClick={() => void save(advertising, analytics)}
          >
            Save choices
          </button>
          <button
            className="btn-secondary"
            onClick={() => void save(true, true)}
          >
            Accept measurement
          </button>
        </div>
        {message && (
          <p role="status" className="mt-2 text-sm">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
