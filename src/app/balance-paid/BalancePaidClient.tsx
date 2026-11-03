"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/data";

type Copy = { heading: string; body: string };

const COPY: Record<string, Copy> = {
  paid: {
    heading: "Thank you — you're all paid",
    body: "We've received your balance payment and your booking is fully paid. We've emailed you a receipt. There's nothing more to pay.",
  },
  pending: {
    heading: "We're confirming your payment",
    body: "If you completed the payment, you'll get a confirmation email shortly. If you didn't finish paying, use the link in your email to try again.",
  },
  cancelled: {
    heading: "This booking has been cancelled",
    body: "The balance can no longer be paid online for this booking. Please contact us if you think this is a mistake.",
  },
  unavailable: {
    heading: "Card payment isn't available right now",
    body: "Please try the link in your email again in a few minutes, or contact us and we'll help.",
  },
  invalid: {
    heading: "We couldn't open this payment link",
    body: "Please use the most recent link in your email, or contact us and we'll help.",
  },
};

export default function BalancePaidClient() {
  const [status, setStatus] = useState("pending");
  const [reference, setReference] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("status") || "pending";
    setStatus(COPY[next] ? next : "pending");
    setReference((params.get("ref") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40));
  }, []);

  const copy = COPY[status] ?? COPY.pending;
  return (
    <section data-balance-paid={status} className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 text-white sm:p-8">
      <h1 className="text-2xl font-bold">{copy.heading}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/85">{copy.body}</p>
      {reference ? (
        <p className="mt-4 text-sm text-white/70">
          Booking reference: <span className="font-semibold text-white">{reference}</span>
        </p>
      ) : null}
      <p className="mt-6 text-sm text-white/70">
        Questions? Call {SITE.officeLandlineDisplay} or WhatsApp {SITE.landlineDisplay}.
      </p>
      <Link href="/" className="btn-primary mt-6 inline-flex">
        Back to home
      </Link>
    </section>
  );
}
