"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createOwnerPersonalQuote,
  deactivateOwnerPersonalQuote,
  fetchOwnerPersonalQuotes,
  type PersonalQuoteOwnerView,
} from "@/lib/personal-quote-api";

type OwnerPersonalQuotesPanelProps = {
  ownerKey: string;
};

function defaultExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function OwnerPersonalQuotesPanel({ ownerKey }: OwnerPersonalQuotesPanelProps) {
  const [quotes, setQuotes] = useState<PersonalQuoteOwnerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastCreatedCode, setLastCreatedCode] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [agreedAmount, setAgreedAmount] = useState("");
  const [standardWebsiteAmount, setStandardWebsiteAmount] = useState("");
  const [expiresOn, setExpiresOn] = useState(defaultExpiry);
  const [singleUse, setSingleUse] = useState(true);
  const [notes, setNotes] = useState("");
  const [pickupLabel, setPickupLabel] = useState("");
  const [dropoffLabel, setDropoffLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchOwnerPersonalQuotes(ownerKey);
      setQuotes(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load personal quotes");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    setLastCreatedCode("");
    try {
      const quote = await createOwnerPersonalQuote(ownerKey, {
        customerName,
        customerEmail: customerEmail.trim() || undefined,
        agreedAmount: Number(agreedAmount),
        standardWebsiteAmount: standardWebsiteAmount.trim()
          ? Number(standardWebsiteAmount)
          : undefined,
        expiresOn,
        singleUse,
        notes: notes.trim() || undefined,
        pickupLabel: pickupLabel.trim() || undefined,
        dropoffLabel: dropoffLabel.trim() || undefined,
      });
      setLastCreatedCode(quote.code);
      setMessage(`Personal quote created: ${quote.code} · ${quote.amountLabel}`);
      setCustomerName("");
      setCustomerEmail("");
      setAgreedAmount("");
      setStandardWebsiteAmount("");
      setNotes("");
      setPickupLabel("");
      setDropoffLabel("");
      setExpiresOn(defaultExpiry());
      setSingleUse(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create personal quote");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(code: string) {
    setError("");
    setMessage("");
    try {
      await deactivateOwnerPersonalQuote(ownerKey, code);
      setMessage(`Deactivated ${code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate quote");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`Copied ${code}`);
    } catch {
      setMessage(`Code: ${code}`);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Personal quote codes</h2>
          <p className="mt-1 max-w-xl text-sm text-white/65">
            Honour an individually agreed fare without changing the website pricing engine. Customers
            enter the code on booking; SumUp always charges the server-authorised amount.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-white/80">
          Customer name
          <input
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
            placeholder="Existing minibus customer"
          />
        </label>
        <label className="block text-sm text-white/80">
          Customer email (optional)
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
            placeholder="optional"
          />
        </label>
        <label className="block text-sm text-white/80">
          Agreed fare (£)
          <input
            required
            inputMode="decimal"
            value={agreedAmount}
            onChange={(e) => setAgreedAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
            placeholder="75"
          />
        </label>
        <label className="block text-sm text-white/80">
          Standard website fare (£, optional)
          <input
            inputMode="decimal"
            value={standardWebsiteAmount}
            onChange={(e) => setStandardWebsiteAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
            placeholder="100"
          />
        </label>
        <label className="block text-sm text-white/80">
          Expiry date
          <input
            required
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={singleUse}
            onChange={(e) => setSingleUse(e.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-navy text-emerald"
          />
          Single use
        </label>
        <label className="block text-sm text-white/80 sm:col-span-2">
          Notes (optional, internal)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
            placeholder="Agreed over WhatsApp"
          />
        </label>
        <label className="block text-sm text-white/80">
          Pickup note (optional)
          <input
            value={pickupLabel}
            onChange={(e) => setPickupLabel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Destination note (optional)
          <input
            value={dropoffLabel}
            onChange={(e) => setDropoffLabel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-white"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
          >
            {saving ? "Creating…" : "Generate personal quote code"}
          </button>
        </div>
      </form>

      {lastCreatedCode ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm text-emerald">
          <span className="font-mono text-base font-semibold tracking-wide">{lastCreatedCode}</span>
          <button
            type="button"
            onClick={() => void copyCode(lastCreatedCode)}
            className="rounded-md border border-emerald/40 px-2 py-1 text-xs font-medium hover:bg-emerald/20"
          >
            Copy code
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-emerald">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-white/45">
          Open quotes {loading ? "(loading…)" : `(${quotes.length})`}
        </p>
        {quotes.length === 0 && !loading ? (
          <p className="text-sm text-white/55">No active personal quotes.</p>
        ) : (
          <ul className="space-y-2">
            {quotes.map((quote) => (
              <li
                key={quote.code}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white/85"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCode(quote.code)}
                    className="font-mono font-semibold tracking-wide text-emerald hover:underline"
                  >
                    {quote.code}
                  </button>
                  <span className="font-semibold">{quote.amountLabel}</span>
                </div>
                <p className="mt-1 text-xs text-white/60">
                  {quote.customerName}
                  {quote.standardWebsiteAmount != null
                    ? ` · website £${Number(quote.standardWebsiteAmount).toFixed(2)}`
                    : ""}
                  {` · expires ${quote.expiresOn}`}
                  {quote.singleUse ? " · single use" : " · multi use"}
                </p>
                {quote.notes ? (
                  <p className="mt-1 text-xs text-white/45">{quote.notes}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDeactivate(quote.code)}
                  className="mt-2 text-xs text-amber-200/90 underline-offset-2 hover:underline"
                >
                  Deactivate
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
