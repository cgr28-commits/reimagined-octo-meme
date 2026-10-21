"use client";

import { useEffect, useState } from "react";
import { fetchOwnerPricing, saveOwnerPricing } from "@/lib/owner-pricing-api";
import { isBrowserPricingPreview } from "@/lib/pricing-preview-store";
import type { OwnerPricingSettings } from "../../shared/owner-pricing-config";
import { POSTCODE_AIRPORTS, BT_DISTRICTS, postcodeRuleKey, postcodeRuleApproved, postcodeRuleApproval, postcodePricingIsEnabled, validatePostcodeRules, type PostcodeDirection, type PostcodeApproval, type PostcodeAirport, type PostcodePricingRule } from "../../shared/postcode-pricing";
import { approvedStartingRules, workbookDraftRules, mergeMissingPostcodeRules } from "@/lib/postcode-pricing-drafts";
import { exportPostcodeCsv, importPostcodeCsv } from "@/lib/postcode-pricing-csv";
import OwnerPostcodeProfitabilityPreview from "@/components/OwnerPostcodeProfitabilityPreview";

const field = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-white/15 bg-navy px-3 text-base text-white [color-scheme:dark]";
const empty = { district: "", airportCode: "DUB" as PostcodeAirport, fare: "", enabled: false, direction: "to-airport" as PostcodeDirection, approvalStatus: "draft" as PostcodeApproval };
const keyOf = postcodeRuleKey;

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
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [airportFilter, setAirportFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [previewRule, setPreviewRule] = useState<PostcodePricingRule | null>(null);
  const [page, setPage] = useState(1);
  const [editorSupported, setEditorSupported] = useState(false);
  useEffect(() => {
    let active = true;
    setSettings(null); setError(""); setNotice("");
    void fetchOwnerPricing(ownerKey).then(result => {
      if (!active) return;
      setSettings(result.settings); setRules(result.settings.postcodeRules ?? []);
      setFeatureEnabled(postcodePricingIsEnabled(result.settings.postcodePricingEnabled, result.settings.postcodeRules)); setPreviewRule(null); setPage(1);
      setEditorSupported(isBrowserPricingPreview() || result.postcodeRulesEditorVersion === 2);
      setEditor(empty); setEditing(null);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load pricing."); });
    return () => { active = false; };
  }, [ownerKey, reload]);
  const dirty = settings != null && (JSON.stringify(rules) !== JSON.stringify(settings.postcodeRules ?? []) || featureEnabled !== postcodePricingIsEnabled(settings.postcodePricingEnabled, settings.postcodeRules));
  const supplement = settings?.estate.upliftGbp ?? 0;
  const money = (n: number) => `£${n.toFixed(2)}`;

  function stageRule(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const rule: PostcodePricingRule = { district: editor.district.trim().toUpperCase(), airportCode: editor.airportCode, saloonFareGbp: Number(editor.fare), enabled: editor.enabled, direction: editor.direction, approvalStatus: editor.approvalStatus };
    const next = [...rules.filter(r => keyOf(r) !== editing), rule];
    const checked = validatePostcodeRules(next);
    if (checked.errors.length) { setError(checked.errors[0]); return; }
    setRules(checked.rules); setEditor(empty); setEditing(null); setPreviewRule(null);
  }
  async function save() {
    if (!settings || saving || !editorSupported) return;
    if (!window.confirm(featureEnabled ? "Save with postcode pricing ON? Only enabled, approved rules in the selected direction will apply to new quotes. Existing paid bookings are unchanged." : "Save postcode settings with the feature OFF? Rules will be stored but will not affect customer quotes.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await saveOwnerPricing(ownerKey, { ...settings, postcodeRules: rules, postcodePricingEnabled: featureEnabled }, settings.version);
      setSettings(result.settings); setRules(result.settings.postcodeRules ?? []);
      setNotice(isBrowserPricingPreview() ? "Saved in this isolated preview only. Live prices are unchanged." : "Postcode pricing rules saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rules. Reload pricing and try again."); }
    finally { setSaving(false); }
  }
  const shown = rules.filter(r => (!airportFilter || r.airportCode === airportFilter) && (!directionFilter || (r.direction ?? "to-airport") === directionFilter) && (!statusFilter || (statusFilter === "enabled" ? r.enabled : statusFilter === "disabled" ? !r.enabled : postcodeRuleApproval(r) === statusFilter)) && `${r.district} ${POSTCODE_AIRPORTS[r.airportCode]} ${r.airportCode} ${r.enabled ? "enabled" : "disabled"}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(shown.length / 25)), currentPage = Math.min(page, pages);
  const visibleRules = shown.slice((currentPage - 1) * 25, currentPage * 25);
  function stageMissing(incoming: PostcodePricingRule[]) {
    const next = mergeMissingPostcodeRules(rules, incoming), checked = validatePostcodeRules(next);
    if (checked.errors.length) { setError(checked.errors[0]); return; }
    setRules(checked.rules); setError(""); setNotice(`${next.length - rules.length} missing rules added to the unsaved draft, all inactive. Existing rules were preserved.`);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try { stageMissing(importPostcodeCsv(await file.text())); } catch (e) { setError(e instanceof Error ? e.message : "CSV import failed."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exportPostcodeCsv(rules)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "postcode-pricing.csv"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="min-w-0 rounded-2xl border border-white/10 bg-navy/50 p-4 sm:p-5">
    <h2 className="text-xl font-bold text-white">Postcode Pricing</h2>
    <p className="mt-2 text-sm leading-relaxed text-white/70">Archived postcode rules. New customer quotes use £10 + £2.20 per passenger road mile, minimum £30, with airport charges and tolls added separately. These saved rules no longer set fares.</p>
    {isBrowserPricingPreview() ? <p className="mt-3 rounded-xl border border-emerald/30 bg-emerald/10 p-3 text-sm text-white">Isolated preview — no live pricing changes.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-emerald">{notice}</p> : null}
    <button type="button" className="btn-secondary mt-3 px-4" disabled={saving} onClick={() => { if (!dirty || window.confirm("Discard unsaved postcode changes and reload pricing?")) setReload(v => v + 1); }}>Reload pricing</button>
    {!settings ? <p role="status" className="mt-4 text-white/70">{error ? "Pricing is unavailable. Use Reload pricing to try again." : "Loading pricing…"}</p> : <>
      <p className="mt-4 text-sm text-white/80">Estate uses the existing Pricing supplement: <strong>{money(supplement)}</strong>. Change it in Pricing, not here.</p>
      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-emerald/30 p-3 text-white"><input aria-label="Enable postcode pricing feature" type="checkbox" disabled checked={false} onChange={e => setFeatureEnabled(e.target.checked)} /><span>Postcode pricing feature: <strong>{featureEnabled ? "ON" : "OFF"}</strong> — retired</span></label>
      <p className="mt-2 text-sm text-white/70">Rules are retained for reference. Enabling postcode pricing cannot override the mileage tariff.</p>
      {!editorSupported ? <p role="status" className="mt-3 text-sm text-amber-200">Postcode management upgrade pending. Existing fares remain active. Editing becomes available once the Worker upgrade is deployed; reload pricing then.</p> : null}
      <fieldset disabled={saving || !editorSupported} className="mt-4 min-w-0">
        <legend className="font-semibold text-white">{editing ? "Edit pricing rule" : "Add pricing rule"}</legend>
        <form onSubmit={stageRule} className="mt-2 grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm text-white/80">Postcode district<input required list="bt-districts" aria-label="Postcode district" className={field} value={editor.district} placeholder="BT1" onChange={e => setEditor({ ...editor, district: e.target.value })} /><datalist id="bt-districts">{BT_DISTRICTS.map(d => <option key={d} value={d} />)}</datalist></label>
          <label className="min-w-0 text-sm text-white/80">Destination airport<select aria-label="Destination airport" className={field} value={editor.airportCode} onChange={e => setEditor({ ...editor, airportCode: e.target.value as PostcodeAirport })}>{Object.entries(POSTCODE_AIRPORTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label className="min-w-0 text-sm text-white/80">Fixed Saloon fare (£)<input required type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" aria-label="Fixed Saloon fare" className={field} value={editor.fare} onChange={e => setEditor({ ...editor, fare: e.target.value })} /></label>
          <label className="min-w-0 text-sm text-white/80">Direction<select aria-label="Journey direction" className={field} value={editor.direction} onChange={e => setEditor({ ...editor, direction: e.target.value as PostcodeDirection })}><option value="to-airport">District → Airport</option><option value="from-airport">Airport → District</option></select></label>
          <label className="min-w-0 text-sm text-white/80">Approval<select aria-label="Fare approval" className={field} value={editor.approvalStatus} onChange={e => setEditor({ ...editor, approvalStatus: e.target.value as PostcodeApproval, enabled: false })}><option value="draft">Draft</option><option value="needs-verification">Needs mileage verification</option><option value="approved">Approved by owner</option></select></label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-white"><input type="checkbox" disabled={editor.approvalStatus !== "approved"} checked={editor.enabled} onChange={e => setEditor({ ...editor, enabled: e.target.checked })} />Rule enabled</label>
          <button type="submit" className="btn-secondary px-4">{editing ? "Update draft rule" : "Add to draft"}</button>
          {editing ? <button type="button" className="btn-secondary px-4" onClick={() => { setEditor(empty); setEditing(null); }}>Cancel edit</button> : null}
        </form>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={saving || !editorSupported} className="btn-secondary px-4" onClick={() => stageMissing(approvedStartingRules())}>Load approved BT1 / BT2 airport rules</button><button type="button" disabled={saving || !editorSupported} className="btn-secondary px-4" onClick={() => stageMissing(workbookDraftRules())}>Load inactive workbook drafts</button><button type="button" className="btn-secondary px-4" onClick={download}>Export CSV</button><label className="btn-secondary cursor-pointer px-4 py-3">Import CSV<input aria-label="Import postcode CSV" type="file" accept=".csv,text/csv" disabled={saving || !editorSupported} className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
      <p className="mt-2 text-xs text-white/70">CSV imports add missing rules only, inactive and requiring verification. Existing keys are skipped, not overwritten. Export includes unsaved drafts. Workbook: 80 geographic districts; BT58 has no draft fare.</p>
      <label className="mt-5 block text-sm text-white/80">Search configured rules<input type="search" aria-label="Search configured rules" className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="Postcode, airport or status" /></label>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3"><label className="min-w-0 text-sm text-white/80">Airport filter<select aria-label="Airport filter" className={field} value={airportFilter} onChange={e => setAirportFilter(e.target.value)}><option value="">All airports</option>{Object.entries(POSTCODE_AIRPORTS).map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="min-w-0 text-sm text-white/80">Status filter<select aria-label="Status filter" className={field} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{["approved","draft","needs-verification","enabled","disabled"].map(s => <option key={s} value={s}>{s}</option>)}</select></label><label className="min-w-0 text-sm text-white/80">Direction filter<select aria-label="Direction filter" className={field} value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}><option value="">Both directions</option><option value="to-airport">To airport</option><option value="from-airport">From airport</option></select></label></div>
      <details className="mt-3 text-sm text-white/80"><summary className="cursor-pointer">View all BT districts</summary><p className="mt-2 leading-relaxed">{BT_DISTRICTS.join(", ")}</p><p className="mt-2">No configured rule means ordinary pricing. BT58 is non-geographic; a full routable address is required.</p></details>
      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full text-left text-sm text-white"><caption className="sr-only">Directional postcode pricing rules</caption><thead><tr className="border-b border-white/15">{["District", "Airport", "Saloon", "Estate", "Direction / approval", "Last changed", "Enabled", "Actions"].map(t => <th key={t} scope="col" className="p-2">{t}</th>)}</tr></thead><tbody>{visibleRules.map(r => <tr key={keyOf(r)} className="border-b border-white/10">
          <th scope="row" className="p-2">{r.district}</th><td className="p-2">{POSTCODE_AIRPORTS[r.airportCode]}</td><td className="whitespace-nowrap p-2">{money(r.saloonFareGbp)}</td><td className="whitespace-nowrap p-2">{money(r.saloonFareGbp + supplement)}</td>
          <td className="p-2">{r.direction === "from-airport" ? "From airport" : "To airport"}<br />{postcodeRuleApproval(r)}</td><td className="p-2">{r.updatedAt ? new Date(r.updatedAt).toLocaleString("en-GB") : "Not recorded / unsaved"}</td>
          <td className="p-2"><input type="checkbox" aria-label={`Enable ${r.district} ${r.direction ?? "to-airport"} ${r.airportCode}`} checked={r.enabled} disabled={saving || !editorSupported || !postcodeRuleApproved(r)} onChange={e => setRules(rules.map(x => keyOf(x) === keyOf(r) ? { ...x, enabled: e.target.checked } : x))} /></td>
          <td className="p-2"><div className="flex gap-2"><button type="button" disabled={saving || !editorSupported} className="min-h-11 rounded-lg border border-white/15 px-3" onClick={() => { setEditing(keyOf(r)); setEditor({ district: r.district, airportCode: r.airportCode, fare: String(r.saloonFareGbp), enabled: r.enabled, direction: r.direction ?? "to-airport", approvalStatus: postcodeRuleApproval(r) }); }}>Edit<span className="sr-only"> {keyOf(r)}</span></button><button type="button" disabled={saving || !editorSupported} className="min-h-11 rounded-lg border border-white/15 px-3" onClick={() => { if (window.confirm(`Delete ${keyOf(r)} from the draft? Save changes to apply deletion.`)) { setRules(rules.filter(x => keyOf(x) !== keyOf(r))); if (editing === keyOf(r)) { setEditing(null); setEditor(empty); } setPreviewRule(null); } }}>Delete<span className="sr-only"> {keyOf(r)}</span></button><button type="button" className="min-h-11 rounded-lg border border-white/15 px-3" onClick={() => setPreviewRule({ ...r })}>Preview<span className="sr-only"> {keyOf(r)}</span></button></div></td>
        </tr>)}</tbody></table>
      </div>
      <p className="mt-2 text-xs text-white/70 sm:hidden">Swipe the table to see Enabled and Actions.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/80"><p role="status">{shown.length} matching rules · Page {currentPage} of {pages}</p><button type="button" className="btn-secondary px-3" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous rules</button><button type="button" className="btn-secondary px-3" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next rules</button></div>
      {!shown.length ? <p className="mt-3 text-sm text-white/60">No rules found.</p> : null}
      {previewRule ? <OwnerPostcodeProfitabilityPreview key={JSON.stringify(previewRule)} ownerKey={ownerKey} rule={previewRule} supplement={supplement} isolated={isBrowserPricingPreview() || !editorSupported} /> : null}
      <p role="status" className="mt-4 text-sm text-white/70">{dirty ? "Unsaved changes — not applied to live quotes." : "No unsaved changes."}</p>
      <button type="button" className="btn-primary mt-3 w-full px-4 sm:w-auto" disabled={!dirty || saving || !editorSupported} onClick={() => void save()}>{saving ? "Saving…" : "Save postcode pricing"}</button>
    </>}
  </section>;
}
