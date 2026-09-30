"use client";

import { useState } from "react";
import AddressInput from "@/components/AddressInput";
import { previewOwnerProfitability } from "@/lib/owner-pricing-api";
import type { OwnerProfitabilityReport } from "@/lib/owner-profitability-report";
import type { SelectedPlace } from "@/lib/selected-place";

type OwnerProfitabilityTesterProps = {
  ownerKey: string;
  isolated: boolean;
};

const fieldClass =
  "box-border mt-1 min-h-12 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white [color-scheme:dark]";

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `£${rounded}` : `£${rounded.toFixed(2)}`;
}

function line(label: string, value: string) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-white/70">{label}</dt>
      <dd className="text-right font-semibold text-white">{value}</dd>
    </div>
  );
}

export default function OwnerProfitabilityTester({
  ownerKey,
  isolated,
}: OwnerProfitabilityTesterProps) {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace | null>(null);
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace | null>(null);
  const [outboundDate, setOutboundDate] = useState("");
  const [outboundTime, setOutboundTime] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [vehicleType, setVehicleType] = useState("Standard Saloon (1–4 passengers)");
  const [expressSelected, setExpressSelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OwnerProfitabilityReport | null>(null);

  const run = async () => {
    if (isolated) return;
    if (!pickupPlace?.lat || !pickupPlace.lng || !dropoffPlace?.lat || !dropoffPlace.lng) {
      setError("Choose both addresses from the suggestions.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await previewOwnerProfitability(ownerKey, {
        pickupAddress: pickupPlace.displayAddress || pickupPlace.formattedAddress || pickup,
        dropoffAddress: dropoffPlace.displayAddress || dropoffPlace.formattedAddress || dropoff,
        pickupLat: pickupPlace.lat,
        pickupLng: pickupPlace.lng,
        dropoffLat: dropoffPlace.lat,
        dropoffLng: dropoffPlace.lng,
        outboundDate,
        outboundTime,
        returnJourney,
        returnDate,
        returnTime,
        vehicleType,
        expressSelected,
      });
      setReport(result.report);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "The profitability test could not be run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">
        Profitability tester
      </h3>
      <p className="mt-2 text-sm text-white/70">
        Owner only. This does not create a booking and is not shown to customers.
      </p>
      {isolated ? (
        <p className="mt-3 text-sm text-white/60">
          The tester runs on the owner server and is unavailable in isolated preview.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <AddressInput
            id="profit-pickup"
            name="profit-pickup"
            label="Pickup"
            value={pickup}
            onChange={setPickup}
            onSelectPlace={setPickupPlace}
            confirmedPlace={pickupPlace}
            disableAutoScroll
          />
          <AddressInput
            id="profit-dropoff"
            name="profit-dropoff"
            label="Destination"
            value={dropoff}
            onChange={setDropoff}
            onSelectPlace={setDropoffPlace}
            confirmedPlace={dropoffPlace}
            disableAutoScroll
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-white/70">
              Date
              <input
                className={fieldClass}
                type="date"
                value={outboundDate}
                onChange={(event) => setOutboundDate(event.target.value)}
              />
            </label>
            <label className="text-sm text-white/70">
              Time
              <input
                className={fieldClass}
                type="time"
                value={outboundTime}
                onChange={(event) => setOutboundTime(event.target.value)}
              />
            </label>
          </div>
          <label className="text-sm text-white/70">
            Vehicle
            <select
              className={fieldClass}
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
            >
              <option>Standard Saloon (1–4 passengers)</option>
              <option>Estate Car (1–4 passengers)</option>
              <option>Minibus (5–7 passengers)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={returnJourney}
              onChange={(event) => setReturnJourney(event.target.checked)}
            />
            Test a return as two separate jobs
          </label>
          {returnJourney ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-white/70">
                Return date
                <input
                  className={fieldClass}
                  type="date"
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                />
              </label>
              <label className="text-sm text-white/70">
                Return time
                <input
                  className={fieldClass}
                  type="time"
                  value={returnTime}
                  onChange={(event) => setReturnTime(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={expressSelected}
              onChange={(event) => setExpressSelected(event.target.checked)}
            />
            Include Express access where it applies
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="min-h-12 w-full rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-40"
          >
            {busy ? "Testing…" : "Run profitability test"}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}
      {report ? <ReportView report={report} /> : null}
    </section>
  );
}

function ReportView({ report }: { report: OwnerProfitabilityReport }) {
  const outbound = report.outbound;
  return (
    <dl className="mt-4 space-y-2 text-sm">
      <p className="font-semibold uppercase tracking-wider text-emerald">
        {report.protectionActive
          ? "Profitability protection active"
          : "Profitability protection not active"}
      </p>
      {line("Passenger miles", outbound.passengerMiles.toFixed(1))}
      {line("Passenger driving time", `${outbound.passengerMinutes} min`)}
      {line(
        "Operational miles",
        outbound.operationalMiles == null ? "—" : outbound.operationalMiles.toFixed(1),
      )}
      {line(
        "Operational driving time",
        outbound.operationalMinutes == null ? "—" : `${outbound.operationalMinutes} min`,
      )}
      {line("Existing curve fare", money(outbound.existingCurveFareGbp))}
      {line("Minimum Saloon fare", money(outbound.minimumSaloonFareGbp))}
      {line("Fuel cost per mile", outbound.fuelCostPerMileGbp == null ? "—" : money(outbound.fuelCostPerMileGbp))}
      {line("Total fuel cost", money(outbound.fuelCostGbp))}
      {line("Wear cost", money(outbound.wearCostGbp))}
      {line("Target time earnings", money(outbound.targetTimeEarningsGbp))}
      {line("Profitability floor", money(outbound.profitabilityFloorGbp))}
      {line("Protected Saloon fare", money(outbound.protectedSaloonFareGbp))}
      {line("Rule", outbound.rule)}
      {line("Night / weekend surcharge", money(report.outbound.nightWeekendSurchargeGbp))}
      {line("Airport fixed costs", money(report.airportFixedCostsGbp))}
      {line("Express fee", money(report.expressFeeGbp))}
      {line("Existing customer fare", money(report.existingCustomerFareGbp))}
      {line("Final customer price", money(report.finalCustomerPriceGbp))}
      {line("Direct operational costs", money(report.directCostsGbp))}
      {line("Remaining after direct costs", money(report.estimatedRemainingAfterDirectCostsGbp))}
      {line("Earnings per operational hour", report.estimatedEarningsPerHourGbp == null ? "—" : `${money(report.estimatedEarningsPerHourGbp)}/hour`)}
      {report.returnLeg ? (
        <p className="pt-2 text-white/70">
          Return job: {report.returnLeg.operationalMiles ?? "—"} operational miles, rule {report.returnLeg.rule}, protected Saloon {money(report.returnLeg.protectedSaloonFareGbp)}.
        </p>
      ) : null}
    </dl>
  );
}
