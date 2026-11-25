/**
 * Cruise & ferry port catalogue (owner-approved 25 Nov 2026).
 *
 * One catalogue drives the quote-tool port picker, the booking-details stage and the
 * owner's "Cruise & ferry ports" settings. The defaults below are the verified baseline;
 * the owner can switch ports on or off, edit names, addresses, coordinates and pickup
 * instructions, or add new ports. Edits are stored on the existing booking settings
 * document (no new KV key) as `PortSettings` and layered over these defaults.
 *
 * Rules:
 * - A port is only ACTIVE when it has a verified passenger pickup point (finite
 *   coordinates, an address and a place id). Everything else ships inactive.
 * - Never use the middle of an industrial port as a pickup. Coordinates are the passenger
 *   terminal / collection point.
 * - Ports use plain `port-*` place ids unless a Google place id has been confirmed, so a
 *   port is never mistaken for an airport or a street address.
 * - Greencastle and Isle of Man Steam Packet are deliberately not listed (owner, 25 Nov
 *   2026) until current passenger services are officially confirmed.
 */

export type PortRegion = "NI" | "DUBLIN";
export type PortKind = "cruise" | "ferry";

export type PortEntry = {
  id: string;
  /** Customer-facing name in the address box and on emails. */
  name: string;
  /** Short label on the quote-tool tile, e.g. "Stena Belfast VT4 — Cairnryan". Falls back to name. */
  shortName?: string;
  region: PortRegion;
  kind: PortKind;
  /** Ferry operator, e.g. "Stena Line". Null for cruise ports. */
  operator: string | null;
  /** Sailing destination, e.g. "Cairnryan". Null when not applicable. */
  sailsTo: string | null;
  /** Terminal designation, e.g. "VT4" or "Terminal 2". */
  terminal: string | null;
  placeId: string;
  /** Address string used for the confirmed place and shown in the address box. */
  formattedAddress: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  /** Shown to the customer after they pick the port and to the driver on the job. */
  pickupInstructions: string;
  /** Berth moves from call to call, so the exact meeting point is confirmed before travel. */
  berthConfirmation: boolean;
  active: boolean;
  /** Short verification note for the owner. Not shown to customers. */
  note: string;
  /** Added by the owner (not in the built-in catalogue). */
  custom?: boolean;
};

export const PORT_ID_PREFIX = "port-";

