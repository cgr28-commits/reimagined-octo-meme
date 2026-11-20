"use client";

import { useEffect, useState } from "react";
import { DEFAULT_GOOGLE_REVIEW_URL } from "../../shared/google-business-profile";
import type { BookingSettings } from "@/lib/short-notice-api";
import { updatePostJourneyRequestSettings } from "@/lib/short-notice-api";

type Draft = {
  tipRequestsEnabled: boolean;
  googleReviewRequestsEnabled: boolean;
  delayHours: number;
  googleReviewUrl: string;
};

type Props = {
  ownerKey: string;
  settings: BookingSettings | null;
  onSaved: (settings: BookingSettings) => void;
  fieldClass: string;
};

function draftFromSettings(settings: BookingSettings | null): Draft {
  const saved = settings?.postJourneyRequests;
  return {
    tipRequestsEnabled: saved?.tipRequestsEnabled === true,
    googleReviewRequestsEnabled: saved ? saved.googleReviewRequestsEnabled !== false : true,
    delayHours: typeof saved?.delayHours === "number" ? saved.delayHours : 2,
    googleReviewUrl: saved?.googleReviewUrl?.trim() || DEFAULT_GOOGLE_REVIEW_URL,
  };
}

/** Owner controls for the tip message and the single Google review invitation. */
export default function OwnerPostJourneyRequestSettings({ ownerKey, settings, onSaved, fieldClass }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFromSettings(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(draftFromSettings(settings));
  }, [settings]);

  async function save(next: Draft) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await updatePostJourneyRequestSettings(ownerKey, next);
      onSaved(saved);
      setMessage("Post-journey settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save post-journey settings");
    } finally {
      setSaving(false);
    }
  }

  const loaded = settings != null;

  return (
    <div className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] p-3 sm:p-4" data-owner-post-journey-requests>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">After the journey</p>
      <h3 className="mt-1 text-lg font-bold text-white">Post-journey requests</h3>
      <p className="mt-1 text-sm text-white/65">
        These switches only control the follow-up messages. Fares, discounts, booking confirmations, and the tip payment page stay as they are.
      </p>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">Tip request</p>
          <p className="mt-1 text-sm text-white/65">
            When this is off, customers are not sent a tip link. A tip can still be paid if they already have one.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.tipRequestsEnabled}
          aria-label="Tip request"
          disabled={saving || !loaded}
          onClick={() => {
            const next = { ...draft, tipRequestsEnabled: !draft.tipRequestsEnabled };
            setDraft(next);
            void save(next);
          }}
          className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            draft.tipRequestsEnabled ? "bg-emerald" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              draft.tipRequestsEnabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-white/80">
        {!loaded ? "Loading…" : draft.tipRequestsEnabled ? "On — tip link can be sent" : "Off — tip link is not sent"}
      </p>

      <div className="mt-5 flex items-start justify-between gap-3 border-t border-white/10 pt-4">
        <div className="min-w-0">
          <p className="font-semibold text-white">Google review request</p>
          <p className="mt-1 text-sm text-white/65">
            One neutral invitation after the delay, with the review link below. The same message goes to every eligible completed journey. Cancelled, test, already-contacted, and opted-out customers are skipped.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.googleReviewRequestsEnabled}
          aria-label="Google review request"
          disabled={saving || !loaded}
          onClick={() => {
            const next = { ...draft, googleReviewRequestsEnabled: !draft.googleReviewRequestsEnabled };
            setDraft(next);
            void save(next);
          }}
          className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            draft.googleReviewRequestsEnabled ? "bg-emerald" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              draft.googleReviewRequestsEnabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-white/80">
        {!loaded
          ? "Loading…"
          : draft.googleReviewRequestsEnabled
            ? "On — one invitation after a completed journey"
            : "Off — no automatic review invitation"}
      </p>

      <label className="mt-5 block text-sm font-semibold text-white" htmlFor="post-journey-delay-hours">
        Delay after completion
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="post-journey-delay-hours"
          type="number"
          min={0}
          max={72}
          step={0.5}
          inputMode="decimal"
          disabled={saving || !loaded}
          value={draft.delayHours}
          onChange={(event) => setDraft((current) => ({ ...current, delayHours: Number(event.target.value) }))}
          className={fieldClass}
        />
        <span className="text-sm text-white/65">hours (default 2)</span>
      </div>

      <label className="mt-4 block text-sm font-semibold text-white" htmlFor="post-journey-review-url">
        Google review link
      </label>
      <input
        id="post-journey-review-url"
        type="url"
        inputMode="url"
        disabled={saving || !loaded}
        value={draft.googleReviewUrl}
        onChange={(event) => setDraft((current) => ({ ...current, googleReviewUrl: event.target.value }))}
        className={`${fieldClass} mt-2`}
      />
      <p className="mt-1 text-sm text-white/55">The Business Profile link that opens the review form directly.</p>

      <button
        type="button"
        disabled={saving || !loaded}
        onClick={() => void save(draft)}
        className="mt-4 min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save delay and review link"}
      </button>

      {message ? (
        <p className="mt-2 text-sm text-emerald" role="status">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
