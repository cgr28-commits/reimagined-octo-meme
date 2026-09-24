"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PublicPartySelectors from "@/components/PublicPartySelectors";
import { PREVIEW_PRICING_BANNER } from "../../shared/pricing-preview-isolation";
import { publicPassengerCapacityCopy } from "../../shared/passenger-limits";
import { requiresMinibus, selectVehicleForParty, vehicleShortLabel } from "@/lib/vehicle-selection";

export default function PreviewQuoteCapacityClient({
  publicMinibusEnabled,
}: {
  publicMinibusEnabled: boolean;
}) {
  const enabled = publicMinibusEnabled === true;
  const [passengers, setPassengers] = useState<number | null>(null);
  const [suitcases, setSuitcases] = useState<number | null>(null);

  const vehicle = useMemo(() => {
    if (passengers == null || suitcases == null) return null;
    return selectVehicleForParty(passengers, suitcases);
  }, [passengers, suitcases]);

  return (
    <main className="min-h-screen bg-[#071c38] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <p className="rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 py-3 text-sm font-semibold text-sky-100">
          {PREVIEW_PRICING_BANNER}
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">
          Preview {enabled ? "B — Minibus ON" : "A — Minibus OFF"}
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
        </section>
      </div>
    </main>
  );
}
