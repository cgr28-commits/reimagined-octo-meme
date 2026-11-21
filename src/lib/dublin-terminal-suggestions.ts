/**
 * Dublin Airport in address search: show exactly "Dublin Airport Terminal 1" and
 * "Dublin Airport Terminal 2" instead of Google's many variants ("Dublin Airport",
 * "Dublin Airport, Terminal 1 (DUB)", "Terminal 1 Collinstown", cafés "at Terminal 1"…).
 *
 * Both terminals resolve to the same Dublin Airport place and coordinates as before,
 * so fares, airport charges and Meet & Greet are unchanged. Only the label carries the
 * terminal, which pickup instructions use when flight data has not resolved it.
 */
import { getServedAirport } from "../../shared/served-airports";
import type { DublinArrivalTerminal } from "../../shared/dublin-arrival-terminal";

type Prediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export const DUBLIN_TERMINAL_PLACE_IDS: Record<DublinArrivalTerminal, string> = {
  T1: "served-dub-terminal-1",
  T2: "served-dub-terminal-2",
};

const DUBLIN_SECONDARY = "Co. Dublin, Ireland";

export function dublinTerminalLabel(terminal: DublinArrivalTerminal): string {
  return `Dublin Airport Terminal ${terminal === "T1" ? "1" : "2"}`;
}

export function dublinTerminalAddress(terminal: DublinArrivalTerminal): string {
  return `${dublinTerminalLabel(terminal)}, ${DUBLIN_SECONDARY}`;
}

export function dublinTerminalFromPlaceId(placeId: string): DublinArrivalTerminal | null {
  const id = placeId.trim();
  if (id === DUBLIN_TERMINAL_PLACE_IDS.T1) return "T1";
  if (id === DUBLIN_TERMINAL_PLACE_IDS.T2) return "T2";
  return null;
}

function dublinTerminalPredictions(): Prediction[] {
  return (["T1", "T2"] as const).map((terminal) => ({
    placeId: DUBLIN_TERMINAL_PLACE_IDS[terminal],
    description: dublinTerminalAddress(terminal),
    mainText: dublinTerminalLabel(terminal),
    secondaryText: DUBLIN_SECONDARY,
  }));
}

const DUBLIN_AIRPORT_AREA = /\b(dublin airport|collinstown|corballis|swords|aerfort bhaile)\b/i;

/** True for any suggestion that is Dublin Airport itself or one of its terminals. */
export function isDublinAirportVariant(prediction: Prediction): boolean {
  const main = prediction.mainText.trim().toLowerCase().replace(/\s+/g, " ");
  const all = `${prediction.mainText} ${prediction.secondaryText} ${prediction.description}`;
  const dub = getServedAirport("DUB");
  if (dub && prediction.placeId === dub.placeId) return true;
  if (dublinTerminalFromPlaceId(prediction.placeId)) return true;
  // "Dublin Airport", "Dublin Airport (DUB)", "Dublin Airport, Terminal 1 (DUB)", "Aerfort Bhaile Átha Cliath"
  if (/^(dublin airport|aerfort bhaile átha cliath)(\s*\(dub\))?(,?\s*terminal\s*[12])?(\s*\(dub\))?$/.test(main)) {
    return true;
  }
  // "Terminal 1" / "Terminal 2" at Collinstown / Swords, and places named "… at Terminal 1 Dublin Airport"
  if (/\bterminal\s*[12]\b/i.test(all) && DUBLIN_AIRPORT_AREA.test(all)) return true;
  return false;
}

/**
 * Replace every Dublin Airport variant with the two terminal entries, placed first.
 * Leaves other places (business parks, hotels, Dublin city) untouched.
 */
export function shapeDublinAirportSuggestions<T extends Prediction>(
  predictions: T[],
  hasDublinAirportIntent: boolean,
): Prediction[] {
  const others = predictions.filter((item) => !isDublinAirportVariant(item));
  const hadVariant = others.length !== predictions.length;
  if (!hadVariant && !hasDublinAirportIntent) {
    return predictions;
  }
  return [...dublinTerminalPredictions(), ...others];
}
