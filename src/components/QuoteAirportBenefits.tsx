import {
  getAirportDisplayName,
  getAirportFixedCostRow,
  type JourneyAirportFeeResolution,
} from "../../shared/airport-fixed-costs";
import type { ExpressDropOffSelection } from "../../shared/express-drop-off";

type Props = {
  /** Airport codes already identified by the quote engine; never parse addresses here. */
  pickupAirportCode: string | null;
  dropoffAirportCode: string | null;
  returnJourney: boolean;
  airportFees: JourneyAirportFeeResolution;
  expressSelection: ExpressDropOffSelection;
};

export function buildQuoteAirportBenefits(input: Props) {
  const stops = [
    { code: input.pickupAirportCode, direction: "pickup" as const },
    { code: input.dropoffAirportCode, direction: "drop-off" as const },
  ];
  const legs = [
    ...stops.map((stop) => ({ ...stop, leg: "outbound" as const })),
    ...(input.returnJourney
      ? stops.map((stop) => ({
          code: stop.code,
          direction: stop.direction === "pickup" ? "drop-off" as const : "pickup" as const,
          leg: "return" as const,
        }))
      : []),
  ];

  return legs.filter((stop) => stop.code).map((stop) => {
    const pickup = stop.direction === "pickup";
    const included = input.airportFees.lines.some(
      (line) => line.airportCode === stop.code && line.leg === stop.leg &&
        line.direction === stop.direction && !line.removed && line.appliedAmountGbp > 0,
    ) || input.expressSelection.legs.some(
      (line) => line.airportCode === stop.code && line.leg === stop.leg &&
        line.service === (pickup ? "pick-up" : "drop-off") &&
        line.selected && line.chargedFeeGbp > 0,
    );
    const dublin = stop.code === "DUB";
    const zeroDropOff = dublin && !pickup && getAirportFixedCostRow(stop.code)?.dropOffFeeGbp === 0;
    const heading = included || zeroDropOff
      ? `Terminal ${pickup ? "Pickup" : "Drop-Off"} Included`
      : `Airport ${pickup ? "Collection" : "Drop-Off"}`;
    const description = included
      ? dublin && pickup
        ? "Collection from Dublin Airport’s designated pickup area, with applicable pickup and parking charges included in your fixed fare."
        : pickup
          ? "Convenient collection close to the terminal, with airport pickup charges included in your fixed fare."
          : "Convenient drop-off close to the terminal, with applicable airport drop-off charges included in your fixed fare."
      : zeroDropOff
        ? "Drop-off at Dublin Airport’s designated terminal drop-off area. No additional airport drop-off charge applies."
        : `Your ${pickup ? "collection" : "drop-off"} uses the selected airport area. See your fare breakdown for any applicable airport charges.`;
    return {
      key: `${stop.leg}:${stop.code}:${stop.direction}`,
      heading,
      description,
      label: `${input.returnJourney ? `${stop.leg === "return" ? "Return" : "Outbound"} · ` : ""}${getAirportDisplayName(stop.code)}`,
    };
  });
}

/** Presentation only: consumes existing airport/fee resolutions without changing prices. */
export default function QuoteAirportBenefits(props: Props) {
  const benefits = buildQuoteAirportBenefits(props);
  if (benefits.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-emerald/20 bg-emerald/[0.05] px-2.5 py-1.5 text-left text-navy" data-quote-airport-benefits>
      {benefits.map((benefit) => (
        <div key={benefit.key} className="flex items-start gap-1.5">
          <span className="shrink-0 text-sm font-bold text-[#147a2a]" aria-hidden>✓</span>
          <div className="min-w-0">
            {benefits.length > 1 ? <p className="text-[11px] font-medium leading-snug">{benefit.label}</p> : null}
            <p className="text-[13px] font-bold leading-snug">{benefit.heading}</p>
            <p className="mt-0.5 text-xs font-semibold leading-snug text-[#061a30]">{benefit.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
