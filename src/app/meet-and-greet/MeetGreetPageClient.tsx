"use client";
import { useLayoutEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { MEET_GREET_AIRPORT_NAMES, MEET_GREET_BENEFITS } from "../../../shared/meet-greet-upgrade";
import { formatUkDate, formatUkTime } from "@/lib/format-datetime";
type Offer = { state: "open" | "paid"; bookingReference: string; amount: number; airport: "BFS" | "BHD" | "DUB"; leg: "outbound" | "return"; pickupDate: string; pickupTime: string; pickupLabel: string; dropoffLabel: string; warning?: string; confirmationSent?: boolean };
const base = resolveWorkerBaseUrl();
export default function MeetGreetPageClient() {
  const [token, setToken] = useState(""); const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load(current: string) {
    const response = await fetch(`${base}/meet-greet/status?t=${encodeURIComponent(current)}`, { cache: "no-store" });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "This offer is unavailable.");
    return payload as Offer;
  }
  useLayoutEffect(() => {
    let current = new URLSearchParams(window.location.search).get("t") ?? "";
    try { if (current) sessionStorage.setItem("meet-greet-token", current); else current = sessionStorage.getItem("meet-greet-token") ?? ""; } catch {}
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(current)) { setError("This upgrade link is unavailable."); return; }
    setToken(current); let stopped = false;
    void load(current).then(value => { if (!stopped) setOffer(value); }).catch(err => { if (!stopped) setError(err.message); });
    return () => { stopped = true; };
  }, []);
  async function pay() {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/meet-greet/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Payment unavailable.");
      if (payload.state === "paid") { setOffer(await load(token)); }
      else if (payload.paymentUrl) { window.location.assign(payload.paymentUrl); }
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl px-4 py-12 text-white">
    <section className="rounded-2xl border border-white/15 bg-navy p-6 sm:p-8">
      <p className="text-sm font-semibold text-emerald">My Airport Taxi NI</p>
      <h1 className="mt-3 text-3xl font-semibold">{offer?.state === "paid" ? offer.warning ? "Payment recorded" : "Meet & Greet added" : "A warm welcome at arrivals"}</h1>
      {error ? <p role="alert" className="mt-4 text-amber-200">{error}</p> : null}
      {!offer && !error ? <p role="status" className="mt-4">Loading your booking…</p> : null}
      {offer ? <>
        <p className="mt-4 font-semibold">Booking {offer.bookingReference}</p>
        <p className="mt-2">{MEET_GREET_AIRPORT_NAMES[offer.airport]} · {offer.leg === "return" ? "Return collection" : "Collection"}</p>
        {offer.state === "paid" ? <p className="mt-5 leading-relaxed" role="status">{offer.warning || <>Your £{offer.amount?.toFixed(2)} payment has been linked to your original booking. {offer.confirmationSent ? "We’ve emailed your updated booking confirmation." : "Your updated booking confirmation will follow by email."}</>}</p> : <>
          <p className="mt-2 text-white/75">{formatUkDate(offer.pickupDate)} · {formatUkTime(offer.pickupTime)}</p>
          <p className="mt-2 text-sm text-white/75">{offer.pickupLabel} → {offer.dropoffLabel}</p>
          <ul className="mt-6 space-y-3">{MEET_GREET_BENEFITS.map(benefit => <li key={benefit}>✓ {benefit}</li>)}</ul>
          <p className="mt-6 text-2xl font-semibold">£{offer.amount.toFixed(2)} for your whole party</p>
          <button type="button" onClick={() => void pay()} disabled={busy} className="btn-primary mt-5 min-h-12 w-full">{busy ? "Opening secure payment…" : `Pay £${offer.amount.toFixed(2)} and add Meet & Greet`}</button>
          <p className="mt-4 text-sm leading-relaxed text-white/75">Optional upgrade for this airport collection. Your existing transfer is confirmed. If you don’t want Meet &amp; Greet, there’s nothing you need to do.</p>
        </>}
        <p className="mt-6 text-sm"><a href="mailto:bookings@myairporttaxini.co.uk" className="underline">Questions? Contact us</a></p>
      </> : null}
    </section>
  </main>;
}