export const DEFAULT_PORTS: readonly PortEntry[] = [
  {
    id: "belfast-cruise-terminal",
    name: "Belfast Cruise Terminal",
    shortName: "Belfast Cruise",
    region: "NI",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "ChIJ1bcYVQAJYUgRcTSG80wpzJk",
    formattedAddress: "Belfast Cruise Terminal, 20 Airport Rd W, Belfast BT3 9ED, UK",
    postalCode: "BT3 9ED",
    lat: 54.6259733,
    lng: -5.8841141,
    pickupInstructions:
      "Your driver meets you at the main cruise terminal building on Airport Road West (the taxi and shuttle area outside the terminal). We confirm the exact spot with you before you travel, as berths and access can change on the day.",
    berthConfirmation: true,
    active: true,
    note: "Google place already used by the live site. Cruise lines list the same terminal as 48 Airport Road West, BT3 9EA; Google/Apple list 20 Airport Road West, BT3 9ED. Not labelled D1 (no official Belfast Harbour source). Cruise lines say taxis collect at the front of the terminal building (small, congested area). Belfast Harbour Cruise Code of Conduct: taxis at cruise berths need a Port Pass (safety induction), pre-booked fixed fares must be booked via the operator with a written record in the vehicle. Confirm every driver holds the pass.",
  },
  {
    id: "stena-belfast-cairnryan-vt4",
    name: "Stena Line Belfast — Victoria Terminal 4",
    shortName: "Stena Belfast VT4 — Cairnryan",
    region: "NI",
    kind: "ferry",
    operator: "Stena Line",
    sailsTo: "Cairnryan",
    terminal: "VT4",
    placeId: "port-stena-belfast-vt4",
    formattedAddress: "Stena Line Victoria Terminal 4, West Bank Road, Belfast BT3 9JL, UK",
    postalCode: "BT3 9JL",
    lat: 54.636757,
    lng: -5.882917,
    pickupInstructions:
      "Victoria Terminal 4 is the Stena Line terminal for Cairnryan sailings. Your driver meets you outside the terminal building (not Victoria Terminal 2, which is the Liverpool terminal).",
    berthConfirmation: false,
    active: true,
    note: "Address and GPS from Stena Line (stenaline.co.uk Belfast–Cairnryan port page).",
  },
  {
    id: "stena-belfast-liverpool-vt2",
    name: "Stena Line Belfast — Victoria Terminal 2",
    shortName: "Stena Belfast VT2 — Liverpool",
    region: "NI",
    kind: "ferry",
    operator: "Stena Line",
    sailsTo: "Liverpool",
    terminal: "VT2",
    placeId: "port-stena-belfast-vt2",
    formattedAddress: "Stena Line Victoria Terminal 2, West Bank Road, Belfast BT3 9JN, UK",
    postalCode: "BT3 9JN",
    lat: 54.630042,
    lng: -5.892759,
    pickupInstructions:
      "Victoria Terminal 2 is the Stena Line terminal for Liverpool sailings. Your driver meets you outside the main terminal building (not Victoria Terminal 4, which is the Cairnryan terminal).",
    berthConfirmation: false,
    active: true,
    note: "Address and GPS from Stena Line (stenaline.co.uk Belfast–Liverpool port page).",
  },
  {
    id: "po-larne-cairnryan",
    name: "P&O Ferries Larne",
    shortName: "P&O Larne — Cairnryan",
    region: "NI",
    kind: "ferry",
    operator: "P&O Ferries",
    sailsTo: "Cairnryan",
    terminal: null,
    placeId: "port-po-larne",
    formattedAddress: "P&O Ferries Larne Harbour, Larne BT40 1AW, UK",
    postalCode: "BT40 1AW",
    lat: null,
    lng: null,
    pickupInstructions: "Your driver meets you at the P&O Ferries passenger terminal at Larne Harbour.",
    berthConfirmation: false,
    active: false,
    note: "INACTIVE (re-checked 25 Nov 2026): P&O publishes no Larne address, drop-off point or coordinates on its pages. Only the port authority office (9 Olderfleet Road, BT40 1AS) and the adjacent Larne Harbour rail station (about 54.848, -5.799) are published; neither is the passenger terminal entrance. Needs the terminal pin confirmed on Google Maps or with P&O Larne, then switch on.",
  },
  {
    id: "warrenpoint-port",
    name: "Warrenpoint Port",
    shortName: "Warrenpoint Port",
    region: "NI",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-warrenpoint",
    formattedAddress: "Warrenpoint Harbour, Warrenpoint, Co. Down, UK",
    postalCode: null,
    lat: null,
    lng: null,
    pickupInstructions: "Cruise calls are run through the port agent, so we confirm the exact passenger collection point before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE (re-checked 25 Nov 2026): Warrenpoint Harbour Authority, The Docks, BT34 3JR, is a working freight port with only occasional small expedition-ship calls. No passenger collection point is published, and tenders or berths vary by call. Confirm the pickup point per call with the Harbour Authority (028 4177 3381) before switching on.",
  },
  {
    id: "foyle-port-lisahally",
    name: "Foyle Port — Lisahally",
    shortName: "Foyle Port — Derry",
    region: "NI",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-foyle-lisahally",
    formattedAddress: "Foyle Port, Port Road, Lisahally, Derry BT47 6FL, UK",
    postalCode: "BT47 6FL",
    lat: null,
    lng: null,
    pickupInstructions: "We confirm the passenger collection point at Lisahally before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE: Port Road is the commercial port office; the cruise passenger collection point is not confirmed. Derry-area routes also depend on existing Derry service-area rules.",
  },
  {
    id: "fort-george-derry",
    name: "Fort George cruise berth, Derry",
    shortName: "Fort George — Derry",
    region: "NI",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-fort-george",
    formattedAddress: "Fort George, Derry BT48, UK",
    postalCode: null,
    lat: null,
    lng: null,
    pickupInstructions: "We confirm the passenger collection point at Fort George before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE: small-ship city-centre berth; no verified pickup point.",
  },
  {
    id: "bangor-harbour",
    name: "Bangor Harbour",
    shortName: "Bangor Harbour",
    region: "NI",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-bangor",
    formattedAddress: "Bangor Marina, Bangor BT20, UK",
    postalCode: null,
    lat: null,
    lng: null,
    pickupInstructions: "Passengers land by tender at Bangor Marina. We confirm the meeting point before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE: tender landing at the marina, not a terminal; pickup point not confirmed.",
  },
  {
    id: "irish-ferries-dublin-t1",
    name: "Irish Ferries Dublin — Terminal 1",
    shortName: "Irish Ferries T1 — Dublin",
    region: "DUBLIN",
    kind: "ferry",
    operator: "Irish Ferries",
    sailsTo: "Holyhead",
    terminal: "Terminal 1",
    placeId: "port-irish-ferries-dublin-t1",
    formattedAddress: "Irish Ferries Terminal 1, Terminal Road South, Dublin Port, Dublin 1, Ireland",
    postalCode: null,
    lat: 53.345833,
    lng: -6.194167,
    pickupInstructions:
      "Terminal 1 is the Irish Ferries foot-passenger terminal on Terminal Road South (Stena Line uses Terminal 2). Your driver meets you outside the terminal building.",
    berthConfirmation: false,
    active: true,
    note: "Terminal 1 position from Dublin Port Company (N53 20 45 / W6 11 39). Eircode not yet confirmed.",
  },
  {
    id: "stena-dublin-t2",
    name: "Stena Line Dublin — Terminal 2",
    shortName: "Stena Line T2 — Dublin",
    region: "DUBLIN",
    kind: "ferry",
    operator: "Stena Line",
    sailsTo: "Holyhead",
    terminal: "Terminal 2",
    placeId: "port-stena-dublin-t2",
    formattedAddress: "Stena Line Terminal 2, Alexandra Road, Dublin Port, Dublin D01 WD28, Ireland",
    postalCode: "D01 WD28",
    lat: 53.349866,
    lng: -6.196624,
    pickupInstructions:
      "Terminal 2 is the Stena Line terminal on Alexandra Road (Irish Ferries uses Terminal 1). Your driver meets you outside the terminal building.",
    berthConfirmation: false,
    active: true,
    note: "Address, Eircode and GPS from Stena Line (stenaline.ie Dublin port page).",
  },
  {
    id: "dublin-cruise-port",
    name: "Dublin Cruise Port",
    shortName: "Dublin Cruise Port",
    region: "DUBLIN",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-dublin-cruise",
    formattedAddress: "Dublin Port cruise berths, Dublin 1, Ireland",
    postalCode: null,
    lat: null,
    lng: null,
    pickupInstructions:
      "Cruise passengers are bussed from the berth to No. 2 Branch Road. We confirm the exact collection point before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE: berths vary (30/33/37 Alexandra Basin or 18 North Quay Extension) and passengers exit via a shuttle to No. 2 Branch Road; no verified coordinates or collection process yet.",
  },
  {
    id: "dun-laoghaire-harbour",
    name: "Dún Laoghaire Harbour",
    shortName: "Dún Laoghaire",
    region: "DUBLIN",
    kind: "cruise",
    operator: null,
    sailsTo: null,
    terminal: null,
    placeId: "port-dun-laoghaire",
    formattedAddress: "St Michael's Pier, Dún Laoghaire, Co. Dublin, Ireland",
    postalCode: null,
    lat: null,
    lng: null,
    pickupInstructions: "Cruise passengers land by tender at the harbour. We confirm the meeting point before you travel.",
    berthConfirmation: true,
    active: false,
    note: "INACTIVE: tender landing only (no ferry service now); coordinates and collection point not verified.",
  },
] as const;

