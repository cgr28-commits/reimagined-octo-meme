"use client";

import { useEffect, useState } from "react";
import { fetchJourneyReminderAirports, saveJourneyReminderAirports } from "@/lib/short-notice-api";

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "bfsExpressCollection", label: "Belfast International — Express collection" },
  { key: "bfsFreeCollection", label: "Belfast International — Long Stay free collection" },
  { key: "bhdExpressCollection", label: "Belfast City — Express collection" },
  { key: "bhdFreeCollection", label: "Belfast City — Long Stay free collection" },
  { key: "dubT1Collection", label: "Dublin Airport — Terminal 1 collection" },
  { key: "dubT2Collection", label: "Dublin Airport — Terminal 2 collection" },
  { key: "dubUnconfirmedCollection", label: "Dublin Airport — terminal not confirmed" },
  { key: "meetGreetCollection", label: "Business Class Meet & Greet collection" },
  { key: "bfsExpressDropOff", label: "Belfast International — Express drop-off" },
  { key: "bfsFreeDropOff", label: "Belfast International — free drop-off" },
  { key: "bhdExpressDropOff", label: "Belfast City — Express drop-off" },
  { key: "bhdFreeDropOff", label: "Belfast City — free drop-off" },
  { key: "dubDropOff", label: "Dublin Airport — drop-off" },
];

export default function OwnerJourneyReminderAirports({ ownerKey }: { ownerKey: string }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJourneyReminderAirports(ownerKey)
      .then((copy) => {
        if (!cancelled) setDraft(copy);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load instructions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveJourneyReminderAirports(ownerKey, draft);
      setDraft(saved);
      setMessage("Airport reminder instructions saved. The next 2-hour email uses this wording.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save instructions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <h2 className="text-lg font-semibold text-slate-950">Airport reminder instructions</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        These notes appear in the customer email about two hours before pickup. They do not change airport access charges.
      </p>
      {loading ? <p className="mt-4 text-sm text-slate-600">Loading instructions…</p> : null}
      <div className="mt-4 grid gap-4">
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-sm font-medium text-slate-800">
            {field.label}
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              rows={3}
              value={draft[field.key] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void handleSave()}
        disabled={saving || loading}
      >
        {saving ? "Saving…" : "Save airport instructions"}
      </button>
      {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
