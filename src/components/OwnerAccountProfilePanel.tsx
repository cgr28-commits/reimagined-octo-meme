"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchOwnerAccountProfile,
  saveOwnerAccountProfile,
  type OwnerAccountProfile,
} from "@/lib/tracking-api";

type OwnerAccountProfilePanelProps = {
  ownerKey: string;
};

const EMPTY_FORM = {
  displayName: "",
  email: "",
  mobile: "",
  make: "",
  model: "",
  colour: "",
  registration: "",
};

export default function OwnerAccountProfilePanel({ ownerKey }: OwnerAccountProfilePanelProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [complete, setComplete] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const applyProfile = useCallback((profile: OwnerAccountProfile | null, isComplete: boolean) => {
    if (profile) {
      setForm({
        displayName: profile.displayName ?? "",
        email: profile.email ?? "",
        mobile: profile.mobile ?? "",
        make: profile.make ?? "",
        model: profile.model ?? "",
        colour: profile.colour ?? "",
        registration: profile.registration ?? "",
      });
      setSavedAt(profile.updatedAt ?? null);
    } else {
      setForm(EMPTY_FORM);
      setSavedAt(null);
    }
    setComplete(isComplete);
    setCollapsed(isComplete);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOwnerAccountProfile(ownerKey);
      applyProfile(result.profile, result.complete);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load owner profile");
      setComplete(false);
      setCollapsed(false);
    } finally {
      setLoading(false);
    }
  }, [applyProfile, ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await saveOwnerAccountProfile(ownerKey, form);
      applyProfile(saved, true);
      setMessage("Owner profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save owner profile");
      setComplete(false);
    } finally {
      setSaving(false);
    }
  };

  const showSetupPrompt = !loading && !complete;
  const showEditor = !collapsed || showSetupPrompt;

  return (
    <section className="mb-8 rounded-2xl border border-emerald/25 bg-emerald/5 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
            Account holder
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Owner profile</h2>
          <p className="mt-2 text-sm text-white/60">
            Your name and vehicle details are stored on the server and restored when you sign in.
            This profile is also the <span className="text-white/85">default driver</span> for
            journeys and customer live tracking — you do not need to enter the same details again
            under Driver profiles.
          </p>
          {complete && collapsed && (
            <p className="mt-3 text-sm text-emerald">
              Default driver · {form.displayName} · {form.make} {form.model} ({form.colour}) ·{" "}
              {form.registration}
            </p>
          )}
          {showSetupPrompt && (
            <p className="mt-3 text-sm text-amber-100">
              Owner profile is not saved yet — enter your details below and press Save. Journeys
              will use these details as the default driver.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {complete && (
            <span className="rounded-full border border-emerald/40 bg-emerald/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald">
              Saved
            </span>
          )}
          {!showSetupPrompt && (
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              {collapsed ? "Edit owner profile" : "Collapse"}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <p className="mt-5 text-sm text-white/60">Loading owner profile…</p>
      )}

      {showEditor && !loading && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["displayName", "Name", "text", "e.g. Your name"],
                ["email", "Email", "email", "owner@example.com"],
                ["mobile", "Mobile", "tel", "e.g. 07700 900123"],
                ["make", "Make", "text", "e.g. Mercedes-Benz"],
                ["model", "Model", "text", "e.g. E-Class"],
                ["colour", "Colour", "text", "e.g. Black"],
                ["registration", "Registration", "text", "e.g. ABC 1234"],
              ] as const
            ).map(([key, label, type, placeholder]) => (
              <label key={key} className="block text-sm text-white/70">
                {label}
                <input
                  type={type}
                  value={form[key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [key]:
                        key === "registration"
                          ? event.target.value.toUpperCase()
                          : event.target.value,
                    }))
                  }
                  className={`mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald ${
                    key === "registration" ? "uppercase" : ""
                  }`}
                  placeholder={placeholder}
                />
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : complete ? "Update owner profile" : "Save owner profile"}
            </button>
          </div>

          {message && (
            <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
              {message}
              {savedAt ? ` · Updated ${new Date(savedAt).toLocaleString("en-GB")}` : ""}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