/** Owner edits layered over the defaults. Only changed fields are stored. */
export type PortOverride = Partial<
  Pick<
    PortEntry,
    | "name"
    | "shortName"
    | "operator"
    | "sailsTo"
    | "terminal"
    | "placeId"
    | "formattedAddress"
    | "postalCode"
    | "lat"
    | "lng"
    | "pickupInstructions"
    | "berthConfirmation"
    | "active"
  >
>;

export type PortSettings = {
  overrides: Record<string, PortOverride>;
  custom: PortEntry[];
};

export const MAX_CUSTOM_PORTS = 30;

export function defaultPortSettings(): PortSettings {
  return { overrides: {}, custom: [] };
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

function cleanNullableText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  const text = cleanText(value, max);
  if (text === undefined) return undefined;
  return text === "" ? null : text;
}

function cleanCoordinate(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === "") return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return undefined;
  if (num < min || num > max) return undefined;
  return num;
}

// Island of Ireland bounding box (generous), so a typo cannot put a port in the sea.
const LAT_RANGE: [number, number] = [51.3, 55.5];
const LNG_RANGE: [number, number] = [-10.8, -5.2];

function sanitiseOverride(raw: unknown): PortOverride {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PortOverride = {};
  const name = cleanText(source.name, 80);
  if (name) out.name = name;
  const shortName = cleanText(source.shortName, 40);
  if (shortName) out.shortName = shortName;
  const operator = cleanNullableText(source.operator, 60);
  if (operator !== undefined) out.operator = operator;
  const sailsTo = cleanNullableText(source.sailsTo, 60);
  if (sailsTo !== undefined) out.sailsTo = sailsTo;
  const terminal = cleanNullableText(source.terminal, 40);
  if (terminal !== undefined) out.terminal = terminal;
  const placeId = cleanText(source.placeId, 200);
  if (placeId) out.placeId = placeId;
  const address = cleanText(source.formattedAddress, 200);
  if (address) out.formattedAddress = address;
  const postalCode = cleanNullableText(source.postalCode, 12);
  if (postalCode !== undefined) out.postalCode = postalCode;
  const lat = cleanCoordinate(source.lat, LAT_RANGE[0], LAT_RANGE[1]);
  if (lat !== undefined) out.lat = lat;
  const lng = cleanCoordinate(source.lng, LNG_RANGE[0], LNG_RANGE[1]);
  if (lng !== undefined) out.lng = lng;
  const instructions = cleanText(source.pickupInstructions, 600);
  if (instructions !== undefined) out.pickupInstructions = instructions;
  if (typeof source.berthConfirmation === "boolean") out.berthConfirmation = source.berthConfirmation;
  if (typeof source.active === "boolean") out.active = source.active;
  return out;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function sanitiseCustom(raw: unknown, takenIds: Set<string>): PortEntry | null {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const override = sanitiseOverride(source);
  if (!override.name) return null;
  const region: PortRegion = source.region === "DUBLIN" ? "DUBLIN" : "NI";
  const kind: PortKind = source.kind === "ferry" ? "ferry" : "cruise";
  let id = cleanText(source.id, 60) ?? "";
  if (!id.startsWith("custom-")) id = `custom-${slug(override.name)}`;
  let unique = id;
  for (let n = 2; takenIds.has(unique); n += 1) unique = `${id}-${n}`;
  takenIds.add(unique);
  return {
    id: unique,
    name: override.name,
    ...(override.shortName ? { shortName: override.shortName } : {}),
    region,
    kind,
    operator: override.operator ?? null,
    sailsTo: override.sailsTo ?? null,
    terminal: override.terminal ?? null,
    placeId: override.placeId ?? `${PORT_ID_PREFIX}${unique}`,
    formattedAddress: override.formattedAddress ?? override.name,
    postalCode: override.postalCode ?? null,
    lat: override.lat ?? null,
    lng: override.lng ?? null,
    pickupInstructions: override.pickupInstructions ?? "We confirm the exact meeting point before you travel.",
    berthConfirmation: override.berthConfirmation ?? kind === "cruise",
    active: override.active === true,
    note: "Added by the owner.",
    custom: true,
  };
}

/** Tolerant read of whatever is stored: unknown ports/fields are dropped, never thrown on. */
export function normalizePortSettings(raw: unknown): PortSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const builtinIds = new Set(DEFAULT_PORTS.map((port) => port.id));
  const overrides: Record<string, PortOverride> = {};
  const rawOverrides =
    source.overrides && typeof source.overrides === "object"
      ? (source.overrides as Record<string, unknown>)
      : {};
  for (const [id, value] of Object.entries(rawOverrides)) {
    if (!builtinIds.has(id)) continue;
    const clean = sanitiseOverride(value);
    if (Object.keys(clean).length) overrides[id] = clean;
  }
  const taken = new Set(builtinIds);
  const custom: PortEntry[] = [];
  if (Array.isArray(source.custom)) {
    for (const item of source.custom.slice(0, MAX_CUSTOM_PORTS)) {
      const entry = sanitiseCustom(item, taken);
      if (entry) custom.push(entry);
    }
  }
  return { overrides, custom };
}

