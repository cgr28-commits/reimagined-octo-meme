"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_SEND_FAILED,
  sendContactMessage,
  validateContactMessage,
  type ContactMessageField,
} from "@/lib/contact-message";
import { SITE } from "@/lib/data";

const fieldClass =
  "mt-1.5 box-border min-h-12 w-full min-w-0 rounded-xl border border-white/25 bg-navy px-3.5 py-2.5 text-base text-white outline-none placeholder:text-white/45";
const labelClass = "block text-sm font-semibold text-white";
const errorClass = "mt-1.5 text-sm text-red-300";

/**
 * Email contact form (owner, 17 Nov 2026). Sends the customer's message to the bookings inbox;
 * it never creates a booking. A hidden box catches automated form-fillers: anything that fills
 * it gets the thank-you screen and nothing is sent.
 */
export default function EmailContactClient() {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bookingReference, setBookingReference] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [fieldError, setFieldError] = useState<{ field: ContactMessageField; error: string } | null>(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  function errorFor(field: ContactMessageField): string {
    return fieldError?.field === field ? fieldError.error : "";
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const input = { name, email, bookingReference, message };
    const invalid = validateContactMessage(input);
    setFieldError(invalid);
    setSendError("");
    if (invalid) {
      document.getElementById(`${id}-${invalid.field}`)?.focus();
      return;
    }
    if (trap.trim()) {
      // Automated form-filler: show the thank-you screen, send nothing.
      setSent(true);
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      await sendContactMessage(input);
      setSent(true);
    } catch (failure) {
      const known = failure instanceof Error && failure.name !== "AbortError" && !(failure instanceof TypeError);
      setSendError(known ? failure.message : CONTACT_MESSAGE_SEND_FAILED);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (sent) {
    return (
      <section
        data-contact-email-sent
        role="status"
        className="mt-6 rounded-2xl border border-emerald/35 bg-emerald/10 px-5 py-7 text-center sm:px-6"
      >
        <h2 ref={sentHeading} tabIndex={-1} className="text-xl font-bold text-white outline-none sm:text-2xl">
          Message sent
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base">
          Thank you. We&apos;ve received your message and will reply by email as soon as we can.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/#quote" className="btn-primary flex min-h-12 w-full items-center justify-center px-5">
            Get a fixed price
          </Link>
          <Link
            href="/contact/"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-semibold text-white"
          >
            Back to Contact
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      data-contact-email-form
      noValidate
      aria-busy={sending}
      onSubmit={onSubmit}
      className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-6 sm:px-6"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor={`${id}-name`}>
            Your name
          </label>
          <input
            id={`${id}-name`}
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            disabled={sending}
            aria-invalid={Boolean(errorFor("name"))}
            aria-describedby={errorFor("name") ? `${id}-name-error` : undefined}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />
          {errorFor("name") ? (
            <p id={`${id}-name-error`} role="alert" className={errorClass}>
              {errorFor("name")}
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-email`}>
            Your email
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            disabled={sending}
            aria-invalid={Boolean(errorFor("email"))}
            aria-describedby={errorFor("email") ? `${id}-email-error` : undefined}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
          {errorFor("email") ? (
            <p id={`${id}-email-error`} role="alert" className={errorClass}>
              {errorFor("email")}
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-bookingReference`}>
            Booking reference <span className="font-normal text-white/60">(if you have one)</span>
          </label>
          <input
            id={`${id}-bookingReference`}
            name="bookingReference"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={40}
            value={bookingReference}
            disabled={sending}
            aria-invalid={Boolean(errorFor("bookingReference"))}
            aria-describedby={errorFor("bookingReference") ? `${id}-bookingReference-error` : undefined}
            onChange={(event) => setBookingReference(event.target.value)}
            className={fieldClass}
          />
          {errorFor("bookingReference") ? (
            <p id={`${id}-bookingReference-error`} role="alert" className={errorClass}>
              {errorFor("bookingReference")}
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-message`}>
            Your message
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            rows={5}
            required
            maxLength={CONTACT_MESSAGE_MAX_LENGTH}
            value={message}
            disabled={sending}
            aria-invalid={Boolean(errorFor("message"))}
            aria-describedby={errorFor("message") ? `${id}-message-error` : undefined}
            onChange={(event) => setMessage(event.target.value)}
            className={`${fieldClass} block min-h-32 resize-y leading-relaxed`}
          />
          {errorFor("message") ? (
            <p id={`${id}-message-error`} role="alert" className={errorClass}>
              {errorFor("message")}
            </p>
          ) : null}
        </div>
      </div>

      {/* Not for people: hidden from view, keyboards and screen readers. The name is one that
          browsers never auto-fill, so a real customer's message can't be dropped by mistake. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${id}-trap`}>Leave this box empty</label>
        <input
          id={`${id}-trap`}
          name="fax_only"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(event) => setTrap(event.target.value)}
        />
      </div>

      {sendError ? (
        <p role="alert" data-contact-email-error className="mt-4 text-sm leading-relaxed text-red-300">
          {sendError}{" "}
          <a href={`mailto:${SITE.email}`} className="font-semibold underline">
            {SITE.email}
          </a>
        </p>
      ) : null}

      <button type="submit" disabled={sending} className="btn-primary mt-5 min-h-12 w-full disabled:opacity-60">
        {sending ? "Sending…" : "Send message"}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-white/60">
        We only use these details to reply to you.{" "}
        <Link href="/privacy/" className="underline">
          Privacy policy
        </Link>
      </p>
    </form>
  );
}
