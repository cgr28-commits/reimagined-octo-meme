"use client";
import { useEffect, useState } from "react";
import { normalizeSaveQuoteSettings } from "../../shared/save-quote-settings";
import { updateSaveQuoteSettings, type BookingSettings } from "@/lib/short-notice-api";
export default function OwnerSaveQuoteSettings({ ownerKey, settings, onSaved, fieldClass }: {
  ownerKey: string; settings: BookingSettings | null; onSaved: (v: BookingSettings) => void; fieldClass: string;
}) {
  const [draft, setDraft] = useState(normalizeSaveQuoteSettings(settings?.saveQuote));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setDraft(normalizeSaveQuoteSettings(settings?.saveQuote)); }, [settings?.saveQuote]);
  return <section className="mt-6 space-y-3 rounded-xl border border-white/15 p-4">
    <h3 className="text-lg font-bold">Save My Quote</h3>
    {([['enabled','Enable Save My Quote'],['popupEnabled','Enable timed reminder'],['emailEnabled','Enable email saving'],['whatsappEnabled','Enable WhatsApp saving']] as const).map(([key,label]) => <label key={key} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/>{label}</label>)}
    <label className="block">Popup delay (5–300 seconds)<input type="number" min={5} max={300} step={1} className={fieldClass} value={draft.popupDelaySeconds} onChange={e => setDraft({ ...draft, popupDelaySeconds: Number(e.target.value) })}/></label>
    <label className="block">Quote validity (1–7 days)<input type="number" min={1} max={7} step={1} className={fieldClass} value={draft.validityDays} onChange={e => setDraft({ ...draft, validityDays: Number(e.target.value) })}/></label>
    <p className="text-sm">New quotes use these settings. Existing expiry dates remain unchanged. No automatic follow-up messages.</p>
    <button type="button" disabled={busy} className="btn-primary" onClick={async () => {
      setBusy(true); setMessage("");
      try { onSaved(await updateSaveQuoteSettings(ownerKey,draft)); setMessage("Save My Quote settings saved."); }
      catch (e) { setMessage(e instanceof Error ? e.message : "Could not save settings."); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : "Save quote settings"}</button>
    <p role="status">{message}</p>
  </section>;
}