/** The pickup point is usable only when it has a place id, an address and coordinates. */
export function portHasVerifiedLocation(port: PortEntry): boolean {
  return (
    port.placeId.trim().length > 0 &&
    port.formattedAddress.trim().length > 0 &&
    typeof port.lat === "number" &&
    typeof port.lng === "number" &&
    Number.isFinite(port.lat) &&
    Number.isFinite(port.lng)
  );
}

/** Defaults + owner edits. A port without a verified location can never be active. */
export function resolvePorts(settings?: unknown): PortEntry[] {
  const clean = normalizePortSettings(settings);
  const merged: PortEntry[] = [
    ...DEFAULT_PORTS.map((port) => ({ ...port, ...(clean.overrides[port.id] ?? {}) })),
    ...clean.custom,
  ];
  return merged.map((port) => (port.active && !portHasVerifiedLocation(port) ? { ...port, active: false } : port));
}

export function activePorts(ports: readonly PortEntry[]): PortEntry[] {
  return ports.filter((port) => port.active && portHasVerifiedLocation(port));
}

/** Strips owner-only fields before the list is sent to customers. */
export type PublicPort = Omit<PortEntry, "note" | "custom">;

export function toPublicPorts(ports: readonly PortEntry[]): PublicPort[] {
  return activePorts(ports).map(({ note: _note, custom: _custom, ...rest }) => rest);
}

