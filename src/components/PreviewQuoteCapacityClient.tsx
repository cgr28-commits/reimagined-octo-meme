"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PublicPartySelectors from "@/components/PublicPartySelectors";
import { PREVIEW_PRICING_BANNER } from "../../shared/pricing-preview-isolation";
import { publicPassengerCapacityCopy } from "../../shared/passenger-limits";
import {
  defaultOwnerPricingSettings,
  minibusBaseFareFromSaloon,
} from "../../shared/owner-pricing-config";
import {
  LUGGAGE_CAPACITY_CONFIRMATION_BODY,
  LUGGAGE_CAPACITY_CONFIRMATION_CTA,
  LUGGAGE_CAPACITY_CONFIRMATION_HEADING,
  needsLuggageCapacityConfirmation,
} from "../../shared/vehicle-capacity";
import { requiresMinibus, selectVehicleForParty, vehicleShortLabel } from "@/lib/vehicle-selection";

export default function PreviewQuoteCapacityClient({
  publicMinibusEnabled,
  initialPassengers = null,
  initialSuitcases = null,
  exampleLabel,
}: {
  publicMinibusEnabled: boolean;
  initialPassengers?: number | null;
  initialSuitcases?: number | null;
  exampleLabel?: string;
}) {
  const enabled = publicMinibusEnabled === true;
  const [passengers, setPassengers] = useState<number | null>(initialPassengers);
  const [suitcases, setSuitcases] = useState<number | null>(initialSuitcases);

  const vehicle = useMemo(() => {
    if (passengers == null || suitcases == null) return null;
    return selectVehicleForParty(passengers, suitcases);
  }, [passengers, suitcases]);

  const capacityHold =
    enabled &&
    passengers != null &&
    suitcases != null &&
    needsLuggageCapacityConfirmation(passengers, suitcases);

  const exampleFare = useMemo(() => {
    if (!enabled || passengers == null || suitcases == null) return null;
    if (!requiresMinibus(passengers, suitcases)) return null;
    const pricing = {
      ...defaultOwnerPricingSettings(),
      minibus: { publicEnabled: true, multiplier: 1.55 },
    };
    return minibusBaseFareFromSaloon(50, pricing);
  }, [enabled, passengers, suitcases]);

  return (
    <main className="min-h-screen bg-[#071c38] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <p className="rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 py-3 text-sm font-semibold text-sky-100">
          {PREVIEW_PRICING_BANNER}
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">
          Preview {enabled ? "B — Minibus ON" : "A — Minibus OFF"}
          {exampleLabel ? ` · ${exampleLabel}` : ""}
        </p>
        <h1 className="text-2xl font-bold">Public passenger and luggage selectors</h1>
        <p className="text-sm text-white/70">
          Isolated preview. This does not change live customer pricing. Offer 7 Seater Minibus
          Online is {enabled ? "ON" : "OFF"} on this page only.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/">
            Back to Pricing tab
          </Link>
          {enabled ? (
            <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/quote-off/">
              View Minibus OFF
            </Link>
          ) : (
            <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/quote-on/">
              View Minibus ON
            </Link>
          )}
          {enabled ? (
            <>
              <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/quote-normal-minibus/">
                Normal 5+2 Minibus
              </Link>
              <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/quote-high-load/">
                7 passengers + 5+ bags
              </Link>
            </>
          ) : null}
        </div>

        <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-4" data-preview-party-selectors>
          <PublicPartySelectors
            publicMinibusEnabled={enabled}
            passengers={passengers}
            suitcases={suitcases}
            onPassengersChange={setPassengers}
            onSuitcasesChange={setSuitcases}
          />
          <p className="mt-4 text-xs text-white/70">{publicPassengerCapacityCopy(enabled)}</p>
          {vehicle ? (
            <p className="mt-3 text-sm text-white">
              Vehicle for this selection:{" "}
              <span className="font-semibold">{vehicleShortLabel(vehicle)}</span>
              {requiresMinibus(passengers ?? 0, suitcases ?? 0)
                ? enabled
                  ? " — 7 Seater Minibus required."
                  : " — not offered while Minibus is OFF."
                : null}
            </p>
          ) : (
            <p className="mt-3 text-sm text-white/70">Tap a passenger and suitcase number to continue.</p>
          )}
          {exampleFare ? (
            <div className="mt-4 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-4" data-preview-minibus-fare>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald">
                7 Seater Minibus
              </p>
              <p className="mt-1 font-sans text-4xl font-extrabold tracking-tight text-white">
                £{exampleFare.minibusQuotedGbp.toFixed(2)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/65">
                Example Belfast City → BFS weekday fare. Estate £{exampleFare.estateGbp.toFixed(2)} ×
                1.55. Isolated preview only — no payment.
              </p>
            </div>
          ) : null}
          {capacityHold ? (
            <div
              className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-4"
              data-luggage-capacity-confirmation
            >
              <p className="text-sm font-semibold text-amber-100">
                {LUGGAGE_CAPACITY_CONFIRMATION_HEADING}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-50/90">
                {LUGGAGE_CAPACITY_CONFIRMATION_BODY}
              </p>
              <button
                type="button"
                className="btn-primary mt-4 w-full"
                data-preview-capacity-cta
              >
                {LUGGAGE_CAPACITY_CONFIRMATION_CTA}
                {exampleFare ? ` — £${exampleFare.minibusQuotedGbp.toFixed(2)}` : ""}
              </button>
              <p className="mt-2 text-xs text-white/60">
                Preview only. This does not create a SumUp checkout or a live booking.
              </p>
            </div>
          ) : enabled && vehicle && requiresMinibus(passengers ?? 0, suitcases ?? 0) ? (
            <p className="mt-4 text-sm text-emerald">
              Normal Minibus booking flow — this load can use instant quote / payment when live.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
