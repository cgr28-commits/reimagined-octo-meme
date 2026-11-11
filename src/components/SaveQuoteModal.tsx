"use client";
import { useEffect, useId, useState } from "react";
import QuoteActionDialog from "@/components/QuoteActionDialog";
import { saveQuote, type SaveQuoteResult } from "@/lib/saved-quote-api";
import { saveQuoteIntroCopy, savedQuoteWhatsAppUrl } from "@/lib/saved-quote-share";
import type { BuildSaveQuotePayloadResult } from "@/lib/save-quote-payload";
import type { SaveQuoteSettings } from "../../shared/save-quote-settings";
export function saveQuoteSubmitErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "We couldn’t save your quote. Please try again.";
}
export default function SaveQuoteModal({ open, onClose, buildPayload, onBookNow, settings, initialWhatsAppRequest = null }: {
  initialWhatsAppRequest?: Promise<SaveQuoteResult> | null;
  open: boolean; onClose: () => void; buildPayload: () => BuildSaveQuotePayloadResult;
  onBookNow: () => void; settings: SaveQuoteSettings;
}) {
  const emailId = useId();
  const mobileId = useId();
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SaveQuoteResult | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    if (!open || !initialWhatsAppRequest) return;
    let active = true;
    setBusy(true); setError(""); setResult(null); setShareUrl("");
    initialWhatsAppRequest.then(saved => {
      if (!active) return;
      setResult(saved);
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setShareUrl(savedQuoteWhatsAppUrl(saved, mobile));
    }).catch(err => { if (active) setError(saveQuoteSubmitErrorMessage(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, initialWhatsAppRequest]);
  if (!open || !settings.enabled) return null;
  function close() { if (!busy) { setResult(null); setError(""); setShareUrl(""); onClose(); } }
  async function submit(channel: "email" | "whatsapp" | "whatsapp_send") {
    if (busy) return;
    const built = buildPayload();
    if (!built.ok) { setError(built.message); return; }
    setBusy(true); setError("");
    try {
      const saved = await saveQuote({
        ...built.payload,
        channel,
        customerEmail: channel === "email" ? email.trim() : "",
        ...(channel === "whatsapp_send" ? { mobile: mobile.trim() } : {}),
      });
      setResult(saved);
      // Not sent by us (or sending was not possible): the customer can still share the saved
      // link from their own WhatsApp.
      if (channel === "whatsapp" || (channel === "whatsapp_send" && saved.whatsappSent !== true)) {
        const onPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        setShareUrl(savedQuoteWhatsAppUrl(saved, onPhone));
      }
    } catch (err) { setError(saveQuoteSubmitErrorMessage(err)); }
    finally { setBusy(false); }
  }
  const sentToWhatsApp = result?.whatsappSent === true;
  const whatsAppNotSent = result?.whatsappSent === false;
  return <QuoteActionDialog title="Send Me My Quote" titleId="save-quote-title" onClose={close} closeDisabled={busy}>
    <div className="space-y-4 text-sm text-white">
      <p>{saveQuoteIntroCopy(result, settings.validityDays)}</p>
      {result ? <>
        <p role="status" data-save-quote-status>{sentToWhatsApp ? `We’ve sent your quote by WhatsApp to the number ending ${result.whatsappToSuffix ?? ""}. Open the message any time to finish booking.` : whatsAppNotSent ? "Your quote is saved, but we couldn’t send the WhatsApp message automatically. Tap below to send it to yourself on WhatsApp instead." : result.emailSent ? `Your quote has been emailed to ${result.email}.` : shareUrl ? "Your quote is saved. Open WhatsApp, choose a recipient and send it yourself." : "Your quote is saved, but the email could not be sent. Keep your secure link below."}</p>
        {result.heldPrice
          ? <p className="break-words">Reference: {result.reference}<br/>Fixed price: {result.heldPrice.amountLabel}<br/>Price held until: {result.heldPrice.heldUntilLabel}</p>
          : <p className="break-words">Reference: {result.reference}<br/>Original fare: {result.amountLabel}<br/>Retrieve until: {result.expiresAtLabel}</p>}
        {shareUrl && <a className="btn-primary block w-full text-center" href={shareUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp to Share</a>}
        {result.heldPrice && <a className={`${shareUrl ? "btn-secondary" : "btn-primary"} block w-full text-center`} href={result.heldPrice.bookingUrl} referrerPolicy="no-referrer">Book now at {result.heldPrice.amountLabel}</a>}
        <a className="btn-secondary block w-full text-center" href={result.quoteUrl} referrerPolicy="no-referrer">Return to My Quote</a>
        {settings.emailEnabled && shareUrl && <button type="button" className="btn-secondary w-full" onClick={() => { setResult(null); setShareUrl(""); }}>Email My Quote instead</button>}
        <button type="button" className="btn-secondary w-full" onClick={() => { close(); onBookNow(); }}>Continue to Booking</button>
      </> : <>
        {settings.emailEnabled && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit("email"); }}>
          <label className="block" htmlFor={emailId}>Email address</label>
          <input id={emailId} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className="quote-text-input min-h-12 w-full rounded-xl bg-navy px-3 text-base" />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Email My Quote"}</button>
        </form>}
        {settings.whatsappEnabled && <form className="space-y-3" data-save-quote-whatsapp onSubmit={event => { event.preventDefault(); void submit("whatsapp_send"); }}>
          <label className="block" htmlFor={mobileId}>Mobile number (WhatsApp)</label>
          <input id={mobileId} type="tel" inputMode="tel" autoComplete="tel" required minLength={9} maxLength={24} placeholder="07xxx xxxxxx" value={mobile} onChange={e => setMobile(e.target.value)} disabled={busy} className="quote-text-input min-h-12 w-full rounded-xl bg-navy px-3 text-base" />
          <button type="submit" disabled={busy} className={`${settings.emailEnabled ? "btn-secondary" : "btn-primary"} w-full`}>{busy ? "Sending…" : "Send to My WhatsApp"}</button>
        </form>}
      </>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <p className="text-xs text-white/70">Sending your quote does not book your journey. We only use your details to send this quote — no marketing or follow-up messages.</p>
    </div>
  </QuoteActionDialog>;
}
