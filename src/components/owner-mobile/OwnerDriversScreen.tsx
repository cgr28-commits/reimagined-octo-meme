"use client";

/**
 * Stage 1 — Drivers (Owner Dashboard, More → Drivers).
 * Invite, review documents, approve / decline / suspend / reinstate / remove, single-use
 * sign-in links, office messages, audit trail and the private driver-support number.
 * No jobs, money or notifications: links are copied and shared by the owner personally.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./OwnerMobile.module.css";
import { BackIcon, ChevronIcon } from "./OwnerMobileIcons";
import {
  DriverAccountsError,
  STATUS_LABEL,
  documentStateLabel,
  documentStateTone,
  driverPortalLink,
  checkSupportPhone,
  ownerDrivers,
  ukDate,
  REVIEW_STATUS_LABEL,
  type OwnerAlert,
  type ReviewItem,
  type ReviewItemStatus,
  type OwnerDriver,
  type OwnerDriverDetail,
  type UrgentReport,
} from "@/lib/driver-accounts-api";

type Props = { ownerKey: string; onBack: () => void; onToast: (text: string) => void };
type OpenBooking = (reference: string, leg: "outbound" | "return", driverId: string) => void;

const ACTION_LABEL: Record<string, string> = {
  approve: "Approve driver",
  reinstate: "Reinstate driver",
  decline: "Decline application",
  suspend: "Suspend driver",
  remove: "Remove driver",
};

const ACTIONS_FOR: Record<string, string[]> = {
  invited: ["decline", "remove"],
  applied: ["approve", "decline", "remove"],
  approved: ["suspend", "remove"],
  suspended: ["reinstate", "remove"],
  declined: ["remove"],
};

const AUDIT_LABEL: Record<string, string> = {
  "driver.invited": "Invited",
  "driver.applied": "Applied",
  "driver.approved": "Approved",
  "driver.declined": "Declined",
  "driver.suspended": "Suspended",
  "driver.removed": "Removed",
  "driver.available": "Set available",
  "driver.unavailable": "Set unavailable",
  "driver.signed_in": "Signed in",
  "driver.signed_out": "Signed out",
  "driver.sign_in_link_created": "Sign-in link created",
  "driver.office_message": "Messaged the office",
  "driver.urgent_report": "Sent an urgent report",
  "message.handled": "Urgent report marked handled",
  "alert.raised": "Bookings flagged for your review",
  "alert.reviewed": "Bookings review marked done",
  "alert.acknowledged": "Booking check acknowledged",
  "alert.all_bookings_resolved": "Every affected booking resolved",
  "booking_review.updated": "Booking review updated",
  "document.submitted": "Document added",
  "document.accepted": "Document accepted",
  "document.rejected": "Document rejected",
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function OwnerDriversScreen({
  ownerKey,
  onBack,
  onToast,
  initialDriverId,
  onOpenBooking,
}: Props & { initialDriverId?: string; onOpenBooking?: OpenBooking }) {
  const [drivers, setDrivers] = useState<OwnerDriver[] | null>(null);
  const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
  const [urgent, setUrgent] = useState<UrgentReport[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(initialDriverId ?? null);
  const [inviting, setInviting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, summary] = await Promise.all([ownerDrivers.list(ownerKey), ownerDrivers.summary(ownerKey)]);
      setDrivers(res.drivers);
      setAlerts(summary.alerts);
      setUrgent(summary.urgent);
      setError("");
    } catch (e) {
      if (e instanceof DriverAccountsError && e.status === 404) setUnavailable(true);
      else setError(e instanceof Error ? e.message : "Could not load drivers.");
      setDrivers([]);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected) {
    return (
      <DriverDetail
        ownerKey={ownerKey}
        driverId={selected}
        onOpenBooking={onOpenBooking}
        onBack={() => {
          setSelected(null);
          void load();
        }}
        onToast={onToast}
      />
    );
  }
  if (inviting) {
    return (
      <InviteDriver
        ownerKey={ownerKey}
        onBack={() => {
          setInviting(false);
          void load();
        }}
        onToast={onToast}
      />
    );
  }
  if (settingsOpen) {
    return <SupportContactSettings ownerKey={ownerKey} onBack={() => setSettingsOpen(false)} onToast={onToast} />;
  }

  const attentionCount = (drivers ?? []).filter((d) => (d.attention?.length ?? 0) > 0 || (d.unreadMessages ?? 0) > 0).length;

  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.backRow}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <BackIcon size={24} />
            More
          </button>
        </div>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>Drivers</h1>
        </div>
        <p className={styles.pageSub}>
          {drivers === null ? "Loading…" : unavailable ? "Not switched on yet" : `${drivers.length} driver${drivers.length === 1 ? "" : "s"}${attentionCount ? ` · ${attentionCount} need attention` : ""}`}
        </p>
      </header>
      <main className={styles.main} style={{ gap: 14 }}>
        {unavailable ? (
          <div className={`${styles.notice} ${styles.grey}`}>
            Driver accounts are being built and tested on staging only. They are not switched on for the live dashboard yet.
          </div>
        ) : (
          <>
            {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                ownerKey={ownerKey}
                onOpenDriver={a.driverId ? () => setSelected(a.driverId) : undefined}
                onOpenBooking={onOpenBooking}
                onDone={load}
                onToast={onToast}
              />
            ))}
            {urgent.length ? (
              <section className={styles.card} style={{ overflow: "hidden", border: "2px solid #D92D20" }} data-urgent-reports>
                <h2 className={styles.sectionTitle} style={{ padding: "14px 16px 4px", color: "#B42318" }}>
                  Urgent driver reports · {urgent.length}
                </h2>
                {urgent.map((u) => (
                  <button key={u.id} type="button" className={styles.row} onClick={() => setSelected(u.driverId)}>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle} style={{ fontWeight: 800 }}>
                        {u.categoryLabel} · {u.driverName}
                      </span>
                      <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                        {when(u.createdAt)} — {u.body}
                      </span>
                    </span>
                    <ChevronIcon size={18} />
                  </button>
                ))}
              </section>
            ) : null}
            <button type="button" className={styles.emeraldButton} onClick={() => setInviting(true)}>
              Invite a driver
            </button>
            <section className={styles.card} style={{ overflow: "hidden" }}>
              {drivers && drivers.length === 0 && !error ? <p className={styles.empty}>No drivers yet. Invite your first driver above.</p> : null}
              {(drivers ?? []).map((d) => (
                <button key={d.id} type="button" className={styles.row} onClick={() => setSelected(d.id)} data-driver-row={d.id}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                      {d.name}
                    </span>
                    <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                      {d.attention && d.attention.length ? ukDate(d.attention.slice(0, 2).join(" · ")) : d.operatorName || d.email}
                    </span>
                  </span>
                  {d.urgentMessages ? (
                    <span className={`${styles.chip} ${styles.red}`}>Urgent</span>
                  ) : d.unreadMessages ? (
                    <span className={`${styles.chip} ${styles.blue}`}>{d.unreadMessages} new</span>
                  ) : null}
                  <span className={`${styles.chip} ${statusTone(d)}`}>{d.status === "approved" ? (d.available ? "Available" : "Unavailable") : STATUS_LABEL[d.status]}</span>
                  <ChevronIcon size={18} />
                </button>
              ))}
            </section>
            <section className={styles.card} style={{ overflow: "hidden" }}>
              <button type="button" className={styles.row} onClick={() => setSettingsOpen(true)}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                    Driver support number
                  </span>
                  <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                    Shown only to approved, signed-in drivers under Contact office
                  </span>
                </span>
                <ChevronIcon size={18} />
              </button>
            </section>
            <p style={{ margin: "0 4px", fontSize: 13, color: "#5B6B80" }}>
              Stage 1: accounts and approvals only. No jobs, payments or notifications are sent.
            </p>
          </>
        )}
      </main>
    </>
  );
}


const ITEM_TONE: Record<ReviewItemStatus, string> = {
  needs_replacement: "red",
  replacement_confirmed: "green",
  cancelled: "grey",
  acknowledged: "amber",
};

function AlertCard({
  alert,
  ownerKey,
  onOpenDriver,
  onOpenBooking,
  onDone,
  onToast,
}: {
  alert: OwnerAlert;
  ownerKey: string;
  onOpenDriver?: () => void;
  onOpenBooking?: OpenBooking;
  onDone: () => void;
  onToast: (t: string) => void;
}) {
  const items = alert.items ?? [];
  const resolved = items.length - alert.unresolved;
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12, border: "2px solid #D92D20" }} data-owner-alert={alert.id}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`${styles.chip} ${styles.red}`}>Review needed</span>
        {items.length ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: "#33445C" }}>
            {resolved} of {items.length} resolved
          </span>
        ) : null}
      </div>
      <h2 className={styles.sectionTitle}>{alert.title}</h2>
      {alert.detail.reason ? (
        <p style={{ margin: 0, fontSize: 14, color: "#33445C" }}>
          Reason: <b>{alert.detail.reason}</b>
        </p>
      ) : null}
      {items.map((item) => (
        <ReviewItemCard key={item.id} item={item} ownerKey={ownerKey} onOpenBooking={onOpenBooking} onDone={onDone} onToast={onToast} />
      ))}
      {!items.length ? (
        <AcknowledgeWholeAlert alert={alert} ownerKey={ownerKey} onDone={onDone} onToast={onToast} />
      ) : null}
      <p style={{ margin: 0, fontSize: 13, color: "#33445C", lineHeight: 1.45 }}>
        Nothing has been cancelled, reassigned or refunded. This alert stays until every booking is resolved or acknowledged with a reason.
      </p>
      {onOpenDriver ? (
        <button type="button" className={styles.secondaryButton} onClick={onOpenDriver}>
          Open driver
        </button>
      ) : null}
    </section>
  );
}

function ReviewItemCard({
  item,
  ownerKey,
  onOpenBooking,
  onDone,
  onToast,
}: {
  item: ReviewItem;
  ownerKey: string;
  onOpenBooking?: OpenBooking;
  onDone: () => void;
  onToast: (t: string) => void;
}) {
  const [mode, setMode] = useState<"" | "acknowledged" | "needs_replacement">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = item.status === "needs_replacement";
  const day = new Date(`${item.tripDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  async function setStatus(status: ReviewItemStatus, reason = "") {
    setBusy(true);
    setError("");
    try {
      const res = await ownerDrivers.updateReviewItem(ownerKey, item.id, status, reason);
      onToast(res.alertResolved ? "All bookings resolved — alert closed" : `${item.reference}: ${REVIEW_STATUS_LABEL[status]}`);
      setMode("");
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-review-item={item.reference}
      data-review-status={item.status}
      style={{ border: `1px solid ${open ? "#F3C5C1" : "#dce3ec"}`, background: open ? "#FFF8F7" : "#F8FAFC", borderRadius: 14, padding: 12, display: "grid", gap: 8 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#071C38" }}>
            {day} {item.tripTime} · {item.reference}
          </span>
          <span style={{ fontSize: 14, color: "#33445C" }}>
            {[item.customerName, item.leg === "return" ? "Return journey" : item.pickup].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span className={`${styles.chip} ${styles[ITEM_TONE[item.status]]}`}>{REVIEW_STATUS_LABEL[item.status]}</span>
      </div>
      <span style={{ fontSize: 13, color: "#5B6B80" }}>
        Was assigned to {item.originalDriverName} ·{" "}
        {item.matchMethod === "driver_id" ? "linked by driver ID" : <b style={{ color: "#B54708" }}>matched by email/phone only — please check</b>}
      </span>
      {item.status !== "needs_replacement" ? (
        <span style={{ fontSize: 13, color: "#33445C" }}>
          {item.status === "replacement_confirmed" && item.statusDetail.otherDriver ? `Now with ${item.statusDetail.otherDriver}. ` : ""}
          {item.statusNote ? `“${item.statusNote}” ` : ""}
          {item.statusAt ? `· ${when(item.statusAt)}` : ""}
        </span>
      ) : null}
      {onOpenBooking ? (
        <button type="button" className={styles.primaryButton} style={{ minHeight: 44, fontSize: 15 }} onClick={() => onOpenBooking(item.reference, item.leg, item.originalDriverId)}>
          Open booking
        </button>
      ) : null}
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {mode ? (
        <>
          <Field label={mode === "acknowledged" ? "Why is no replacement needed? (kept in the audit log)" : "Why reopen it? (kept in the audit log)"}>
            <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" className={styles.secondaryButton} onClick={() => setMode("")}>
              Cancel
            </button>
            <button type="button" className={styles.secondaryButton} style={{ fontWeight: 800 }} disabled={busy || note.trim().length < 5} onClick={() => setStatus(mode, note)}>
              {mode === "acknowledged" ? "Save acknowledgement" : "Reopen"}
            </button>
          </div>
        </>
      ) : open ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setStatus("replacement_confirmed")}>
            Replacement confirmed
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setStatus("cancelled")}>
            Cancelled
          </button>
          <button type="button" className={styles.secondaryButton} style={{ gridColumn: "1 / -1" }} disabled={busy} onClick={() => setMode("acknowledged")}>
            Acknowledge with a reason
          </button>
        </div>
      ) : (
        <button type="button" className={styles.linkButton} style={{ justifySelf: "start", minHeight: 44 }} onClick={() => setMode("needs_replacement")}>
          Reopen
        </button>
      )}
    </div>
  );
}

function AcknowledgeWholeAlert({ alert, ownerKey, onDone, onToast }: { alert: OwnerAlert; ownerKey: string; onDone: () => void; onToast: (t: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 14, color: "#33445C" }}>
        The bookings couldn&apos;t be checked automatically. Look through the calendar for this driver&apos;s jobs, then record what you found.
      </p>
      <Field label="What you checked (kept in the audit log)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={busy || note.trim().length < 5}
        onClick={async () => {
          setBusy(true);
          try {
            await ownerDrivers.acknowledgeAlert(ownerKey, alert.id, note);
            onToast("Recorded");
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save and close alert
      </button>
    </div>
  );
}

function statusTone(d: OwnerDriver): string {
  if (d.status === "approved") return d.available ? styles.green : styles.grey;
  if (d.status === "applied") return styles.amber;
  if (d.status === "suspended" || d.status === "declined") return styles.red;
  return styles.grey;
}

function SubHeader({ title, back, onBack }: { title: string; back: string; onBack: () => void }) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.backRow}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <BackIcon size={24} />
          {back}
        </button>
      </div>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageTitle}>{title}</h1>
      </div>
    </header>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 13, color: "#5B6B80" }}>{hint}</span> : null}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "1px solid #dce3ec",
  borderRadius: 12,
  padding: "0 14px",
  fontSize: 16,
  color: "#071C38",
  background: "#fff",
};

function LinkResult({ title, link, expiresAt, onDone }: { title: string; link: string; expiresAt: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14, color: "#33445C" }}>
        Copy this private link and send it to the driver yourself. It works once and expires {when(expiresAt)}.
      </p>
      <code style={{ fontSize: 12, wordBreak: "break-all", background: "#F3F6FA", padding: 10, borderRadius: 10 }}>{link}</code>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={async () => setCopied(await copy(link))}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <button type="button" className={styles.secondaryButton} onClick={onDone}>
        Done
      </button>
    </section>
  );
}

function InviteDriver({ ownerKey, onBack, onToast }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);

  return (
    <>
      <SubHeader title="Invite a driver" back="Drivers" onBack={onBack} />
      <main className={styles.main} style={{ gap: 14 }}>
        {result ? (
          <LinkResult title="Invitation ready" link={result.link} expiresAt={result.expiresAt} onDone={onBack} />
        ) : (
          <form
            className={`${styles.card} ${styles.cardPad}`}
            style={{ display: "grid", gap: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const res = await ownerDrivers.invite(ownerKey, { name, email, mobile });
                setResult({ link: driverPortalLink("invite", res.inviteToken), expiresAt: res.expiresAt });
                onToast("Driver invited");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not invite.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Full name">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
            </Field>
            <Field label="Email">
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </Field>
            <Field label="Mobile (optional)" hint="The driver can add or correct it when they apply.">
              <input style={inputStyle} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" />
            </Field>
            {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
            <button type="submit" className={styles.primaryButton} disabled={busy || !name.trim() || !email.trim()}>
              {busy ? "Creating…" : "Create invitation link"}
            </button>
            <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>Nothing is emailed or texted. You share the link yourself.</p>
          </form>
        )}
      </main>
    </>
  );
}

function DriverDetail({ ownerKey, driverId, onBack, onToast, onOpenBooking }: Props & { driverId: string; onOpenBooking?: OpenBooking }) {
  const [detail, setDetail] = useState<OwnerDriverDetail | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [link, setLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await ownerDrivers.detail(ownerKey, driverId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this driver.");
    }
  }, [ownerKey, driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detail?.messages.some((m) => !m.readAt && !m.urgent)) void ownerDrivers.markMessagesRead(ownerKey, driverId).catch(() => undefined);
  }, [detail, ownerKey, driverId]);

  if (link) {
    return (
      <>
        <SubHeader title="Sign-in link" back="Driver" onBack={() => setLink(null)} />
        <main className={styles.main}>
          <LinkResult title="Sign-in link ready" link={link.link} expiresAt={link.expiresAt} onDone={() => setLink(null)} />
        </main>
      </>
    );
  }

  const d = detail?.driver;
  const pendingDocs = detail?.documents.filter((doc) => doc.status === "pending") ?? [];

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast(done);
      await load();
      return true;
    } catch (e) {
      const extra = e instanceof DriverAccountsError ? (e.payload.missing as { label: string }[] | undefined) : undefined;
      setError(e instanceof Error ? `${e.message}${extra?.length ? ` ${extra.map((m) => m.label).join(", ")}.` : ""}` : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SubHeader title={d?.name ?? "Driver"} back="Drivers" onBack={onBack} />
      <main className={styles.main} style={{ gap: 14 }}>
        {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
        {!d ? (
          <p className={styles.empty}>Loading…</p>
        ) : (
          <>
            <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className={`${styles.chip} ${statusTone(d)}`}>{STATUS_LABEL[d.status]}</span>
                {d.status === "approved" ? (
                  <span className={`${styles.chip} ${d.available ? styles.green : styles.grey}`}>{d.available ? "Available" : "Unavailable"}</span>
                ) : null}
              </div>
              <Kv label="Operator" value={d.operatorName || "—"} />
              <Kv label="Operator licence" value={d.operatorLicenceNumber || "—"} />
              <Kv label="Vehicle" value={d.vehicleSummary || "—"} />
              <Kv label="Email" value={d.email} />
              <Kv label="Mobile" value={d.mobile || "—"} />
              {d.statusReason ? <Kv label="Reason" value={d.statusReason} /> : null}
              <Kv label="New work offers" value={detail.canReceiveOffers ? "Allowed" : "Blocked"} />
            </section>

            {detail.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} ownerKey={ownerKey} onOpenBooking={onOpenBooking} onDone={load} onToast={onToast} />
            ))}

            {detail.attention.length ? (
              <div className={`${styles.notice} ${styles.amber}`}>{ukDate(detail.attention.join(" · "))}</div>
            ) : null}

            {detail.messages.length ? (
              <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10 }}>
                <h2 className={styles.sectionTitle}>Messages to the office</h2>
                {detail.messages.slice(0, 8).map((m) => {
                  const open = m.urgent && !m.handledAt;
                  return (
                    <div
                      key={m.id}
                      style={{ display: "grid", gap: 6, ...(open ? { border: "2px solid #D92D20", borderRadius: 14, padding: 12, background: "#FEF3F2" } : {}) }}
                      data-driver-message={m.urgent ? "urgent" : "normal"}
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {m.urgent ? <span className={`${styles.chip} ${open ? styles.red : styles.grey}`}>{open ? `Urgent · ${m.categoryLabel}` : `Handled · ${m.categoryLabel}`}</span> : null}
                        {!m.urgent && m.category !== "general" ? <span className={`${styles.chip} ${styles.amber}`}>{m.categoryLabel}</span> : null}
                        <span style={{ fontSize: 13, color: "#5B6B80", fontWeight: 700 }}>
                          {when(m.createdAt)}
                          {!m.readAt && !m.urgent ? " · new" : ""}
                        </span>
                      </span>
                      <span style={{ fontSize: 15, color: "#071C38", whiteSpace: "pre-wrap" }}>{m.body}</span>
                      {open ? (
                        <>
                          {d.mobile ? (
                            <a className={styles.primaryButton} href={`tel:${d.mobile}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                              Call {d.name.split(" ")[0]}
                            </a>
                          ) : null}
                          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => run(() => ownerDrivers.markHandled(ownerKey, m.id), "Marked handled")}>
                            Mark handled
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            <section className={`${styles.card}`} style={{ overflow: "hidden" }}>
              <h2 className={styles.sectionTitle} style={{ padding: "14px 16px 6px" }}>
                Documents
              </h2>
              {detail.summary.map((item) => (
                <div key={item.kind} className={styles.row} style={{ cursor: "default" }}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                      {item.label}
                    </span>
                    {item.required ? null : <span className={styles.rowDetail}>Optional</span>}
                  </span>
                  <span className={`${styles.chip} ${styles[documentStateTone(item.state)]}`}>{documentStateLabel(item.state, item.expiresOn)}</span>
                </div>
              ))}
            </section>

            {pendingDocs.map((doc) => (
              <section key={doc.id} className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10 }}>
                <h2 className={styles.sectionTitle}>Check: {doc.label}</h2>
                <Kv label="Reference" value={doc.reference || "—"} />
                <Kv label="Expires" value={ukDate(doc.expiresOn)} />
                <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>Check the original document with the driver before accepting.</p>
                {rejecting === doc.id ? (
                  <>
                    <textarea className={styles.composer} style={{ minHeight: 80 }} placeholder="What needs fixing?" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={busy || !rejectNote.trim()}
                      onClick={async () => {
                        if (await run(() => ownerDrivers.reviewDocument(ownerKey, doc.id, "reject", rejectNote), "Document rejected")) {
                          setRejecting(null);
                          setRejectNote("");
                        }
                      }}
                    >
                      Reject document
                    </button>
                  </>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setRejecting(doc.id)}>
                      Reject
                    </button>
                    <button type="button" className={styles.emeraldButton} disabled={busy} onClick={() => run(() => ownerDrivers.reviewDocument(ownerKey, doc.id, "accept", ""), "Document accepted")}>
                      Accept
                    </button>
                  </div>
                )}
              </section>
            ))}

            {action ? (
              <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
                <h2 className={styles.sectionTitle}>{ACTION_LABEL[action]}</h2>
                {action === "approve" || action === "reinstate" ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#33445C" }}>
                    {d.name} will be able to sign in and set themselves available. They will not receive any jobs in Stage 1.
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 14, color: "#33445C" }}>
                      {action === "remove"
                        ? "The driver is signed out everywhere and can no longer sign in. Their records and audit trail are kept."
                        : action === "suspend"
                          ? "The driver is signed out everywhere straight away and can't receive new work. Any upcoming bookings they're on will be listed for you to review — nothing is cancelled, reassigned or refunded."
                          : "The driver is signed out everywhere straight away."}
                    </p>
                    <Field label="Reason (kept in the audit log)">
                      <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </Field>
                  </>
                )}
                <button
                  type="button"
                  className={action === "approve" || action === "reinstate" ? styles.emeraldButton : styles.dangerButton}
                  disabled={busy || ((action !== "approve" && action !== "reinstate") && !reason.trim())}
                  onClick={async () => {
                    let reviewCount = 0;
                    const ok = await run(async () => {
                      const res = await ownerDrivers.setStatus(ownerKey, d.id, action, reason);
                      reviewCount = res.reviewBookings?.length ?? 0;
                    }, `${ACTION_LABEL[action]}: done`);
                    if (ok && reviewCount) onToast(`${reviewCount} booking${reviewCount === 1 ? "" : "s"} to review`);
                    if (ok) {
                      setAction(null);
                      setReason("");
                    }
                  }}
                >
                  Confirm: {ACTION_LABEL[action].toLowerCase()}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setAction(null)}>
                  Cancel
                </button>
              </section>
            ) : (
              <section className={styles.card} style={{ overflow: "hidden" }}>
                {d.status === "approved" || d.status === "applied" ? (
                  <button
                    type="button"
                    className={styles.row}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await ownerDrivers.signInLink(ownerKey, d.id);
                        setLink({ link: driverPortalLink("signin", res.signInToken), expiresAt: res.expiresAt });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Could not create a link.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                        Create sign-in link
                      </span>
                      <span className={styles.rowDetail}>Single use · works for 30 minutes</span>
                    </span>
                    <ChevronIcon size={18} />
                  </button>
                ) : null}
                {(ACTIONS_FOR[d.status] ?? []).map((a) => (
                  <button key={a} type="button" className={styles.row} onClick={() => setAction(a)}>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle} style={{ fontWeight: 700, color: a === "approve" || a === "reinstate" ? "#0F7A2E" : a === "remove" || a === "suspend" || a === "decline" ? "#B42318" : undefined }}>
                        {ACTION_LABEL[a]}
                      </span>
                      {a === "approve" && detail.missingForApproval.length ? (
                        <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                          Needs accepted, in-date documents first
                        </span>
                      ) : null}
                    </span>
                    <ChevronIcon size={18} />
                  </button>
                ))}
              </section>
            )}

            <section className={styles.card} style={{ overflow: "hidden" }}>
              <button type="button" className={styles.row} aria-expanded={showAudit} onClick={() => setShowAudit((v) => !v)}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                    Audit trail
                  </span>
                  <span className={styles.rowDetail}>Permanent record — entries cannot be edited or deleted</span>
                </span>
                <ChevronIcon size={18} />
              </button>
              {showAudit
                ? detail.audit.map((a) => (
                    <div key={a.seq} className={styles.row} style={{ cursor: "default" }}>
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle} style={{ fontWeight: 600 }}>
                          {a.action === "driver.approved" && a.detail.from === "suspended"
                            ? "Reinstated"
                            : a.action === "booking_review.updated"
                              ? `${String(a.detail.reference)}: ${REVIEW_STATUS_LABEL[a.detail.to as ReviewItemStatus] ?? String(a.detail.to)}`
                              : AUDIT_LABEL[a.action] ?? a.action}
                          {typeof a.detail.reason === "string" && a.detail.reason ? ` — ${a.detail.reason}` : ""}
                          {a.action === "booking_review.updated" && typeof a.detail.note === "string" && a.detail.note ? ` — ${a.detail.note}` : ""}
                        </span>
                        <span className={styles.rowDetail}>
                          {when(a.at)} · {a.actor_type === "owner" ? "You" : a.actor_type === "driver" ? "Driver" : "System"}
                        </span>
                      </span>
                    </div>
                  ))
                : null}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: "#5B6B80" }}>{label}</span>
      <span style={{ color: "#071C38", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function SupportContactSettings({ ownerKey, onBack, onToast }: Props) {
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ownerDrivers
      .getSupportContact(ownerKey)
      .then((res) => {
        setSaved(res.phone);
        setPhone(res.phone);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [ownerKey]);

  const check = checkSupportPhone(phone);
  const unchanged = check.ok && check.phone === (saved ?? "");

  async function save(value: string) {
    setBusy(true);
    setError("");
    try {
      const res = await ownerDrivers.setSupportContact(ownerKey, value);
      setSaved(res.phone);
      setPhone(res.phone);
      onToast(res.phone ? "Driver support number saved" : "Driver support number removed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SubHeader title="Driver support number" back="Drivers" onBack={onBack} />
      <main className={styles.main} style={{ gap: 14 }}>
        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#33445C", lineHeight: 1.5 }}>
            The number approved drivers call from <b>Contact office</b>. It is never shown on the website or to customers. It must not be
            the customer line (028 9602 2952), which goes to the AI receptionist.
          </p>
          <Field label="Phone number" hint={saved === "" ? "Not set — drivers see a “Message the office” form instead." : undefined}>
            <input
              style={{ ...inputStyle, ...(phone.trim() && !check.ok ? { borderColor: "#D92D20", borderWidth: 2 } : {}) }}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              autoComplete="off"
              aria-invalid={!check.ok}
            />
          </Field>
          {!check.ok ? (
            <div className={`${styles.notice} ${styles.red}`} role="alert">
              {check.error}
            </div>
          ) : null}
          {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
          <button type="button" className={styles.primaryButton} disabled={busy || saved === null || !check.ok || !phone.trim() || unchanged} onClick={() => save(phone)}>
            Save
          </button>
          {saved ? (
            <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => save("")}>
              Remove number
            </button>
          ) : null}
        </section>
      </main>
    </>
  );
}
