"use client";
import { useId, useState } from "react";
import QuoteActionDialog from "@/components/QuoteActionDialog";
import { saveQuote, type SaveQuoteResult } from "@/lib/saved-quote-api";
import { savedQuoteWhatsAppUrl } from "@/lib/saved-quote-share";
import type { BuildSaveQuotePayloadResult } from "@/lib/save-quote-payload";
import type { SaveQuoteSettings } from "../../shared/save-quote-settings";
export function saveQuoteSubmitErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "We couldn’t save your quote. Please try again.";
}
export default function SaveQuoteModal({ open, onClose, buildPayload, onBookNow, settings }: {
  open: boolean; onClose: () => void; buildPayload: () => BuildSaveQuotePayloadResult;
  onBookNow: () => void; settings: SaveQuoteSettings;
}) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SaveQuoteResult | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  if (!open || !settings.enabled) return null;
  function close() { if (!busy) { setResult(null); setError(""); setShareUrl(""); onClose(); } }
  async function submit(channel: "email" | "whatsapp") {
    if (busy) return;
    const built = buildPayload();
    if (!built.ok) { setError(built.message); return; }
    setBusy(true); setError("");
    try {
      const saved = await saveQuote({ ...built.payload, channel, customerEmail: channel === "email" ? email.trim() : "" });
      setResult(saved);
      if (channel === "whatsapp") {
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        setShareUrl(savedQuoteWhatsAppUrl(saved, mobile));
      }
    } catch (err) { setError(saveQuoteSubmitErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <QuoteActionDialog title="Save My Quote" titleId="save-quote-title" onClose={close} closeDisabled={busy}>
    <div className="space-y-4 text-sm text-white">
      <p>Retrieve your quote for {settings.validityDays} days. Your fare will be recalculated before booking. No obligation to book.</p>
      {result ? <>
        <p role="status">{result.emailSent ? `Your quote has been emailed to ${result.email}.` : shareUrl ? "Your quote is saved. Open WhatsApp, choose a recipient and send it yourself." : "Your quote is saved, but the email could not be sent. Keep your secure link below."}</p>
        <p className="break-words">Reference: {result.reference}<br/>Original fare: {result.amountLabel}<br/>Retrieve until: {result.expiresAtLabel}</p>
        {shareUrl && <a className="btn-primary block w-full text-center" href={shareUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp to Share</a>}
        <a className="btn-secondary block w-full text-center" href={result.quoteUrl} referrerPolicy="no-referrer">Return to My Quote</a>
        {settings.emailEnabled && shareUrl && <button type="button" className="btn-secondary w-full" onClick={() => { setResult(null); setShareUrl(""); }}>Email My Quote instead</button>}
        <button type="button" className="btn-secondary w-full" onClick={() => { close(); onBookNow(); }}>Continue to Booking</button>
      </> : <>
        {settings.emailEnabled && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit("email"); }}>
          <label className="block" htmlFor={emailId}>Email address</label>
          <input id={emailId} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className="quote-text-input min-h-12 w-full rounded-xl bg-navy px-3 text-base" />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Email My Quote"}</button>
        </form>}
        {settings.whatsappEnabled && <button type="button" disabled={busy} className="btn-secondary w-full" onClick={() => void submit("whatsapp")}>Save via WhatsApp</button>}
      </>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <p className="text-xs text-white/70">Saving does not book your journey. We won’t subscribe you to marketing or send follow-up messages.</p>
    </div>
  </QuoteActionDialog>;
}
