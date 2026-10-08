/**
 * Resolve a customer-typed premises line to a provider record.
 * Returns verified coordinates only when the provider's own address matches
 * the typed door, street and postcode. Never geocodes a nearby street.
 */

import { searchGetAddress, resolveGetAddressDetails } from "../shared/getaddress";
import {
  isPlacesQuotaError,
  resolveGooglePlaceDetails,
  searchGoogleAddressSuggestions,
} from "../shared/google-places";
import {
  parseManualServiceAddress,
  providerRecordMatchesTypedAddress,
  type ParsedManualAddress,
} from "../shared/manual-address";

export type VerifiedManualPlace = {
  verified: true;
  address: string;
  formattedAddress: string;
  displayAddress: string;
  placeId: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  postalCode: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
  provider: "getaddress" | "google";
};

export type UnverifiedManualPlace = {
  verified: false;
  manual: ParsedManualAddress;
};

export async function resolveTypedManualAddress(options: {
  query: string;
  airportCode: string;
  getAddressApiKey?: string;
  googlePlacesApiKey?: string;
}): Promise<VerifiedManualPlace | UnverifiedManualPlace | null> {
  const parsed = parseManualServiceAddress(options.query);
  if (!parsed) return null;

  const airportCode = options.airportCode.trim().toUpperCase();
  const getAddressKey = options.getAddressApiKey?.trim() ?? "";
  const googleKey = options.googlePlacesApiKey?.trim() ?? "";

  if (getAddressKey) {
    try {
      const suggestions = await searchGetAddress(getAddressKey, parsed.formatted, airportCode);
      for (const suggestion of suggestions) {
        const details = await resolveGetAddressDetails(getAddressKey, suggestion.id, airportCode);
        if (!details) continue;
        if (
          typeof details.lat !== "number" ||
          typeof details.lng !== "number" ||
          !Number.isFinite(details.lat) ||
          !Number.isFinite(details.lng)
        ) {
          continue;
        }
        if (
          !providerRecordMatchesTypedAddress(parsed.formatted, {
            formattedAddress: details.formattedAddress,
            streetNumber: details.streetNumber,
            route: details.route,
            postcode: details.postalCode,
          })
        ) {
          continue;
        }
        return {
          verified: true,
          address: details.formattedAddress,
          formattedAddress: details.formattedAddress,
          displayAddress: parsed.formatted,
          placeId: details.placeId,
          lat: details.lat,
          lng: details.lng,
          countryCode: details.countryCode,
          postalCode: details.postalCode,
          streetNumber: details.streetNumber,
          route: details.route,
          locality: details.locality,
          provider: "getaddress",
        };
      }
    } catch (error) {
      console.error("Manual address getAddress resolve failed", error);
    }
  }

  if (googleKey) {
    try {
      const suggestions = await searchGoogleAddressSuggestions(
        googleKey,
        parsed.formatted,
        airportCode,
      );
      for (const suggestion of suggestions) {
        const details = await resolveGooglePlaceDetails(
          googleKey,
          suggestion.id,
          airportCode,
          undefined,
          parsed.formatted,
          suggestion.mainText,
        );
        if (
          !details ||
          typeof details.lat !== "number" ||
          typeof details.lng !== "number" ||
          !Number.isFinite(details.lat) ||
          !Number.isFinite(details.lng)
        ) {
          continue;
        }
        if (
          !providerRecordMatchesTypedAddress(parsed.formatted, {
            formattedAddress: details.formattedAddress,
            streetNumber: details.streetNumber,
            route: details.route,
            postcode: details.postalCode,
          })
        ) {
          continue;
        }
        return {
          verified: true,
          address: details.displayAddress || details.formattedAddress,
          formattedAddress: details.formattedAddress,
          displayAddress: parsed.formatted,
          placeId: details.placeId,
          lat: details.lat,
          lng: details.lng,
          countryCode: details.countryCode,
          postalCode: details.postalCode,
          streetNumber: details.streetNumber,
          route: details.route,
          locality: details.locality,
          provider: "google",
        };
      }
    } catch (error) {
      if (!isPlacesQuotaError(error)) {
        console.error("Manual address Google resolve failed", error);
      }
    }
  }

  return { verified: false, manual: parsed };
}
