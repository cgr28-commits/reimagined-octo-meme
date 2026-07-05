export {
  extractPostcode,
  GETADDRESS_NI_FILTER,
  isAddressAllowedForAirport,
  isAllowedCoordinates,
  isNorthernIrelandAddressParts,
  isNorthernIrelandCoordinates,
  isNorthernIrelandPostcode,
  isNorthernIrelandText,
  isRepublicOfIrelandAddressParts,
} from "./northern-ireland";

export type FormattableAddress = {
  line_1?: string;
  line_2?: string;
  line_3?: string;
  town_or_city?: string;
  county?: string;
  postcode?: string;
};

export function formatGetAddressDetail(detail: FormattableAddress): string {
  return [
    detail.line_1,
    detail.line_2,
    detail.line_3,
    detail.town_or_city,
    detail.county,
    detail.postcode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function formatNominatimAddress(address: {
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  postcode?: string;
}): string {
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const locality =
    address.city ?? address.town ?? address.village ?? address.suburb ?? address.county;
  return [street, locality, address.postcode].filter(Boolean).join(", ");
}
