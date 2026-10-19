"use client";

import { useEffect, useId, useRef, useState } from "react";
import QuoteActionDialog from "@/components/QuoteActionDialog";
import { sendDesktopQuoteEnquiry, validateDesktopEnquiry, type DesktopEnquiry } from "@/lib/desktop-quote-enquiry";
import { SITE } from "@/lib/data";

export default function DesktopQuoteEnquiry({ journey, className }: { journey: string; className: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const submission = useRef<Readonly<DesktopEnquiry> | null>(null);
  const [submitted, setSubmitted] = useState<Readonly<DesktopEnquiry> | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnMobile = () => { if (!desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnMobile);
    return () => desktop.removeEventListener("change", closeOnMobile);
  }, []);
  return <>
    <button type="button" className={`${className} desktop-enquiry-trigger`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { if (window.matchMedia("(min-width: 1024px)").matches) { setOpen(true); setSent(false); setError(""); } }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[1.15rem] w-[1.15rem]" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
      <span>Email Enquiry</span>
    </button>
    {open ? <QuoteActionDialog title={sent ? "Enquiry Sent Successfully" : "Email enquiry"} onClose={() => setOpen(false)}>
      {sent ? <div role="status" data-desktop-enquiry-status className="space-y-4 text-white"><p>Thank you for contacting My Airport Taxi NI.</p><p>{"We've received your enquiry and will get back to you as soon as possible."}</p><button type="button" className="btn-primary w-full" onClick={() => setOpen(false)}>Back to your quote</button></div> :
        <form data-desktop-enquiry-form className="space-y-4" aria-busy={sending} onSubmit={async event => {
          event.preventDefault();
          // React portal events still bubble through the parent quote form.
          // An enquiry must never advance that form into the booking flow.
          event.stopPropagation();
          if (submission.current) return;
          const input = Object.freeze({ name, email, message, journey });
          const invalid = validateDesktopEnquiry(input); if (invalid) { setError(invalid); return; }
          submission.current = input;
          setSubmitted(input);
          setSending(true); setError("");
          try { await sendDesktopQuoteEnquiry(input); setSent(true); }
          catch (failure) { setError(failure instanceof Error && failure.name !== "AbortError" && !(failure instanceof TypeError) ? failure.message : "We couldn't confirm delivery. Your quote is still here. Contact us using the address below before retrying."); }
          finally { submission.current = null; setSending(false); }
        }}>
          <p className="whitespace-pre-line rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/85">{sending && submitted ? submitted.journey : journey}</p>
          <p className="text-xs text-white/70">These quote details will be included automatically. Sending an enquiry does not reserve a transfer.</p>
          <label className="block text-sm text-white" htmlFor={`${id}-name`}>Customer name<input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={80} value={name} disabled={sending} onChange={event => setName(event.target.value)} className="quote-text-input mt-1 min-h-12 w-full rounded-xl border border-white/32 bg-navy px-3 py-2 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald" /></label>
          <label className="block text-sm text-white" htmlFor={`${id}-email`}>Customer email<input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} value={email} disabled={sending} onChange={event => setEmail(event.target.value)} className="quote-text-input mt-1 min-h-12 w-full rounded-xl border border-white/32 bg-navy px-3 py-2 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald" /></label>
          <label className="block text-sm text-white" htmlFor={`${id}-message`}>Message (optional)<textarea id={`${id}-message`} name="message" rows={3} maxLength={2000} value={message} disabled={sending} onChange={event => setMessage(event.target.value)} className="quote-text-input mt-1 min-h-12 w-full rounded-xl border border-white/32 bg-navy px-3 py-2 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald" /></label>
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" disabled={sending} className="btn-primary w-full disabled:opacity-60">{sending ? "Sending enquiry…" : "Send email enquiry"}</button>
          <p className="text-xs text-white/70">Contact: <span className="break-all">{SITE.email}</span>. <a href="/privacy/" className="underline">Privacy policy</a></p>
        </form>}
    </QuoteActionDialog> : null}
  </>;
}
