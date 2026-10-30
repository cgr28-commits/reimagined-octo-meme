/**
 * Website client for My bookings (passwordless email-code sign-in).
 * The session token and the customer's last-used details are kept in this browser only,
 * so a signed-in customer gets their name / email / mobile filled in on the quote form.
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type {
  CustomerBookingsResponse,
  CustomerProfile,
} from "../../shared/customer-account";

const WORKER_BASE = resolveWorkerBaseUrl();
const SESSION_KEY = "mat-customer-session";
const PROFILE_KEY = "mat-customer-profile";

export class CustomerSignedOutError extends Error {}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode) — the customer just signs in again next time.
  }
}

export function readCustomerSession(): string {
  return safeGet(SESSION_KEY) ?? "";
}

export function readCachedCustomerProfile(): CustomerProfile | null {
  const raw = safeGet(PROFILE_KEY);
  if (!raw || !readCustomerSession()) return null;
  try {
    const parsed = JSON.parse(raw) as CustomerProfile;
    return parsed && typeof parsed.email === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(token: string, profile: CustomerProfile) {
  safeSet(SESSION_KEY, token);
  safeSet(PROFILE_KEY, JSON.stringify(profile));
}

export function clearCustomerSession() {
  safeSet(SESSION_KEY, null);
  safeSet(PROFILE_KEY, null);
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${WORKER_BASE}${path}`, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (response.status === 401) {
    clearCustomerSession();
    throw new CustomerSignedOutError(payload?.error || "Please sign in again.");
  }
  if (!response.ok || !payload) throw new Error(payload?.error || "Something went wrong. Please try again.");
  return payload;
}

export async function requestCustomerLoginCode(email: string): Promise<void> {
  await call<{ ok: true }>("/customer/login/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function verifyCustomerLoginCode(email: string, code: string): Promise<CustomerProfile> {
  const result = await call<{ token: string; profile: CustomerProfile }>("/customer/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: email.trim(), code: code.trim() }),
  });
  saveSession(result.token, result.profile);
  return result.profile;
}

export async function fetchCustomerBookings(): Promise<CustomerBookingsResponse> {
  const token = readCustomerSession();
  if (!token) throw new CustomerSignedOutError("Please sign in.");
  const result = await call<CustomerBookingsResponse>("/customer/bookings", {
    method: "GET",
    headers: { Accept: "application/json", "X-Customer-Session": token },
  });
  safeSet(PROFILE_KEY, JSON.stringify(result.profile));
  return result;
}

export async function signOutCustomer(): Promise<void> {
  const token = readCustomerSession();
  clearCustomerSession();
  if (!token) return;
  await fetch(`${WORKER_BASE}/customer/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Customer-Session": token },
    body: "{}",
  }).catch(() => undefined);
}