export function isPortPlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith(PORT_ID_PREFIX);
}

export function findPortByPlaceId(
  ports: readonly Pick<PortEntry, "placeId" | "id">[],
  placeId: string | null | undefined,
): (typeof ports)[number] | null {
  if (!placeId) return null;
  return ports.find((port) => port.placeId === placeId) ?? null;
}

/** Tile label: the short customer-facing name, falling back to the full name. */
export function portTileLabel(port: Pick<PortEntry, "name" | "shortName">): string {
  return port.shortName?.trim() || port.name;
}

/** One-line description of a port for tiles, dashboards, drivers and emails. */
export function portSummaryLine(
  port: Pick<PortEntry, "name" | "operator" | "sailsTo" | "terminal" | "kind">,
): string {
  if (port.kind === "cruise") return "Cruise port";
  const parts = [port.operator, port.terminal, port.sailsTo ? `to ${port.sailsTo}` : null].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Cross-border guard (owner, 25 Nov 2026). A Dublin port may only be part of a journey with
 * Northern Ireland; it may never be paired with another Republic of Ireland place (no local
 * Dublin taxi). `otherIsIreland` is true when the other end is in the Republic.
 */
export function portRouteConflict(input: {
  portRegion: PortRegion;
  otherCountryCode: string | null | undefined;
  otherIsDublinPort?: boolean;
}): string | null {
  if (input.portRegion !== "DUBLIN") return null;
  const other = String(input.otherCountryCode ?? "").toUpperCase();
  if (input.otherIsDublinPort || other === "IE") {
    return "We only run Dublin port transfers to and from Northern Ireland. Please choose a pickup or drop-off in Northern Ireland.";
  }
  return null;
}

/* ── Journey ↔ port resolution (booking, confirmations, amendments) ───────────────────────────── */

type PortRef = Pick<PortEntry, "id" | "placeId" | "lat" | "lng" | "kind" | "operator" | "sailsTo" | "pickupInstructions">;

export type JourneyPortEnds = {
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
};

function portNear(ports: readonly PortRef[], lat?: number | null, lng?: number | null): PortRef | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return (
    ports.find(
      (p) =>
        typeof p.lat === "number" && typeof p.lng === "number" &&
        Math.abs(p.lat - lat) < 0.0015 && Math.abs(p.lng - lng) < 0.0025,
    ) ?? null
  );
}

