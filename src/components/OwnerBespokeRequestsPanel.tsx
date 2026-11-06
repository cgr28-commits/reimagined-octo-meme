"use client";

/**
 * Owner Dashboard → More → Event & Business Class.
 * Manually priced quotation requests. Uses the owner key from the existing
 * dashboard sign-in (header only). No second dashboard, no second login.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BESPOKE_PAYMENT_REVIEW_REASON_LABELS,
  BESPOKE_QUOTE_CATEGORY_LABELS,
  BESPOKE_QUOTE_MAX_VALIDITY_HOURS,
  BESPOKE_QUOTE_OWNER_STATUS_LABELS,
  BESPOKE_QUOTE_VALIDITY_PRESETS_HOURS,
  BUSINESS_CLASS_REQUEST_SERVICE_LABELS,
  type BespokeQuoteCategory,
  type BespokeQuoteOwnerSummary,
  type BespokeQuoteStatus,
} from "../../shared/bespoke-quote";
import { formatUkDate, formatUkInstant } from "../../shared/uk-time";
import {
  BespokeApiError,
  fetchOwnerBespokeRequest,
  fetchOwnerBespokeRequests,
  newIdempotencyKey,
  postOwnerBespokeAction,
  type BespokeNotification,
  type BespokeOwnerActionInput,
  type BespokeOwnerView,
} from "@/lib/bespoke-quote-api";

type Props = { ownerKey: string };

type CategoryFilter = "all" | BespokeQuoteCategory;
type StatusFilter = "outstanding" | "all" | "closed";

const OUTSTANDING: readonly BespokeQuoteStatus[] = [
  "NEW",
  "REVIEWING",
  "QUOTED",
  "PAYMENT_STARTED",
  "PAID",
  "PAYMENT_REVIEW",
  "REFUND_REQUIRED",
];

const fieldClass =
  "box-border mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white outline-none focus:border-emerald [color-scheme:dark]";
const primaryButton =
  "min-h-11 w-full min-w-0 max-w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-60 sm:w-auto";
const secondaryButton =
  "min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto";
const dangerButton =
  "min-h-11 w-full min-w-0 max-w-full rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 disabled:opacity-60 sm:w-auto";
const card = "w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4";
const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-white/50";

function gbp(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `£${n.toFixed(2)}` : "—";
}

function parseMoney(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

function statusTone(status: BespokeQuoteStatus, reviewOpen: boolean): string {
  if (reviewOpen || status === "PAYMENT_REVIEW" || status === "REFUND_REQUIRED") return "bg-amber-500/20 text-amber-100";
  if (status === "NEW") return "bg-sky-500/20 text-sky-100";
  if (status === "CONFIRMED" || status === "PAID") return "bg-emerald/20 text-emerald";
  if (["DECLINED", "CUSTOMER_DECLINED", "EXPIRED", "CANCELLED"].includes(status)) return "bg-white/10 text-white/60";
  return "bg-white/10 text-white";
}

function serviceLabel(item: { category: BespokeQuoteCategory; eventTitle?: string; serviceType?: string }): string {
  if (item.category === "event") return item.eventTitle ?? "Event Transfer";
  return item.serviceType
    ? BUSINESS_CLASS_REQUEST_SERVICE_LABELS[item.serviceType as keyof typeof BUSINESS_CLASS_REQUEST_SERVICE_LABELS]
    : "Business Class";
}

export default function OwnerBespokeRequestsPanel({ ownerKey }: Props) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("outstanding");
  const [items, setItems] = useState<BespokeQuoteOwnerSummary[]>([]);
  const [publicEnabled, setPublicEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOwnerBespokeRequests(ownerKey, category === "all" ? {} : { category });
      setItems(data.items);
      setPublicEnabled(data.publicEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const outstanding = OUTSTANDING.includes(item.status) || item.reviewOpen;
        if (statusFilter === "outstanding") return outstanding;
        if (statusFilter === "closed") return !outstanding;
        return true;
      }),
    [items, statusFilter],
  );

  if (selected) {
    return (
      <RequestDetail
        ownerKey={ownerKey}
        reference={selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4" id="owner-tool-panel-bespoke-requests">
      {publicEnabled === false ? (
        <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70">
          Public Event and Business Class request forms are switched <strong className="text-white">off</strong>. No
          customer emails are sent while they are off.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {(["all", "event", "business_class"] as CategoryFilter[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${
              category === id ? "bg-emerald text-navy" : "border border-white/15 text-white/75"
            }`}
          >
            {id === "all" ? "All" : BESPOKE_QUOTE_CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {(
          [
            ["outstanding", "New & outstanding"],
            ["closed", "Closed"],
            ["all", "All"],
          ] as Array<[StatusFilter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={statusFilter === id}
            onClick={() => setStatusFilter(id)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${
              statusFilter === id ? "bg-white/15 text-white" : "border border-white/15 text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="min-h-11 rounded-full border border-white/15 px-4 text-sm text-white/70">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {!loading && visible.length === 0 && !error ? (
        <p className="text-sm text-white/55">No requests in this view.</p>
      ) : null}

      <ul className="space-y-3">
        {visible.map((item) => (
          <li key={item.reference}>
            <button
              type="button"
              onClick={() => setSelected(item.reference)}
              className={`${card} block text-left hover:border-white/25`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(item.status, item.reviewOpen)}`}>
                  {BESPOKE_QUOTE_OWNER_STATUS_LABELS[item.status]}
                </span>
                {item.reviewOpen ? (
                  <span className="rounded-full bg-amber-500/25 px-2.5 py-1 text-xs font-semibold text-amber-100">
                    Payment review
                  </span>
                ) : null}
                <span className="text-xs text-white/50">{BESPOKE_QUOTE_CATEGORY_LABELS[item.category]}</span>
              </div>
              <p className="mt-2 break-words text-base font-bold text-white">{serviceLabel(item)}</p>
              <p className="mt-1 text-sm text-white/70">
                {item.customerLabel} · {formatUkDate(item.date)} {item.time} · {item.passengers} pax
              </p>
              <p className="mt-1 text-xs text-white/45">
                {item.reference}
                {item.quotedAmountGbp !== undefined ? ` · Quoted ${gbp(item.quotedAmountGbp)}` : ""}
                {item.quoteExpiresAt && item.status === "QUOTED" ? ` · Expires ${formatUkInstant(item.quoteExpiresAt, { withZoneLabel: false })}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function RequestDetail({ ownerKey, reference, onBack }: { ownerKey: string; reference: string; onBack: () => void }) {
  const [request, setRequest] = useState<BespokeOwnerView | null>(null);
  const [notifications, setNotifications] = useState<BespokeNotification[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [customerLink, setCustomerLink] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchOwnerBespokeRequest(ownerKey, reference);
      setRequest(data.request);
      setNotifications(data.notifications);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not load this request." });
    }
  }, [ownerKey, reference]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** One idempotency key per click; the button is disabled while it runs. */
  const run = useCallback(
    async (label: string, action: BespokeOwnerActionInput, confirmText?: string) => {
      if (!request || busy) return;
      if (confirmText && !window.confirm(confirmText)) return;
      setBusy(label);
      setMessage(null);
      try {
        const result = await postOwnerBespokeAction(ownerKey, {
          reference,
          expectedVersion: request.version,
          idempotencyKey: newIdempotencyKey(),
          action,
        });
        setRequest(result.request);
        setNotifications(result.notifications);
        if (result.customerLink) setCustomerLink(result.customerLink);
        const status = result.email?.status;
        const emailNote =
          status === "accepted" || status === "sent"
            ? " Email accepted by the provider (delivery not yet confirmed)."
            : status === "skipped"
              ? " Email not sent (public service is off, or recipient not allowed)."
              : status === "already_claimed"
                ? " Already handled — no duplicate email sent."
                : result.email
                  ? " Email NOT confirmed — see Notifications."
                  : "";
        const emailProblem = Boolean(result.email) && !["accepted", "sent", "skipped", "already_claimed"].includes(status ?? "");
        setMessage({ tone: emailProblem ? "error" : "ok", text: `${label}: ${result.replayed ? "already done" : "saved"}.${emailNote}` });
      } catch (e) {
        if (e instanceof BespokeApiError && e.code === "version_conflict") {
          setMessage({ tone: "error", text: "This request was changed elsewhere. It has been refreshed — please check and try again." });
          await reload();
        } else {
          setMessage({ tone: "error", text: e instanceof Error ? e.message : "Action failed." });
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, ownerKey, reference, reload, request],
  );

  if (!request) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={secondaryButton}>
          ← All requests
        </button>
        <p className="text-sm text-white/60">{message?.text ?? "Loading…"}</p>
      </div>
    );
  }

  const r = request;
  const j = r.journey;
  const attemptExpired =
    r.status === "PAYMENT_STARTED" && r.paymentAttempt && Date.parse(r.paymentAttempt.expiresAt) <= Date.now();
  const canQuote = ["NEW", "REVIEWING", "QUOTED", "EXPIRED", "CUSTOMER_DECLINED"].includes(r.status);
  const canClose = ["NEW", "REVIEWING", "QUOTED", "EXPIRED", "CUSTOMER_DECLINED"].includes(r.status);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <button type="button" onClick={onBack} className={secondaryButton}>
        ← All requests
      </button>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(r.status, Boolean(r.review?.open))}`}>
            {r.statusLabel}
          </span>
          <span className="text-xs text-white/50">{BESPOKE_QUOTE_CATEGORY_LABELS[r.category]}</span>
          <span className="text-xs text-white/40">v{r.version}</span>
        </div>
        <h2 className="mt-2 break-words text-xl font-bold text-white">
          {r.event ? r.event.title : r.serviceType ? BUSINESS_CLASS_REQUEST_SERVICE_LABELS[r.serviceType] : "Request"}
        </h2>
        <p className="mt-1 text-sm text-white/55">{r.reference} · received {formatUkInstant(r.createdAt, { withZoneLabel: false })}</p>
        {r.bookingReference ? (
          <p className="mt-2 text-sm font-semibold text-emerald">
            Booking {r.bookingReference} — in Jobs and the Calendar
          </p>
        ) : null}
        {r.status === "PAID" ? (
          <p className="mt-2 text-sm text-amber-100">
            Paid. The booking is still being created — it retries automatically. Check Jobs before arranging anything manually.
          </p>
        ) : null}
      </div>

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-xl px-3 py-2 text-sm ${
            message.tone === "error" ? "border border-red-300/30 bg-red-500/10 text-red-100" : "border border-emerald/30 bg-emerald/10 text-emerald"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {customerLink ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-50">
          <p className="font-semibold">Customer quotation link (shown once)</p>
          <p className="mt-1 break-all text-xs">{customerLink}</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Private to this customer. Only share it with them directly. Sending a new link replaces this one.
          </p>
          <button type="button" className={`${secondaryButton} mt-2`} onClick={() => void navigator.clipboard?.writeText(customerLink)}>
            Copy link
          </button>
        </div>
      ) : null}

      {r.review?.open ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-50">
          <p className="font-semibold">Payment needs review</p>
          <ul className="mt-1 list-disc pl-5">
            {r.review.reasons.map((reason) => (
              <li key={reason}>{BESPOKE_PAYMENT_REVIEW_REASON_LABELS[reason]}</li>
            ))}
          </ul>
          <ReviewResolver busy={busy} onResolve={(resolution, note) => void run("Review", { type: "owner_resolve_review", resolution, note })} />
        </div>
      ) : null}

      {attemptExpired ? (
        <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
          The customer started checkout but it has not completed. The quotation will not expire until the payment has
          been checked with the card provider.
        </p>
      ) : null}

      <section className={card}>
        <p className={sectionTitle}>Customer</p>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-sm text-white/85">
          <div>{r.customer.name}</div>
          <div>
            <a className="break-all text-emerald underline" href={`mailto:${r.customer.email}`}>
              {r.customer.email}
            </a>
          </div>
          <div>
            <a className="text-emerald underline" href={`tel:${r.customer.phone.replace(/\s+/g, "")}`}>
              {r.customer.phone}
            </a>
          </div>
        </dl>
      </section>

      <section className={card}>
        <p className={sectionTitle}>Journey</p>
        <dl className="mt-2 space-y-1 text-sm text-white/85">
          {r.event ? (
            <Row label="Event" value={`${r.event.title} — ${r.event.venue} (${formatUkDate(r.event.date)})`} />
          ) : null}
          <Row label="Pickup" value={j.pickupAddress} />
          <Row label="Destination" value={j.destinationAddress} />
          <Row label="Date and time" value={`${formatUkDate(j.date)} at ${j.time}`} />
          {j.returnJourney ? <Row label="Return" value={`${formatUkDate(j.returnDate ?? "")} at ${j.returnTime ?? ""}`} /> : <Row label="Return" value="One way" />}
          {j.additionalStops.length ? <Row label="Stops" value={j.additionalStops.join("; ")} /> : null}
          <Row label="Passengers" value={String(j.passengers)} />
          {j.groupVehicleRequested ? <Row label="Group vehicle" value="Requested (not promised)" /> : null}
          {j.luggage ? <Row label="Luggage" value={j.luggage} /> : null}
          {j.flightNumber ? <Row label="Flight" value={j.flightNumber} /> : null}
          {j.specialRequirements ? <Row label="Requirements" value={j.specialRequirements} /> : null}
        </dl>
      </section>

      {r.status === "NEW" ? (
        <button type="button" className={primaryButton} disabled={Boolean(busy)} onClick={() => void run("Start review", { type: "owner_start_review" })}>
          Start checking availability
        </button>
      ) : null}

      <AvailabilityForm request={r} busy={busy} onSave={(action) => void run("Availability", action)} />
      <CostsAndQuoteForm
        request={r}
        busy={busy}
        canQuote={canQuote}
        onSaveCosts={(action) => void run("Costs", action)}
        onIssue={(action) =>
          void run(
            "Quotation",
            action,
            `Send a quotation of £${action.amountGbp.toFixed(2)} to ${r.customer.email}? Any earlier quotation link stops working.`,
          )
        }
      />

      <NotificationsList
        notifications={notifications}
        canResendQuote={r.status === "QUOTED"}
        canResendExpiry={r.status === "EXPIRED"}
        busy={busy}
        onResendQuote={() =>
          void run("Resend", { type: "resend_quote_email" }, "Send the quotation again with a NEW link? The previous link will stop working.")
        }
        onResendOther={(kind, warning) => void run("Resend", { type: "resend_notification", kind }, warning)}
      />

      <PaymentsList
        request={r}
        busy={busy}
        onRecordRefund={(paymentReference, note) => void run("Manual refund", { type: "owner_record_manual_refund", paymentReference, note })}
      />

      {canClose || r.status === "PAYMENT_STARTED" ? (
        <CloseActions
          busy={busy}
          allowDecline={canClose}
          onDecline={(note) => void run("Decline", { type: "owner_decline", note }, "Decline this request? The customer will not be able to pay.")}
          onCancel={(note) =>
            void run(
              "Cancel",
              { type: "owner_cancel", note },
              r.status === "PAYMENT_STARTED"
                ? "The customer is at checkout. If their payment still completes it will be recorded and flagged for review. Cancel anyway?"
                : "Cancel this request?",
            )
          }
        />
      ) : null}

      <section className={card}>
        <p className={sectionTitle}>History</p>
        <ol className="mt-2 space-y-1 text-xs text-white/65">
          {[...r.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`}>
              {formatUkInstant(h.at, { withZoneLabel: false })} · {h.actor} · {h.action.replace(/_/g, " ")}
              {h.fromStatus !== h.toStatus ? ` · ${BESPOKE_QUOTE_OWNER_STATUS_LABELS[h.fromStatus]} → ${BESPOKE_QUOTE_OWNER_STATUS_LABELS[h.toStatus]}` : ""}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-white/50">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function AvailabilityForm({
  request,
  busy,
  onSave,
}: {
  request: BespokeOwnerView;
  busy: string | null;
  onSave: (action: Extract<BespokeOwnerActionInput, { type: "owner_update_availability" }>) => void;
}) {
  const [availability, setAvailability] = useState(request.owner.availability);
  const [driverName, setDriverName] = useState(request.owner.driverName ?? "");
  const [vehicleNote, setVehicleNote] = useState(request.owner.vehicleNote ?? "");
  const [note, setNote] = useState(request.owner.availabilityNote ?? "");
  useEffect(() => {
    setAvailability(request.owner.availability);
    setDriverName(request.owner.driverName ?? "");
    setVehicleNote(request.owner.vehicleNote ?? "");
    setNote(request.owner.availabilityNote ?? "");
  }, [request.version, request.owner]);
  return (
    <section className={card}>
      <p className={sectionTitle}>Driver and vehicle availability (private)</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-white/80">
          Availability
          <select className={fieldClass} value={availability} onChange={(e) => setAvailability(e.target.value as typeof availability)}>
            <option value="unknown">Not checked</option>
            <option value="checking">Checking</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
        <label className="block text-sm text-white/80">
          Driver
          <input className={fieldClass} value={driverName} maxLength={80} onChange={(e) => setDriverName(e.target.value)} />
        </label>
        <label className="block text-sm text-white/80 sm:col-span-2">
          Vehicle
          <input className={fieldClass} value={vehicleNote} maxLength={200} onChange={(e) => setVehicleNote(e.target.value)} />
        </label>
        <label className="block text-sm text-white/80 sm:col-span-2">
          Note
          <textarea className={fieldClass} rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className={`${secondaryButton} mt-3`}
        disabled={Boolean(busy)}
        onClick={() => onSave({ type: "owner_update_availability", availability, driverName, vehicleNote, availabilityNote: note })}
      >
        {busy === "Availability" ? "Saving…" : "Save availability"}
      </button>
    </section>
  );
}

