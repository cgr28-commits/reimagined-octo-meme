"use client";

/**
 * Email a customer from their booking. Subject is pre-filled with the booking reference,
 * pickup date/time and route; booking details and the logo signature are added to the email.
 */
import { useEffect, useState } from "react";
import { ownerInboxFetch } from "@/lib/owner-inbox-api";

type Draft = { to: string; name: string; subject: string; reference: string };

export default function OwnerEmailCustomerModal({
  ownerKey,
  paymentReference,
  onClose,
}: {
  ownerKey: string;
  paymentReference: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeDetails, setIncludeDetails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ownerInboxFetch<Draft>(ownerKey, `/owner/email-customer/draft?paymentReference=${encodeURIComponent(paymentReference)}`)
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setSubject(d.subject);
        const first = d.name?.trim().split(/\s+/)[0];
        setMessage(first ? `Hi ${first},\n\n` : "Hi,\n\n");
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the booking"));
    return () => {
      cancelled = true;
    };
  }, [ownerKey, paymentReference]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await ownerInboxFetch(ownerKey, "/owner/email-customer", {
        paymentReference,
        subject,
        message,
        includeBookingDetails: includeDetails,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Email customer">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-navy p-4 sm:rounded-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Email customer</h2>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-white/70" aria-label="Close">
            ✕
          </button>
        </div>
        {sent ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald">Sent to {draft?.to}. It&apos;s in your Inbox tab, and replies will appear there too.</p>
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy">
              Done
            </button>
          </div>
        ) : !draft ? (
          <p className="mt-4 text-sm text-white/60">{error || "Loading…"}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="break-all text-sm text-white/70">
              To: {draft.name ? `${draft.name} · ` : ""}
              {draft.to}
            </p>
            <label className="block text-sm text-white/80">
              Subject
              <input
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
            </label>
            <label className="block text-sm text-white/80">
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={includeDetails} onChange={(e) => setIncludeDetails(e.target.checked)} />
              Include booking details and the manage-booking link
            </label>
            <p className="text-xs text-white/50">Your signature with the logo and contact details is added automatically.</p>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button
              type="button"
              disabled={busy || !message.trim() || !subject.trim()}
              onClick={() => void send()}
              className="min-h-12 w-full rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