/** Stable place id first (survives address edits and swaps); coordinates are only a fallback. */
export function resolveJourneyPorts<P extends PortRef>(
  ports: readonly P[],
  ends: JourneyPortEnds,
): { pickupPort: P | null; dropoffPort: P | null } {
  const pick = (placeId?: string | null, lat?: number | null, lng?: number | null) =>
    (findPortByPlaceId(ports, placeId) as P | null) ?? (portNear(ports, lat, lng) as P | null);
  return {
    pickupPort: pick(ends.pickupPlaceId, ends.pickupLat, ends.pickupLng),
    dropoffPort: pick(ends.dropoffPlaceId, ends.dropoffLat, ends.dropoffLng),
  };
}

export type PortPickupNote = { leg: "outbound" | "return"; portId: string; text: string };

/**
 * Where-we-meet-you notes follow the direction of travel: the outbound note only when the port is the
 * pickup; on a return journey the legs reverse, so the drop-off port is the return pickup. A port that
 * is only ever a drop-off never produces a note.
 */
export function portPickupNotes(
  pickupPort: PortRef | null,
  dropoffPort: PortRef | null,
  returnJourney: boolean,
): PortPickupNote[] {
  const notes: PortPickupNote[] = [];
  const add = (leg: PortPickupNote["leg"], port: PortRef | null) => {
    const text = port?.pickupInstructions?.trim();
    if (port && text) notes.push({ leg, portId: port.id, text });
  };
  add("outbound", pickupPort);
  if (returnJourney) add("return", dropoffPort);
  return notes;
}

/** Cruise pickups need the ship name; ferry operator and route come from the terminal. */
export function sailingRequirement(
  pickupPort: PortRef | null,
  dropoffPort: PortRef | null,
  returnJourney: boolean,
): { port: PortRef | null; shipRequired: boolean; prefill: string } {
  const port = pickupPort ?? dropoffPort;
  if (!port) return { port: null, shipRequired: false, prefill: "" };
  const cruisePickup =
    (pickupPort?.kind === "cruise") || (returnJourney && dropoffPort?.kind === "cruise");
  const prefill =
    port.kind === "ferry" && port.operator
      ? `${port.operator}${port.sailsTo ? ` — ${port.sailsTo} sailing` : ""}`
      : "";
  return { port, shipRequired: cruisePickup, prefill };
}
