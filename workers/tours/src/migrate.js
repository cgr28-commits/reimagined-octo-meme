import { SCHEMA } from "./constants.js";
import { blankTour, blankVariant, seedSettings } from "./seed.js";

/**
 * Schema migration that PRESERVES owner settings. Pure.
 *
 * Rule: start from the current seed (so every new field exists) and lay the owner's saved values over it.
 *  - a saved non-null value always wins over the seed default (owner-entered prices, costs, gates, lists, overrides ...)
 *  - an unconfigured value (null or "unconfigured") takes the new seed default, because an unset value is indistinguishable
 *    from "never touched"; this is how newly agreed defaults reach settings the owner never set
 *  - lists the owner may have edited (overrides, approved drivers, photos, zones ...) are kept as saved
 *  - renamed fields are carried across; fields that no longer exist are listed in `notes`, never silently lost
 * The caller must validate the result and refuses to apply it if it is invalid (see settings-do.js).
 */
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isLeaf = (x) => isObj(x) && Object.keys(x).length === 2 && "value" in x && "provisional" in x;
const TOUR_ID_RENAMES = { "cruise-product-1": "cruise-express", "cruise-product-2": "cruise-causeway" };
const OLD_SUBCONTRACTOR = "subcontractor";

function merge(tpl, old, path, notes) {
  if (old === undefined) return tpl;
  if (isLeaf(tpl)) return isLeaf(old) && old.value !== null && old.value !== undefined ? { value: old.value, provisional: typeof old.provisional === "boolean" ? old.provisional : true } : tpl;
  if (Array.isArray(tpl)) return Array.isArray(old) ? old : tpl;
  if (isObj(tpl)) {
    if (!isObj(old)) return tpl;
    for (const k of Object.keys(old)) if (!(k in tpl)) notes.push({ kind: "dropped", path: `${path}.${k}` });
    return Object.fromEntries(Object.keys(tpl).map((k) => [k, merge(tpl[k], old[k], `${path}.${k}`, notes)]));
  }
  if (tpl === null) return old === undefined || (old !== null && typeof old === "object") ? null : old;
  return typeof old === typeof tpl && old !== "unconfigured" ? old : tpl;
}

function applyLegacyRenames(old, notes) {
  const o = structuredClone(old);
  const fin = o?.commercial?.finance;
  if (isObj(fin) && "subcontractorCostCeilingPercent" in fin) {
    fin.subcontractorOwnVehicleCeilingPercent = fin.subcontractorCostCeilingPercent;
    delete fin.subcontractorCostCeilingPercent;
    notes.push({ kind: "renamed", path: "commercial.finance.subcontractorCostCeilingPercent", to: "subcontractorOwnVehicleCeilingPercent", review: "Confirm this ceiling applies to subcontractors using their own vehicle." });
  }
  const models = o?.commercial?.drivers?.models;
  if (isObj(models) && OLD_SUBCONTRACTOR in models) {
    if (models[OLD_SUBCONTRACTOR] === true) notes.push({ kind: "review", path: "commercial.drivers.models.subcontractor", message: "Subcontractors were enabled. Choose own-vehicle or supplied-vehicle; both are left off until you do." });
    delete models[OLD_SUBCONTRACTOR];
  }
  for (const d of o?.commercial?.drivers?.approvedDrivers ?? []) {
    if (Array.isArray(d.models) && d.models.includes(OLD_SUBCONTRACTOR)) {
      d.models = d.models.filter((m) => m !== OLD_SUBCONTRACTOR);
      notes.push({ kind: "review", path: `approvedDrivers.${d.id}`, message: "Old subcontractor model removed from this driver; choose own-vehicle or supplied-vehicle." });
    }
  }
  const overrides = o?.commercial?.finance?.marginOverrides;
  if (Array.isArray(overrides)) {
    o.commercial.finance.marginOverrides = overrides.flatMap((m) => (m && m.model === OLD_SUBCONTRACTOR ? [{ ...m, model: "subcontractorOwnVehicle" }, { ...m, model: "subcontractorSuppliedVehicle" }] : [m]));
  }
  const it = o?.commercial?.itinerary;
  if (isObj(it) && "customItinerariesEnabled" in it) {
    it.smartItineraryBuilderEnabled = it.customItinerariesEnabled;
    delete it.customItinerariesEnabled;
    notes.push({ kind: "renamed", path: "commercial.itinerary.customItinerariesEnabled", to: "smartItineraryBuilderEnabled" });
  }
  if (Array.isArray(o?.commercial?.tours)) {
    for (const t of o.commercial.tours) if (isObj(t) && TOUR_ID_RENAMES[t.id]) { notes.push({ kind: "renamed", path: `tours.${t.id}`, to: TOUR_ID_RENAMES[t.id] }); t.id = TOUR_ID_RENAMES[t.id]; }
  }
  return o;
}

function mergeTour(tpl, old, path, notes) {
  const out = merge({ ...tpl, variants: [] }, { ...old, variants: undefined }, path, notes);
  const oldVariants = Array.isArray(old?.variants) ? old.variants : [];
  if (oldVariants.length) out.variants = oldVariants.map((v, i) => merge({ ...blankVariant(), ...(tpl.variants.find((x) => x.id === v?.id) ?? {}) }, v, `${path}.variants[${i}]`, notes));
  else out.variants = tpl.variants;
  return out;
}

export function migrateSettings(old) {
  const notes = [];
  if (!isObj(old)) return { settings: null, notes: [{ kind: "error", message: "Stored settings are not an object." }] };
  const fromSchema = old.schema;
  const prepared = applyLegacyRenames(old, notes);
  const tpl = seedSettings();
  const out = merge({ ...tpl, commercial: { ...tpl.commercial, tours: [] } }, { ...prepared, commercial: { ...(prepared.commercial ?? {}), tours: undefined } }, "", notes);
  const oldTours = Array.isArray(prepared?.commercial?.tours) ? prepared.commercial.tours.filter(isObj) : [];
  const seeded = tpl.commercial.tours;
  const merged = seeded.map((t, i) => mergeTour(t, oldTours.find((o) => o.id === t.id), `commercial.tours[${i}]`, notes));
  for (const [i, o] of oldTours.entries()) if (!seeded.some((t) => t.id === o.id)) { merged.push(mergeTour({ ...blankTour(), id: o.id }, o, `commercial.tours[${seeded.length + i}]`, notes)); notes.push({ kind: "kept", path: `tours.${o.id}`, message: "Owner-added tour carried across." }); }
  out.commercial.tours = merged;
  out.schema = SCHEMA;
  return { settings: out, fromSchema, notes };
}
