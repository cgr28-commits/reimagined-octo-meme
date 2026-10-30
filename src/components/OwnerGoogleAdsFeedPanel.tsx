"use client";

/**
 * Owner dashboard: the daily booking file Google Ads collects (Goals → Conversions → Uploads →
 * Schedules → HTTPS). Shows the address, username and password to paste into Google Ads.
 */
import { useCallback, useEffect, useState } from "react";
import { ownerInboxFetch } from "@/lib/owner-inbox-api";

type FeedInfo = {
  url: string;
  username: string;
  password: string;
  conversionName: string;
  lookbackDays: number;
  rows: number;
  lastFetchedAt: string | null;
};

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/55">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-sm text-white">{shown ? value : "••••••••••••"}</code>
        {secret ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80"
          >
            {shown ? "Hide" : "Show"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-lg bg-emerald px-3 py-1.5 text-xs font-bold text-navy"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function OwnerGoogleAdsFeedPanel({ ownerKey }: { ownerKey: string }) {
  const [info, setInfo] = useState<FeedInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (rotate = false) => {
      setBusy(true);
      setError(null);
      try {
        const next = rotate
          ? await ownerInboxFetch<FeedInfo>(ownerKey, "/owner/ads-feed/rotate", {})
          : await ownerInboxFetch<FeedInfo>(ownerKey, "/owner/ads-feed");
        setInfo(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the Google Ads file");
      } finally {
        setBusy(false);
      }
    },
    [ownerKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-navy-light/40 p-4 text-white sm:p-5">
      <div>
        <h2 className="text-lg font-bold">Google Ads booking upload</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/75">
          Google Ads collects this file once a day and counts paid bookings from customers who clicked an ad and
          accepted cookies. It is recorded under the conversion action{" "}
          <strong>{info?.conversionName ?? "PAID BOOKING-SERVER"}</strong>.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p> : null}

      {info ? (
        <>
          <CopyRow label="File address (HTTPS)" value={info.url} />
          <CopyRow label="Username" value={info.username} />
          <CopyRow label="Password" value={info.password} secret />
          <p className="text-sm text-white/75">
            Bookings in the file now: <strong>{info.rows}</strong> (last {info.lookbackDays} days).{" "}
            {info.lastFetchedAt
              ? `Google Ads last collected it ${new Date(info.lastFetchedAt).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}.`
              : "Google Ads has not collected it yet."}
          </p>
          <details className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            <summary className="cursor-pointer font-semibold text-white">How to set it up in Google Ads</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Google Ads → Goals → Conversions → Uploads.</li>
              <li>Click Schedules, then the + button.</li>
              <li>Source: HTTPS. Paste the file address, username and password above.</li>
              <li>Frequency: daily. Save and preview.</li>
            </ol>
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Make a new password? You will need to update it in the Google Ads schedule.")) {
                void load(true);
              }
            }}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/80 disabled:opacity-50"
          >
            Make a new password
          </button>
        </>
      ) : !error ? (
        <p className="text-sm text-white/70">Loading…</p>
      ) : null}
    </section>
  );
}
