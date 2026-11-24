/**
 * SERVER ONLY. The driver routing anchor (owner-configurable; initially village-level Glengormley, never a street address).
 * Deliberately outside src/engine so it is never bundled into the customer website. The browser engine uses the pickup point as its
 * neutral anchor, so customers never see or can derive driver positioning.
 */
export const DEFAULT_ANCHOR = Object.freeze({ lat: 54.683, lng: -5.82 });
