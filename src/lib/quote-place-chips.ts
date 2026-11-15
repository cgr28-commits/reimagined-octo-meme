import type { SelectedPlace } from "@/lib/selected-place";

/**
 * One-tap place chips under a route page's quote tool (owner, 15 Nov 2026: only fixed
 * travel hubs such as cruise ports, never hotels or streets). Each chip fills the
 * non-airport box with an exact, already-confirmed place so the price works straight away.
 */
export type PlaceChipId = "belfast-cruise-terminal";

export type PlaceChip = { id: PlaceChipId; label: string; place: SelectedPlace };

const PLACE_CHIPS: Record<PlaceChipId, PlaceChip> = {
  "belfast-cruise-terminal": {
    id: "belfast-cruise-terminal",
    label: "Belfast Cruise Terminal",
    place: {
      placeId: "ChIJ1bcYVQAJYUgRcTSG80wpzJk",
      formattedAddress: "20 Airport Rd W, Belfast BT3 9ED, UK",
      displayAddress: "Belfast Cruise Terminal, 20 Airport Rd W, Belfast BT3 9ED, UK",
      placeName: "Belfast Cruise Terminal",
      lat: 54.6259733,
      lng: -5.8841141,
      countryCode: "GB",
      postalCode: "BT3 9ED",
      streetNumber: "20",
      route: "Airport Road West",
      locality: "Belfast",
      administrativeArea: null,
    },
  },
};

export function getPlaceChips(ids: readonly PlaceChipId[] | undefined): PlaceChip[] {
  return (ids ?? []).map((id) => PLACE_CHIPS[id]).filter(Boolean);
}
