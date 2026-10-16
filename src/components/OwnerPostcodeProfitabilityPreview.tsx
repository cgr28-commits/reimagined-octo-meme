"use client";

import { useRef, useState } from "react";
import AddressInput from "@/components/AddressInput";
import type { SelectedPlace } from "@/lib/selected-place";
import { previewOwnerPostcodeRule, type PostcodeProfitabilityPreview } from "@/lib/owner-pricing-api";
import { postcodeDistrict, type PostcodePricingRule } from "../../shared/postcode-pricing";

export default function OwnerPostcodeProfitabilityPreview({ ownerKey, rule, supplement, isolated }: { ownerKey: string; rule: PostcodePricingRule; supplement: number; isolated: boolean }) {
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [vehicle, setVehicle] = useState<"saloon" | "estate">("saloon");
  const [preview, setPreview] = useState<PostcodeProfitabilityPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const fare = (Math.round(rule.saloonFareGbp * 100) + (vehicle === "estate" ? Math.round(supplement * 100) : 0)) / 100;
  const money = (n: number) => `£${n.toFixed(2)}`;
  async function run() {
    const version = ++requestVersion.current;
    setError(""); setPreview(null);
    const full = place ? `${place.formattedAddress} ${place.postalCode ?? ""}` : "";
    if (!place || place.lat == null || place.lng == null || postcodeDistrict(full) !== rule.district) { setError(`Choose a full ${rule.district} address from suggestions.`); return; }
    if (isolated) { setError("Routing preview is available only in the authorised dashboard; no live request was sent."); return; }
    setBusy(true);
    try { const result = await previewOwnerPostcodeRule(ownerKey, { rule, address: full, lat: place.lat, lng: place.lng, vehicle }); if (version === requestVersion.current) setPreview(result.preview); }
    catch (e) { if (version === requestVersion.current) setError(e instanceof Error ? e.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 min-w-0 rounded-xl border border-emerald/25 bg-navy p-4">
    <h3 className="font-semibold text-white">Customer price & profitability preview</h3>
    <p className="mt-2 text-sm text-white/80">{rule.district} · {rule.airportCode} · {rule.direction === "from-airport" ? "From airport" : "To airport"}. One-way, standard terminal access included. No booking is created.</p>
    <label className="mt-3 block text-sm text-white">Vehicle<select aria-label="Preview vehicle" className="ml-2 rounded-lg border border-white/20 bg-navy p-2" value={vehicle} onChange={e => { requestVersion.current++; setVehicle(e.target.value as "saloon" | "estate"); setPreview(null); setError(""); }}><option value="saloon">Saloon</option><option value="estate">Estate</option></select></label>
    <p className="mt-3 text-2xl font-bold text-white">Customer fare: {money(fare)}</p>
    <p className="mt-2 text-sm text-white/70">Private estimate: home → pickup → destination → home. Uses current MPG, diesel and wear settings. Driving time only; waiting, traffic changes and optional services can reduce earnings. Target £40/hour after direct costs. This never changes the fare or approves a draft.</p>
    <div className="mt-3"><AddressInput id="postcode-preview-address" name="postcode-preview-address" label="Representative customer address" value={address} onChange={value => { requestVersion.current++; setAddress(value); setPlace(null); setPreview(null); setError(""); }} onSelectPlace={value => { requestVersion.current++; setPlace(value); setPreview(null); setError(""); }} confirmedPlace={place} disableAutoScroll /></div>
    <button type="button" className="btn-secondary mt-3 px-4" disabled={busy || isolated} onClick={() => void run()}>{busy ? "Measuring road routes…" : "Measure profitability"}</button>
    {isolated ? <p className="mt-2 text-sm text-white/70">Road routing is unavailable in isolated preview. No sample mileage is presented as verified.</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-300">{error}</p> : null}
    {preview ? <div role="status" className="mt-4 text-sm text-white"><dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{[
      ["Total working mileage", `${preview.totalMiles} miles`], ["Estimated driving time", `${preview.drivingMinutes} minutes`],
      ["Fuel", money(preview.fuelCostGbp)], ["Wear allowance", money(preview.wearCostGbp)], ["Airport costs included", money(preview.airportCostsGbp)],
      ["Estimated direct operating costs", money(preview.directCostsGbp)], ["Customer fare", money(preview.fareGbp)],
      ["Net contribution after direct costs", money(preview.contributionGbp)], ["Effective hourly earnings", `${money(preview.hourlyGbp)}/hour`],
    ].map(([label, value]) => <div key={label}><dt className="text-white/70">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
      <p className={`mt-3 rounded-lg border p-3 ${preview.belowTarget ? "border-amber-300/40 text-amber-200" : "border-emerald/40 text-emerald"}`}>{preview.belowTarget ? "Below the £40/hour target. Review before approval; the fare has not been changed." : "Meets the £40/hour driving-time target for this representative address."}</p>
      <p className="mt-2 text-xs text-white/70">Routed {new Date(preview.measuredAt).toLocaleString("en-GB")}. One address does not verify every route within a district.</p>
    </div> : null}
  </section>;
}
