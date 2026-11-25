import { portRouteConflict, type PublicPort } from "../../shared/ports";
import type { SelectedPlace } from "@/lib/selected-place";

/** The confirmed place object for a port tile: same shape as an address picked from Google. */
export function portToPlace(port: PublicPort): SelectedPlace {
  const isDublin = port.region === "DUBLIN";
  return {
    placeId: port.placeId,
    formattedAddress: port.formattedAddress,
    displayAddress: port.formattedAddress,
    placeName: port.name,
    lat: port.lat,
    lng: port.lng,
    countryCode: isDublin ? "IE" : "GB",
    postalCode: port.postalCode,
    streetNumber: null,
    route: null,
    locality: isDublin ? "Dublin" : null,
    administrativeArea: null,
  };
}

/**
 * Service-area guard for port journeys (owner, 25 Nov 2026): a Dublin port is only ever
 * paired with Northern Ireland, never another Republic of Ireland place. Returns the
 * message to show, or "" when the pair is fine.
 */
export function portPairConflict(
  place: SelectedPlace,
  other: SelectedPlace | null | undefined,
  ports: readonly PublicPort[],
): string {
  if (!other || !other.placeId?.trim()) return "";
  const placePort = ports.find((port) => port.placeId === place.placeId);
  const otherPort = ports.find((port) => port.placeId === other.placeId);
  if (placePort) {
    return (
      portRouteConflict({
        portRegion: placePort.region,
        otherCountryCode: other.countryCode,
        otherIsDublinPort: otherPort?.region === "DUBLIN",
      }) ?? ""
    );
  }
  if (otherPort) {
    return (
      portRouteConflict({
        portRegion: otherPort.region,
        otherCountryCode: place.countryCode,
      }) ?? ""
    );
  }
  return "";
}
