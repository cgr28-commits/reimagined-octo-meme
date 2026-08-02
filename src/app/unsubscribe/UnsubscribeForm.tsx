"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { unsubscribeMarketingEmail } from "@/lib/marketing-api";
import { SITE } from "@/lib/data";

export default function UnsubscribeForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() ?? "");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }

    setStatus("submitting");
    try {
      const ok = await unsubscribeMarketingEmail(email);
      setStatus(ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-emerald/30 bg-emerald/10 p-6 text-sm leading-relaxed text-white/80">
        <p className="font-semibold text-white">You&apos;re unsubscribed.</p>
        <p className="mt-2">
          If {email.trim()} was on our marketing list, it has been removed. You may still receive
          booking confirmations and messages about journeys you have booked with us.
        </p>
        <Link href="/" className="mt-4 inline-block text-emerald underline underline-offset-2">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-white/80">Email address</span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
        />
      </label>

      {status === "error" && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Something went wrong. Please try again or email {SITE.email} to unsubscribe.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? "Unsubscribing…" : "Unsubscribe from marketing emails"}
      </button>

      <p className="text-xs leading-relaxed text-white/45">
        This only stops marketing updates. Booking confirmations and journey messages are not
        affected.
      </p>
    </form>
  );
}
