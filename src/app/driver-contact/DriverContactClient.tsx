"use client";

import { useCallback, useEffect, useState } from "react";
import { SITE } from "@/lib/data";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

type DriverContactPayload = {
  ok?: boolean;
  view?: string;
  heading?: string;
  message?: string;
  driverFirstName?: string;
  mobileDisplay?: string;
  phoneDisplay?: string;
  whatsAppLabel?: string;
  callLabel?: string;
};

function openUrl(token: string, channel: "whatsapp" | "call"): string {
  const url = new URL(`${resolveWorkerBaseUrl()}/driver-contact/open`);
  url.searchParams.set("token", token);
  url.searchParams.set("channel", channel);
  return url.toString();
}

export default function DriverContactClient() {
  const [token, setToken] = useState("");
  const [payload, setPayload] = useState<DriverContactPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError("");
    setPayload(null);
    try {
      const response = await fetch(
        `${resolveWorkerBaseUrl()}/api/driver-contact?token=${encodeURIComponent(accessToken)}`,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
      const body = (await response.json().catch(() => null)) as DriverContactPayload | null;
      if (!body || typeof body.message !== "string") {
        setError("This link is not valid.");
        return;
      }
      setPayload(body);
      if (!response.ok && !body.message) setError("This link is not valid.");
    } catch {
      setError("This link is not valid.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token")?.trim() || "";
    setToken(value);
    if (!value) {
      setError("This link is not valid.");
      setLoading(false);
      return;
    }
    void load(value);
  }, [load]);

  const showActions = Boolean(payload && (payload.view === "driver" || payload.phoneDisplay));
  const whatsAppLabel = payload?.whatsAppLabel || "Message Your Driver";
  const callLabel = payload?.callLabel || "Call Your Driver";

  return (
    <main className="min-h-dvh bg-[#f4f6f8] px-4 py-10 text-[#1a2b3c]">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-[#071c38] px-6 py-7 text-center text-white">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2fbf4a]">{SITE.name}</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug">
            {payload?.heading || "Driver contact"}
          </h1>
        </div>
        <div className="px-5 py-6 sm:px-7">
          {loading ? <p className="text-base text-[#64748b]">Checking the current driver…</p> : null}
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
          ) : null}
          {payload ? (
            <div className="space-y-5">
              <p className="text-base leading-relaxed">{payload.message}</p>
              {payload.view === "driver" && payload.driverFirstName ? (
                <div className="rounded-xl border border-[#dbe3ee] bg-[#f8fafc] px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">Your driver</p>
                  <p className="mt-1 text-2xl font-bold text-[#071c38]">{payload.driverFirstName}</p>
                  {payload.mobileDisplay ? (
                    <p className="mt-2 text-xl font-semibold tracking-wide">{payload.mobileDisplay}</p>
                  ) : null}
                </div>
              ) : null}
              {payload.phoneDisplay ? (
                <div className="rounded-xl border border-[#dbe3ee] bg-[#f8fafc] px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">Business telephone</p>
                  <p className="mt-1 text-2xl font-bold text-[#071c38]">{payload.phoneDisplay}</p>
                </div>
              ) : null}
              {showActions && token ? (
                <div className="space-y-3">
                  <a
                    href={openUrl(token, "whatsapp")}
                    rel="noreferrer"
                    className="block rounded-xl bg-[#25D366] px-5 py-4 text-center text-lg font-bold text-white"
                  >
                    {whatsAppLabel}
                  </a>
                  <a
                    href={openUrl(token, "call")}
                    rel="noreferrer"
                    className="block rounded-xl bg-[#071c38] px-5 py-4 text-center text-lg font-bold text-white"
                  >
                    {callLabel}
                  </a>
                </div>
              ) : null}
              {token ? (
                <button
                  type="button"
                  onClick={() => void load(token)}
                  className="text-sm font-semibold text-[#071c38] underline"
                >
                  Check again
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