function CostsAndQuoteForm({
  request,
  busy,
  canQuote,
  onSaveCosts,
  onIssue,
}: {
  request: BespokeOwnerView;
  busy: string | null;
  canQuote: boolean;
  onSaveCosts: (action: Extract<BespokeOwnerActionInput, { type: "owner_set_costs" }>) => void;
  onIssue: (action: Extract<BespokeOwnerActionInput, { type: "owner_issue_quote" }>) => void;
}) {
  const [driverCost, setDriverCost] = useState(request.owner.estimatedDriverCostGbp?.toString() ?? "");
  const [otherCosts, setOtherCosts] = useState(request.owner.estimatedOtherCostsGbp?.toString() ?? "");
  const [notes, setNotes] = useState(request.owner.internalNotes ?? "");
  const [amount, setAmount] = useState(request.quote?.amountGbp.toString() ?? "");
  const [validity, setValidity] = useState("48");
  const [customerMessage, setCustomerMessage] = useState("");
  useEffect(() => {
    setDriverCost(request.owner.estimatedDriverCostGbp?.toString() ?? "");
    setOtherCosts(request.owner.estimatedOtherCostsGbp?.toString() ?? "");
    setNotes(request.owner.internalNotes ?? "");
  }, [request.version, request.owner]);

  const driverN = parseMoney(driverCost);
  const otherN = parseMoney(otherCosts);
  const amountN = parseMoney(amount);
  const validityN = Number(validity);
  const costsValid = !Number.isNaN(driverN) && !Number.isNaN(otherN);
  const previewProfit =
    amountN !== null && !Number.isNaN(amountN) && costsValid && (driverN !== null || otherN !== null)
      ? Math.round((amountN - (driverN ?? 0) - (otherN ?? 0)) * 100) / 100
      : null;
  const quoteValid =
    amountN !== null && !Number.isNaN(amountN) && amountN >= 1 && Number.isInteger(validityN) && validityN >= 1 && validityN <= BESPOKE_QUOTE_MAX_VALIDITY_HOURS;
  const unavailable = request.owner.availability === "unavailable";

  return (
    <section className={card}>
      <p className={sectionTitle}>Costs and quotation</p>
      {request.quote ? (
        <p className="mt-2 text-sm text-white/80">
          Current quotation v{request.quote.version}: <strong className="text-white">{gbp(request.quote.amountGbp)}</strong> · valid until{" "}
          {formatUkInstant(request.quote.expiresAt, { withZoneLabel: false })}
          {request.estimatedProfitGbp !== null ? ` · est. profit ${gbp(request.estimatedProfitGbp)}` : ""}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-white/80">
          Estimated driver cost (£, private)
          <input className={fieldClass} inputMode="decimal" value={driverCost} onChange={(e) => setDriverCost(e.target.value)} />
        </label>
        <label className="block text-sm text-white/80">
          Other costs (£, private)
          <input className={fieldClass} inputMode="decimal" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} />
        </label>
        <label className="block text-sm text-white/80 sm:col-span-2">
          Internal notes (private)
          <textarea className={fieldClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className={`${secondaryButton} mt-3`}
        disabled={Boolean(busy) || !costsValid}
        onClick={() => onSaveCosts({ type: "owner_set_costs", estimatedDriverCostGbp: driverN, estimatedOtherCostsGbp: otherN, internalNotes: notes })}
      >
        {busy === "Costs" ? "Saving…" : "Save costs"}
      </button>

      {canQuote ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-white/80">
              Quotation price (£)
              <input className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-sm text-white/80">
              Valid for (hours)
              <input className={fieldClass} inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {BESPOKE_QUOTE_VALIDITY_PRESETS_HOURS.map((h) => (
              <button key={h} type="button" onClick={() => setValidity(String(h))} className="min-h-11 rounded-full border border-white/15 px-3 text-sm text-white/75">
                {h === 168 ? "7 days" : `${h} hours`}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm text-white/80">
            Message to customer (optional, they will see this)
            <textarea className={fieldClass} rows={3} maxLength={1000} value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} />
          </label>
          <p className="mt-2 text-sm text-white/70">
            Estimated profit at this price: <strong className="text-white">{gbp(previewProfit)}</strong>
          </p>
          <p className="mt-1 text-xs text-white/50">The quotation never stays valid beyond the pickup time.</p>
          {unavailable ? <p className="mt-2 text-sm text-amber-100">Availability is marked unavailable — update it before quoting.</p> : null}
          <button
            type="button"
            className={`${primaryButton} mt-3`}
            disabled={Boolean(busy) || !quoteValid || unavailable}
            onClick={() => onIssue({ type: "owner_issue_quote", amountGbp: amountN as number, validityHours: validityN, customerMessage })}
          >
            {busy === "Quotation" ? "Sending…" : request.quote ? "Send updated quotation" : "Send quotation"}
          </button>
        </div>
      ) : null}

      {request.quoteHistory.length > 1 ? (
        <ul className="mt-3 text-xs text-white/50">
          {request.quoteHistory.map((q) => (
            <li key={q.version}>
              v{q.version}: {gbp(q.amountGbp)} issued {formatUkInstant(q.issuedAt, { withZoneLabel: false })}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const NOTIFICATION_LABELS: Record<string, string> = {
  request_acknowledgement: "Customer acknowledgement",
  owner_new_request: "Owner alert",
  quotation: "Quotation email",
  quotation_expired: "Expiry email",
};

/**
 * Honest delivery wording: "accepted" means the provider took the message, not
 * that it reached the inbox. Only signed provider events can say "delivered".
 */
export function notificationStatusText(n: BespokeNotification): { text: string; tone: "ok" | "warn" | "muted" } {
  if (n.status === "sending") return { text: "Outcome unknown — not retried automatically", tone: "warn" };
  if (n.status === "failed") return { text: `Failed${n.error ? ` (${n.error})` : ""}`, tone: "warn" };
  if (n.status === "skipped") return { text: `Not sent${n.error ? ` (${n.error.replace(/_/g, " ")})` : ""}`, tone: "muted" };
  // accepted (or legacy "sent")
  switch (n.delivery) {
    case "delivered":
      return { text: "Delivered (confirmed by provider)", tone: "ok" };
    case "bounced":
      return { text: "Bounced — not delivered", tone: "warn" };
    case "complained":
      return { text: "Delivered, then marked as spam by recipient", tone: "warn" };
    case "failed":
      return { text: "Provider reported delivery failure", tone: "warn" };
    case "delayed":
      return { text: "Accepted by provider — delivery delayed", tone: "warn" };
    default:
      return {
        text: n.providerMessageId
          ? "Accepted by provider — delivery not yet confirmed"
          : "Accepted by provider — delivery tracking unavailable",
        tone: "muted",
      };
  }
}

function NotificationsList({
  notifications,
  canResendQuote,
  canResendExpiry,
  busy,
  onResendQuote,
  onResendOther,
}: {
  notifications: BespokeNotification[];
  canResendQuote: boolean;
  canResendExpiry: boolean;
  busy: string | null;
  onResendQuote: () => void;
  onResendOther: (kind: "acknowledgement" | "expiry", warning: string) => void;
}) {
  const latest = (kind: string) => [...notifications].reverse().find((n) => n.kind === kind);
  const duplicateWarning = (kind: string, label: string) => {
    const last = latest(kind);
    const mightHaveArrived =
      last && (last.status === "accepted" || last.status === "sent" || last.status === "sending") && last.delivery !== "bounced";
    return mightHaveArrived
      ? `The previous ${label} may already have reached the customer (${notificationStatusText(last).text}). Send another copy anyway?`
      : `Send the ${label} again?`;
  };
  return (
    <section className={card}>
      <p className={sectionTitle}>Notifications</p>
      <p className="mt-1 text-xs text-white/45">
        &ldquo;Accepted&rdquo; means the email provider took the message. Only &ldquo;Delivered&rdquo; confirms it reached the inbox.
      </p>
      {notifications.length === 0 ? <p className="mt-2 text-sm text-white/55">None yet.</p> : null}
      <ul className="mt-2 space-y-1 text-sm">
        {notifications.map((n) => {
          const st = notificationStatusText(n);
          return (
            <li key={n.key} className="break-words text-white/80">
              {NOTIFICATION_LABELS[n.kind] ?? n.kind} —{" "}
              <span className={st.tone === "ok" ? "text-emerald" : st.tone === "warn" ? "text-amber-100" : "text-white/55"}>{st.text}</span>
              <span className="text-white/40"> · {formatUkInstant(n.deliveryAt ?? n.finishedAt ?? n.claimedAt, { withZoneLabel: false })}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canResendQuote ? (
          <button type="button" className={secondaryButton} disabled={Boolean(busy)} onClick={onResendQuote}>
            {busy === "Resend" ? "Sending…" : "Resend quotation (new link)"}
          </button>
        ) : null}
        <button
          type="button"
          className={secondaryButton}
          disabled={Boolean(busy)}
          onClick={() => onResendOther("acknowledgement", duplicateWarning("request_acknowledgement", "acknowledgement email"))}
        >
          Resend acknowledgement
        </button>
        {canResendExpiry ? (
          <button
            type="button"
            className={secondaryButton}
            disabled={Boolean(busy)}
            onClick={() => onResendOther("expiry", duplicateWarning("quotation_expired", "expiry email"))}
          >
            Resend expiry email
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PaymentsList({
  request,
  busy,
  onRecordRefund,
}: {
  request: BespokeOwnerView;
  busy: string | null;
  onRecordRefund: (paymentReference: string, note: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (request.payments.length === 0) return null;
  return (
    <section className={card}>
      <p className={sectionTitle}>Payments</p>
      <p className="mt-1 text-xs text-white/50">
        Refunds are never issued automatically. Refund in the card provider first, then record it here.
      </p>
      <ul className="mt-2 space-y-3 text-sm text-white/85">
        {request.payments.map((p) => (
          <li key={p.paymentReference} className="rounded-xl border border-white/10 p-3">
            <p>
              {gbp(p.amountGbp)} · {p.paymentReference} · {formatUkInstant(p.recordedAt, { withZoneLabel: false })} ·{" "}
              {p.refundedManuallyAt ? "refunded (recorded)" : p.outcome === "accepted" ? "accepted" : "under review"}
            </p>
            {p.reviewReasons?.length ? (
              <p className="text-xs text-amber-100">{p.reviewReasons.map((x) => BESPOKE_PAYMENT_REVIEW_REASON_LABELS[x]).join(" · ")}</p>
            ) : null}
            {!p.refundedManuallyAt && (request.status === "REFUND_REQUIRED" || p.outcome === "review") ? (
              <div className="mt-2">
                <label className="block text-xs text-white/70">
                  Refund reference / note
                  <input
                    className={fieldClass}
                    value={notes[p.paymentReference] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [p.paymentReference]: e.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className={`${secondaryButton} mt-2`}
                  disabled={Boolean(busy) || !(notes[p.paymentReference] ?? "").trim()}
                  onClick={() => onRecordRefund(p.paymentReference, notes[p.paymentReference] ?? "")}
                >
                  Record manual refund
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewResolver({
  busy,
  onResolve,
}: {
  busy: string | null;
  onResolve: (resolution: "accept_payment" | "manual_refund_required", note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-3">
      <label className="block text-xs text-amber-100">
        Decision note (required)
        <textarea className={fieldClass} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={primaryButton}
          disabled={Boolean(busy) || !note.trim()}
          onClick={() => window.confirm("Accept this payment and keep the job?") && onResolve("accept_payment", note)}
        >
          Accept payment
        </button>
        <button
          type="button"
          className={dangerButton}
          disabled={Boolean(busy) || !note.trim()}
          onClick={() => window.confirm("Mark as needing a manual refund? No refund is issued automatically.") && onResolve("manual_refund_required", note)}
        >
          Manual refund required
        </button>
      </div>
    </div>
  );
}

function CloseActions({
  busy,
  allowDecline,
  onDecline,
  onCancel,
}: {
  busy: string | null;
  allowDecline: boolean;
  onDecline: (note: string) => void;
  onCancel: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <section className={card}>
      <p className={sectionTitle}>Decline or cancel</p>
      <label className="mt-2 block text-sm text-white/80">
        Internal note (optional)
        <input className={fieldClass} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {allowDecline ? (
          <button type="button" className={dangerButton} disabled={Boolean(busy)} onClick={() => onDecline(note)}>
            Decline request
          </button>
        ) : null}
        <button type="button" className={dangerButton} disabled={Boolean(busy)} onClick={() => onCancel(note)}>
          Cancel request
        </button>
      </div>
    </section>
  );
}
