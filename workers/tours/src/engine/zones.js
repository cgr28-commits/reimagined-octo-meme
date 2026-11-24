/**
 * Pick-up and drop-off zones (D13). Coordinates are approximate and only used for provisional estimates.
 * The driver's routing anchor is deliberately NOT here: it lives in estimate.js, is owner configurable, and never leaves the server.
 */
export const ZONES = Object.freeze([
  { id: "belfast-centre", label: "Belfast city centre hotel or address", lat: 54.5973, lng: -5.9301, kind: "city", review: false },
  { id: "belfast-harbour", label: "Belfast Harbour cruise terminal", lat: 54.6172, lng: -5.903, kind: "harbour", review: false },
  { id: "bhd", label: "George Best Belfast City Airport", lat: 54.6181, lng: -5.8725, kind: "airport", review: false },
  { id: "bfs", label: "Belfast International Airport", lat: 54.6575, lng: -6.2158, kind: "airport", review: false },
  { id: "grand-central", label: "Belfast Grand Central Station", lat: 54.5944, lng: -5.936, kind: "station", review: false },
  { id: "greater-belfast", label: "Another Greater Belfast address", lat: 54.6, lng: -5.93, kind: "city", review: true },
  { id: "other-ni", label: "Elsewhere in Northern Ireland (we confirm a supplement)", lat: 54.6, lng: -5.93, kind: "other", review: true },
]);
export const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));
