/**
 * Operating base for internal profitability routing only.
 *
 * This file must stay Worker-side. Do not import it from shared/, src/components,
 * public quote handlers' response builders, emails, or analytics.
 *
 * 7 Glen Manor Road, Newtownabbey, BT36 7FU.
 * OpenStreetMap has no house-number pin for this address. The coordinate is a
 * point on the mapped Glen Manor Road centreline, about 70 metres from the
 * northern end of the road. A later pin correction does not change the formula.
 */

export const OPERATING_BASE = {
  lat: 54.66598,
  lng: -5.97026,
} as const;
