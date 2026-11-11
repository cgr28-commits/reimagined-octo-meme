import type { TownGuidePickup } from "@/lib/selected-place";

/**
 * Approximate town-centre points for the guide price on town pages.
 * Keyed by the town's quote-tool address hint. Guide only: the customer's
 * full address is required before booking.
 */
const TOWN_CENTRES: Record<string, [number, number]> = {
  Antrim: [54.7175, -6.2076],
  Armagh: [54.3503, -6.6528],
  Ballycastle: [55.205, -6.239],
  Ballyclare: [54.751, -6.0],
  Ballymena: [54.864, -6.276],
  Banbridge: [54.349, -6.27],
  Bangor: [54.66, -5.669],
  Belfast: [54.5973, -5.9301],
  Carrickfergus: [54.7158, -5.8058],
  Carryduff: [54.518, -5.888],
  Coleraine: [55.132, -6.668],
  Comber: [54.55, -5.745],
  Cookstown: [54.647, -6.745],
  Craigavon: [54.447, -6.387],
  "Derry~Londonderry": [54.9966, -7.3086],
  Downpatrick: [54.329, -5.715],
  Dundonald: [54.594, -5.806],
  Dungannon: [54.503, -6.77],
  Enniskillen: [54.344, -7.639],
  Glengormley: [54.679, -5.957],
  Hillsborough: [54.464, -6.081],
  Holywood: [54.639, -5.841],
  Larne: [54.853, -5.823],
  Lisburn: [54.512, -6.046],
  Moira: [54.479, -6.231],
  "Newcastle, County Down": [54.218, -5.89],
  Newry: [54.175, -6.34],
  Newtownabbey: [54.662, -5.913],
  Newtownards: [54.592, -5.695],
  Omagh: [54.598, -7.3],
  Whiteabbey: [54.672, -5.901],
};

export function townGuidePickupFor(addressHint: string, townName: string): TownGuidePickup | null {
  const centre = TOWN_CENTRES[addressHint.trim()];
  if (!centre) return null;
  const suffix = townName === "Belfast" || townName.includes("Derry") ? "city centre" : "town centre";
  return { label: `${townName} ${suffix}`, lat: centre[0], lng: centre[1] };
}
