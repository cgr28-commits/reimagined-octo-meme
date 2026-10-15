"use client";

import { useEffect, useState } from "react";
import { fetchOwnerPricing, saveOwnerPricing } from "@/lib/owner-pricing-api";
import { isBrowserPricingPreview } from "@/lib/pricing-preview-store";
import type { OwnerPricingSettings } from "../../shared/owner-pricing-config";
import { POSTCODE_AIRPORTS, APPROVED_POSTCODE_RULES, validatePostcodeRules, type PostcodeAirport, type PostcodePricingRule } from "../../shared/postcode-pricing";

const field = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-white/15 bg-navy px-3 text-base text-white [color-scheme:dark]";
const empty = { district: "", airportCode: "DUB" as PostcodeAirport, fare: "", enabled: true };
const keyOf = (r: PostcodePricingRule) => `${r.district}:${r.airportCode}`;

export default function OwnerPostcodePricingPanel({ ownerKey }: { ownerKey: string }) {
  const [settings, setSettings] = useState<OwnerPricingSettings | null>(null);
  const [rules, setRules] = useState<PostcodePricingRule[]>([]);
  const [editor, setEditor] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setSettings(null); setError(""); setNotice("");
    void fetchOwnerPricing(ownerKey).then(result => {
      if (!active) return;
      setSettings(result.settings); setRules(result.settings.postcodeRules ?? []);
      setEditor(empty); setEditing(null);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load pricing."); });
    return () => { active = false; };
  }, [ownerKey, reload]);
  const dirty = settings != null && JSON.stringify(rules) !== JSON.stringify(settings.postcodeRules ?? []);
  const supplement = settings?.estate.upliftGbp ?? 0;
  const money = (n: number) => `£${n.toFixed(2)}`;

  function stageRule(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const rule: PostcodePricingRule = { district: editor.district.trim().toUpperCase(), airportCode: editor.airportCode, saloonFareGbp: Number(editor.fare), enabled: editor.enabled };
    const next = [...rules.filter(r => keyOf(r) !== editing), rule];
    const checked = validatePostcodeRules(next);
    if (checked.errors.length) { setError(checked.errors[0]); return; }
    setRules(checked.rules); setEditor(empty); setEditing(null);
  }
  async function save() {
    if (!settings || saving) return;
    if (!window.confirm("Save these postcode rules? Enabled rules will apply to new quotes from the district to the selected airport. Existing paid bookings are not changed.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await saveOwnerPricing(ownerKey, { ...settings, postcodeRules: rules }, settings.version);
      setSettings(result.settings); setRules(result.settings.postcodeRules ?? []);
      setNotice(isBrowserPricingPreview() ? "Saved in this isolated preview only. Live prices are unchanged." : "Postcode pricing rules saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rules. Reload pricing and try again."); }
    finally { setSaving(false); }
  }
  const shown = rules.filter(r => `${r.district} ${POSTCODE_AIRPORTS[r.airportCode]} ${r.airportCode} ${r.enabled ? "enabled" : "disabled"}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="min-w-0 rounded-2xl border border-white/10 bg-navy/50 p-4 sm:p-5">
    <h2 className="text-xl font-bold text-white">Postcode Pricing</h2>
    <p className="mt-2 text-sm leading-relaxed text-white/70">Fixed fares from a postcode district to an airport, for Saloon and Estate only. Reverse one-way journeys keep their existing pricing. Standard airport charges, including terminal drop-off, are already included in these totals.</p>
    {isBrowserPricingPreview() ? <p className="mt-3 rounded-xl border border-emerald/30 bg-emerald/10 p-3 text-sm text-white">Isolated preview — no live pricing changes.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-emerald">{notice}</p> : null}
    <button type="button" className="btn-secondary mt-3 px-4" disabled={saving} onClick={() => { if (!dirty || window.confirm("Discard unsaved postcode changes and reload pricing?")) setReload(v => v + 1); }}>Reload pricing</button>
    {!settings ? <p role="status" className="mt-4 text-white/70">{error ? "Pricing is unavailable. Use Reload pricing to try again." : "Loading pricing…"}</p> : <>
      <p className="mt-4 text-sm text-white/80">Estate uses the existing Pricing supplement: <strong>{money(supplement)}</strong>. Change it in Pricing, not here.</p>
      <fieldset disabled={saving} className="mt-4 min-w-0">
        <legend className="font-semibold text-white">{editing ? "Edit pricing rule" : "Add pricing rule"}</legend>
        <form onSubmit={stageRule} className="mt-2 grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm text-white/80">Postcode district<input required aria-label="Postcode district" className={field} value={editor.district} placeholder="BT1" onChange={e => setEditor({ ...editor, district: e.target.value })} /></label>
          <label className="min-w-0 text-sm text-white/80">Destination airport<select aria-label="Destination airport" className={field} value={editor.airportCode} onChange={e => setEditor({ ...editor, airportCode: e.target.value as PostcodeAirport })}>{Object.entries(POSTCODE_AIRPORTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label className="min-w-0 text-sm text-white/80">Fixed Saloon fare (£)<input required type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" aria-label="Fixed Saloon fare" className={field} value={editor.fare} onChange={e => setEditor({ ...editor, fare: e.target.value })} /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-white"><input type="checkbox" checked={editor.enabled} onChange={e => setEditor({ ...editor, enabled: e.target.checked })} />Rule enabled</label>
          <button type="submit" className="btn-secondary px-4">{editing ? "Update draft rule" : "Add to draft"}</button>
          {editing ? <button type="button" className="btn-secondary px-4" onClick={() => { setEditor(empty); setEditing(null); }}>Cancel edit</button> : null}
        </form>
      </fieldset>
      {rules.length === 0 ? <button type="button" disabled={saving} className="btn-secondary mt-4 px-4" onClick={() => { setRules(APPROVED_POSTCODE_RULES.map(r => ({ ...r }))); setNotice("BT1 and BT2 airport rules added to the unsaved draft. Review before saving."); }}>Load approved BT1 / BT2 airport rules</button> : null}
      <label className="mt-5 block text-sm text-white/80">Search configured rules<input type="search" aria-label="Search configured rules" className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="Postcode, airport or status" /></label>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full text-left text-sm text-white"><caption className="sr-only">Postcode pricing rules — district to airport only</caption><thead><tr className="border-b border-white/15">{["District", "Destination", "Saloon", "Estate", "Enabled", "Actions"].map(t => <th key={t} scope="col" className="p-2">{t}</th>)}</tr></thead><tbody>{shown.map(r => <tr key={keyOf(r)} className="border-b border-white/10">
          <th scope="row" className="p-2">{r.district}</th><td className="p-2">{POSTCODE_AIRPORTS[r.airportCode]}</td><td className="whitespace-nowrap p-2">{money(r.saloonFareGbp)}</td><td className="whitespace-nowrap p-2">{money(r.saloonFareGbp + supplement)}</td>
          <td className="p-2"><input type="checkbox" aria-label={`Enable ${r.district} to ${r.airportCode}`} checked={r.enabled} disabled={saving} onChange={e => setRules(rules.map(x => keyOf(x) === keyOf(r) ? { ...x, enabled: e.target.checked } : x))} /></td>
          <td className="p-2"><div className="flex gap-2"><button type="button" disabled={saving} className="min-h-11 rounded-lg border border-white/15 px-3" onClick={() => { setEditing(keyOf(r)); setEditor({ district: r.district, airportCode: r.airportCode, fare: String(r.saloonFareGbp), enabled: r.enabled }); }}>Edit<span className="sr-only"> {r.district} to {r.airportCode}</span></button><button type="button" disabled={saving} className="min-h-11 rounded-lg border border-white/15 px-3" onClick={() => { if (window.confirm(`Delete the ${r.district} to ${r.airportCode} rule from the draft? Save changes to apply deletion.`)) { setRules(rules.filter(x => keyOf(x) !== keyOf(r))); if (editing === keyOf(r)) { setEditing(null); setEditor(empty); } } }}>Delete<span className="sr-only"> {r.district} to {r.airportCode}</span></button></div></td>
        </tr>)}</tbody></table>
      </div>
      <p className="mt-2 text-xs text-white/70 sm:hidden">Swipe the table to see Enabled and Actions.</p>
      {!shown.length ? <p className="mt-3 text-sm text-white/60">No rules found.</p> : null}
      <p role="status" className="mt-4 text-sm text-white/70">{dirty ? "Unsaved changes — not applied to live quotes." : "No unsaved changes."}</p>
      <button type="button" className="btn-primary mt-3 w-full px-4 sm:w-auto" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save postcode pricing"}</button>
    </>}
  </section>;
}
