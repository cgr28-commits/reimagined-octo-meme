/**
 * One id per customer booking, sent with every Pay press so the payment service can replace
 * (never duplicate) earlier unpaid payment links for the same booking. Kept in localStorage so
 * Back, refresh and other tabs share it; cleared once the booking is confirmed or a new quote is
 * started. The server never relies on this alone (it falls back to email + trip date).
 */
const KEY = "matni-payment-group-v1";
const MAX_AGE_MS = 7 * 86400000;

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `pg_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function getOrCreatePaymentGroupId(): string | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as { id?: string; createdAt?: number }) : null;
    if (saved?.id && /^pg_[a-z0-9]{16,64}$/.test(saved.id) && Date.now() - (saved.createdAt ?? 0) < MAX_AGE_MS) {
      return saved.id;
    }
    const id = newId();
    localStorage.setItem(KEY, JSON.stringify({ id, createdAt: Date.now() }));
    return id;
  } catch {
    return undefined; // The server falls back to email + trip date.
  }
}

export function clearPaymentGroupId(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures.
  }
}
