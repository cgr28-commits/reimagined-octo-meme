"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CustomerSignedOutError,
  fetchCustomerBookings,
  readCustomerSession,
  requestCustomerLoginCode,
  signOutCustomer,
  verifyCustomerLoginCode,
} from "@/lib/customer-account-api";
import { prefillQuoteFromMyBookings } from "@/lib/quote-prefill";
import type {
  CustomerBookingSummary,
  CustomerBookingsResponse,
} from "../../../shared/customer-account";

type Step = "checking" | "email" | "code" | "signed-in";

function shortPlace(label: string): string {
  return label.split(",")[0]?.trim() || label;
}

function when(date: string, time: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return `${date} ${time}`.trim();
  const day = d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return time ? `${day}, ${time}` : day;
}

function rebook(booking: CustomerBookingSummary, reverse: boolean) {
  const from = {
    placeId: booking.pickupPlaceId,
    label: booking.pickupLabel,
    lat: booking.pickupLat,
    lng: booking.pickupLng,
  };
  const to = {
    placeId: booking.dropoffPlaceId,
    label: booking.dropoffLabel,
    lat: booking.dropoffLat,
    lng: booking.dropoffLng,
  };
  prefillQuoteFromMyBookings({
    rebook: reverse ? { pickup: to, dropoff: from } : { pickup: from, dropoff: to },
    returnJourney: reverse ? false : booking.returnJourney,
    passengers: booking.passengers,
    suitcases: booking.suitcases,
    vehicle: booking.vehicle,
  });
}

const STATUS_STYLE: Record<CustomerBookingSummary["status"], string> = {
  upcoming: "bg-emerald/15 text-emerald",
  completed: "bg-white/10 text-white/65",
  cancelled: "bg-red-500/15 text-red-300",
};
const STATUS_LABEL: Record<CustomerBookingSummary["status"], string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

function BookingCard({ booking }: { booking: CustomerBookingSummary }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{booking.reference}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[booking.status]}`}>
          {STATUS_LABEL[booking.status]}
        </span>
      </div>
      <p className="mt-3 text-base font-semibold text-white">
        {shortPlace(booking.pickupLabel)} <span className="text-white/45">→</span> {shortPlace(booking.dropoffLabel)}
      </p>
      <p className="mt-1 text-sm text-white/70">{when(booking.tripDate, booking.tripTime)}</p>
      {booking.returnJourney && booking.returnDate ? (
        <p className="text-sm text-white/70">Return: {when(booking.returnDate, booking.returnTime ?? "")}</p>
      ) : null}
      <p className="mt-1 text-xs text-white/50">
        {[
          booking.passengers ? `${booking.passengers} passenger${booking.passengers === 1 ? "" : "s"}` : "",
          typeof booking.suitcases === "number" ? `${booking.suitcases} case${booking.suitcases === 1 ? "" : "s"}` : "",
          booking.vehicle ?? "",
          booking.flightNumber ? `Flight ${booking.flightNumber}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => rebook(booking, false)}
          className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy"
        >
          Book again
        </button>
        {!booking.returnJourney ? (
          <button
            type="button"
            onClick={() => rebook(booking, true)}
            className="min-h-11 rounded-xl border border-emerald/40 px-4 text-sm font-semibold text-emerald"
          >
            Book the return trip
          </button>
        ) : null}
        {booking.status === "upcoming" && booking.manageUrl ? (
          <a
            href={booking.manageUrl}
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white"
          >
            Change or cancel
          </a>
        ) : null}
      </div>
    </li>
  );
}

export default function MyBookingsClient() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("checking");
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<CustomerBookingsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchCustomerBookings());
      setStep("signed-in");
    } catch (err) {
      if (err instanceof CustomerSignedOutError) {
        setStep(searchParams.get("sent") === "1" && email ? "code" : "email");
      } else {
        setError(err instanceof Error ? err.message : "Could not load your bookings.");
        setStep("email");
      }
    }
  }, [email, searchParams]);

  useEffect(() => {
    if (readCustomerSession()) {
      void load();
    } else if (searchParams.get("sent") === "1" && email) {
      setNotice(`We've emailed a 6-digit code to ${email}.`);
      setStep("code");
    } else {
      setStep("email");
    }
    // Run once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await requestCustomerLoginCode(email);
      setNotice(`If ${email.trim()} has booked with us, a 6-digit code is on its way. Check your inbox (and spam).`);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyCustomerLoginCode(email, code);
      setNotice("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await signOutCustomer();
    setData(null);
    setCode("");
    setStep("email");
  }

  const inputClass =
    "mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35";

  if (step === "checking") {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">Loading…</div>;
  }

  if (step === "email" || step === "code") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label className="block text-sm text-white/80">
              Email you booked with
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 min-h-12 w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy disabled:opacity-60"
            >
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            {notice ? <p className="mb-4 text-sm text-white/75">{notice}</p> : null}
            <label className="block text-sm text-white/80">
              6-digit code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputClass} tracking-[0.4em]`}
                placeholder="123456"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 min-h-12 w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy disabled:opacity-60"
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" onClick={() => void sendCode()} disabled={busy} className="min-h-11 text-emerald">
                Send a new code
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                  setNotice("");
                }}
                className="min-h-11 text-white/60"
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <p className="mt-5 text-xs leading-relaxed text-white/50">
          You don&apos;t need an account to book — this is just a handy place to see your journeys and rebook. Only
          bookings made with this email are shown.
        </p>
      </div>
    );
  }

  const bookings = data?.bookings ?? [];
  const upcoming = bookings.filter((b) => b.status === "upcoming");
  const past = bookings.filter((b) => b.status !== "upcoming");
  const firstName = data?.profile.name.split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/70">
          {firstName ? `Hi ${firstName} · ` : ""}
          <span className="break-all">{data?.profile.email}</span>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/80"
        >
          Sign out
        </button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section>
        <h2 className="text-lg font-semibold text-white">Upcoming</h2>
        {upcoming.length ? (
          <ul className="mt-3 space-y-3">
            {upcoming.map((b) => (
              <BookingCard key={b.reference} booking={b} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-white/60">No upcoming journeys. Use “Book again” below to rebook in seconds.</p>
        )}
      </section>

      {past.length ? (
        <section>
          <h2 className="text-lg font-semibold text-white">Past bookings</h2>
          <ul className="mt-3 space-y-3">
            {past.map((b) => (
              <BookingCard key={b.reference} booking={b} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-white/50">
        “Book again” fills in the same pickup, drop-off, passengers and luggage. You choose the date and time, and the
        price is worked out fresh.
      </p>
    </div>
  );
}
