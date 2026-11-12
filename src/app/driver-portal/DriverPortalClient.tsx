"use client";

/**
 * Driver portal — Stage 1 (individual accounts).
 * Sign in with a single-use link from the office, apply, add documents, set availability,
 * contact the office. Jobs and earnings arrive in later stages.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/owner-mobile/OwnerMobile.module.css";
import {
  DOCUMENT_OPTIONS,
  MESSAGE_OPTIONS,
  DriverAccountsError,
  documentStateLabel,
  documentStateTone,
  driverAccount,
  readDriverSession,
  storeDriverSession,
  type DriverMe,
} from "@/lib/driver-accounts-api";

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "apply"; token: string }
  | { kind: "ready"; me: DriverMe };

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

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#071C38" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 13, color: "#5B6B80" }}>{hint}</span> : null}
    </label>
  );
}

function readFragment(): { invite?: string; signin?: string } {
  const hash = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return { invite: params.get("invite") || undefined, signin: params.get("signin") || undefined };
}

function clearFragment() {
  // Remove the single-use token from the address bar and history.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export default function DriverPortalClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [session, setSession] = useState("");
  const [toast, setToast] = useState("");

  const loadMe = useCallback(async (token: string) => {
    try {
      const me = await driverAccount.me(token);
      setPhase({ kind: "ready", me });
    } catch (e) {
      if (e instanceof DriverAccountsError && (e.status === 401 || e.status === 403)) {
        storeDriverSession("");
        setSession("");
        setPhase({ kind: "signed-out", message: e.status === 403 ? e.message : undefined });
      } else {
        setPhase({ kind: "signed-out", message: e instanceof Error ? e.message : "Could not load your account." });
      }
    }
  }, []);

  useEffect(() => {
    const boot = (fromHashChange: boolean) => {
      const { invite, signin } = readFragment();
      if (invite) {
        clearFragment();
        setPhase({ kind: "apply", token: invite });
        return;
      }
      if (signin) {
        clearFragment();
        setPhase({ kind: "loading" });
        driverAccount
          .signIn(signin)
          .then(({ sessionToken }) => {
            storeDriverSession(sessionToken);
            setSession(sessionToken);
            return loadMe(sessionToken);
          })
          .catch((e) => setPhase({ kind: "signed-out", message: e instanceof Error ? e.message : "This link did not work." }));
        return;
      }
      if (fromHashChange) return;
      const stored = readDriverSession();
      if (stored) {
        setSession(stored);
        void loadMe(stored);
      } else {
        setPhase({ kind: "signed-out" });
      }
    };
    boot(false);
    // A link opened while the portal is already showing only changes the #fragment.
    const onHash = () => boot(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [loadMe]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className={styles.app} data-driver-portal>
      <div className={styles.inner}>
        <div data-owner-mobile-header className={styles.heroHeader}>
          <div className={styles.heroTop}>
            <span style={{ fontWeight: 800, letterSpacing: 0.2 }}>My Airport Taxi NI · Drivers</span>
          </div>
          <h1 className={styles.heroTitle}>
            {phase.kind === "ready" ? `Hi ${phase.me.driver.name.split(" ")[0]}` : phase.kind === "apply" ? "Join as a partner driver" : "Driver portal"}
          </h1>
        </div>
        <main className={styles.main} style={{ gap: 14 }}>
          {phase.kind === "loading" ? <p className={styles.empty}>Loading…</p> : null}
          {phase.kind === "signed-out" ? <SignedOut message={phase.message} /> : null}
          {phase.kind === "apply" ? (
            <ApplyForm
              token={phase.token}
              onApplied={(token) => {
                storeDriverSession(token);
                setSession(token);
                setToast("Application sent");
                void loadMe(token);
              }}
            />
          ) : null}
          {phase.kind === "ready" ? (
            <Home
              me={phase.me}
              session={session}
              onChanged={() => loadMe(session)}
              onToast={setToast}
              onSignedOut={() => {
                storeDriverSession("");
                setSession("");
                setPhase({ kind: "signed-out", message: "You are signed out." });
              }}
            />
          ) : null}
        </main>
      </div>
      {toast ? (
        <div
          role="status"
          style={{ position: "fixed", left: "50%", bottom: "calc(24px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", background: "#071C38", color: "#fff", padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, zIndex: 80 }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function SignedOut({ message }: { message?: string }) {
  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 10 }}>
      {message ? <div className={`${styles.notice} ${styles.amber}`}>{message}</div> : null}
      <h2 className={styles.sectionTitle}>Sign in with your link</h2>
      <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
        Each driver has their own account. Ask the office for a sign-in link — it works once and expires after 30 minutes. Open it on this
        phone to stay signed in.
      </p>
    </section>
  );
}

function ApplyForm({ token, onApplied }: { token: string; onApplied: (session: string) => void }) {
  const [mobile, setMobile] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorLicenceNumber, setOperatorLicenceNumber] = useState("");
  const [vehicleSummary, setVehicleSummary] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className={`${styles.card} ${styles.cardPad}`}
      style={{ display: "grid", gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const res = await driverAccount.acceptInvite({ token, mobile, operatorName, operatorLicenceNumber, vehicleSummary, confirmOwnOperatorLicence: confirm });
          onApplied(res.sessionToken);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send your application.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p style={{ margin: 0, fontSize: 15, color: "#33445C", lineHeight: 1.5 }}>
        Partner drivers work under their own taxi operator licence. Add your details, then your documents for the office to check.
      </p>
      <Field label="Mobile">
        <input style={inputStyle} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" />
      </Field>
      <Field label="Operator name" hint="As it appears on your operator licence">
        <input style={inputStyle} value={operatorName} onChange={(e) => setOperatorName(e.target.value)} required />
      </Field>
      <Field label="Operator licence number">
        <input style={inputStyle} value={operatorLicenceNumber} onChange={(e) => setOperatorLicenceNumber(e.target.value)} required />
      </Field>
      <Field label="Vehicle (optional)" hint="e.g. Skoda Superb, 4 passengers">
        <input style={inputStyle} value={vehicleSummary} onChange={(e) => setVehicleSummary(e.target.value)} />
      </Field>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#071C38", fontWeight: 600 }}>
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1 }} />I hold my own valid taxi operator licence and hire &amp; reward insurance.
      </label>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button type="submit" className={styles.emeraldButton} disabled={busy || !confirm || !operatorName.trim() || !operatorLicenceNumber.trim()}>
        {busy ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}

function Home({
  me,
  session,
  onChanged,
  onToast,
  onSignedOut,
}: {
  me: DriverMe;
  session: string;
  onChanged: () => Promise<void> | void;
  onToast: (t: string) => void;
  onSignedOut: () => void;
}) {
  const d = me.driver;
  const approved = d.status === "approved";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const attention = me.summary.filter((s) => s.required && s.state !== "valid");

  async function toggleAvailable() {
    setBusy(true);
    setError("");
    try {
      await driverAccount.setAvailable(session, !d.available);
      onToast(!d.available ? "You're available" : "You're unavailable");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      {!approved ? (
        <div className={`${styles.notice} ${styles.amber}`}>
          Your application is with the office. Add your documents below — you&apos;ll be able to go available once you&apos;re approved.
        </div>
      ) : (
        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2 className={styles.sectionTitle}>{d.available ? "You're available" : "You're unavailable"}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#5B6B80" }}>
                {d.available ? "The office can see you're free for work." : "The office won't plan work for you."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={d.available}
              aria-label="Available for work"
              disabled={busy}
              onClick={toggleAvailable}
              style={{ width: 72, height: 44, borderRadius: 999, border: 0, background: d.available ? "#2FBF4A" : "#C9D2DE", position: "relative", flexShrink: 0, cursor: "pointer" }}
            >
              <span style={{ position: "absolute", top: 4, left: d.available ? 32 : 4, width: 36, height: 36, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(7,28,56,0.25)", transition: "left 150ms" }} />
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>Jobs and offers arrive in a later update.</p>
        </section>
      )}

      {approved ? <ContactOffice me={me} session={session} onToast={onToast} /> : null}

      <section className={styles.card} style={{ overflow: "hidden" }}>
        <h2 className={styles.sectionTitle} style={{ padding: "14px 16px 6px" }}>
          Documents{attention.length ? ` · ${attention.length} to sort` : ""}
        </h2>
        {me.summary.map((item) => {
          const doc = me.documents.find((x) => x.kind === item.kind && x.status === "rejected");
          return (
            <div key={item.kind} className={styles.row} style={{ cursor: "default" }}>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                  {item.label}
                </span>
                {item.required ? null : <span className={styles.rowDetail}>Optional</span>}
                {item.state === "rejected" && doc?.reviewNote ? (
                  <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                    {doc.reviewNote}
                  </span>
                ) : null}
              </span>
              <span className={`${styles.chip} ${styles[documentStateTone(item.state)]}`}>{documentStateLabel(item.state, item.expiresOn)}</span>
            </div>
          );
        })}
        <div style={{ padding: 16 }}>
          {addingDoc ? (
            <AddDocument
              session={session}
              onDone={async (added) => {
                setAddingDoc(false);
                if (added) {
                  onToast("Sent to the office to check");
                  await onChanged();
                }
              }}
            />
          ) : (
            <button type="button" className={styles.secondaryButton} style={{ width: "100%" }} onClick={() => setAddingDoc(true)}>
              Add or renew a document
            </button>
          )}
        </div>
      </section>

      <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 8 }}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <Row label="Operator" value={d.operatorName || "—"} />
        <Row label="Operator licence" value={d.operatorLicenceNumber || "—"} />
        <Row label="Vehicle" value={d.vehicleSummary || "—"} />
        <Row label="Mobile" value={d.mobile || "—"} />
        <Row label="Email" value={d.email} />
        <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>To change these, contact the office.</p>
      </section>

      <button
        type="button"
        className={styles.dangerButton}
        onClick={async () => {
          await driverAccount.signOut(session).catch(() => undefined);
          onSignedOut();
        }}
      >
        Sign out of this phone
      </button>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: "#5B6B80" }}>{label}</span>
      <span style={{ color: "#071C38", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function ContactOffice({ me, session, onToast }: { me: DriverMe; session: string; onToast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contact = me.contactOffice;
  const option = MESSAGE_OPTIONS.find((o) => o.category === category) ?? MESSAGE_OPTIONS[0];

  return (
    <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "grid", gap: 12 }}>
      <h2 className={styles.sectionTitle}>Contact office</h2>
      {contact.mode === "phone" ? (
        <a className={styles.primaryButton} href={`tel:${contact.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          Call the office
        </a>
      ) : null}
      {open ? (
        <>
          <div role="radiogroup" aria-label="What is it about?" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {MESSAGE_OPTIONS.map((o) => {
              const active = o.category === category;
              return (
                <button
                  key={o.category}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(o.category)}
                  style={{
                    minHeight: 44,
                    padding: "0 14px",
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    border: active ? `2px solid ${o.urgent ? "#D92D20" : "#071C38"}` : "1px solid #dce3ec",
                    background: active ? (o.urgent ? "#FEF3F2" : "#071C38") : "#fff",
                    color: active ? (o.urgent ? "#B42318" : "#fff") : o.urgent ? "#B42318" : "#071C38",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {option.urgent ? (
            <div className={`${styles.notice} ${styles.red}`}>
              If anyone is hurt or in danger, call 999 first. This report goes to the top of the office dashboard.
            </div>
          ) : null}
          <textarea
            className={styles.composer}
            style={{ minHeight: 110 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={option.urgent ? "Where are you, which booking, and is the passenger with you?" : "Write to the office…"}
            maxLength={1000}
          />
          {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
          <button
            type="button"
            className={option.urgent ? styles.dangerButton : styles.primaryButton}
            style={option.urgent ? { background: "#D92D20", color: "#fff", border: 0, minHeight: 52, fontSize: 16, borderRadius: 14 } : undefined}
            disabled={busy || !message.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const res = await driverAccount.messageOffice(session, message, category);
                setMessage("");
                setOpen(false);
                setCategory("general");
                onToast(res.priority === "urgent" ? "Urgent report sent to the office" : "Message sent to the office");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not send.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : option.urgent ? "Send urgent report" : "Send message"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className={contact.mode === "phone" ? styles.secondaryButton : styles.primaryButton} onClick={() => setOpen(true)}>
          Message or report a problem
        </button>
      )}
      <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>For an emergency on the road, call 999 first.</p>
    </section>
  );
}

function AddDocument({ session, onDone }: { session: string; onDone: (added: boolean) => void }) {
  const [kind, setKind] = useState(DOCUMENT_OPTIONS[0].kind);
  const [reference, setReference] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Document">
        <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
          {DOCUMENT_OPTIONS.map((o) => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Licence or policy number">
        <input style={inputStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <Field label="Expiry date">
        <input style={inputStyle} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </Field>
      <p style={{ margin: 0, fontSize: 13, color: "#5B6B80" }}>Photo upload is coming. For now, show the original to the office.</p>
      {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy || !expiresOn}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await driverAccount.submitDocument(session, { kind, reference, expiresOn });
            onDone(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not add the document.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Send to the office
      </button>
      <button type="button" className={styles.secondaryButton} onClick={() => onDone(false)}>
        Cancel
      </button>
    </div>
  );
}
