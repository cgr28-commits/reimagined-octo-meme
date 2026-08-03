"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";
import {
  contactCardUrl,
  saveContactToDevice,
  whatsAppChatUrl,
} from "@/lib/contact-card";

function ActionIcon({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "onEmerald";
}) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        tone === "onEmerald" ? "bg-navy/15 text-navy" : "bg-white/10 text-emerald"
      }`}
    >
      {children}
    </span>
  );
}

export default function ContactCardClient() {
  const cardUrl = contactCardUrl();
  const qrSrc = withBasePath("/contact-qr.png");
  const [savingContact, setSavingContact] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  async function handleSaveContact() {
    if (savingContact) return;
    setSavingContact(true);
    setSaveHint(null);
    try {
      const result = await saveContactToDevice();
      setSaveHint(
        result === "shared"
          ? "Share sheet opened — tap Contacts (not Create New Contact in Safari) to keep the logo."
          : "Opening contact file…",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save contact";
      // User cancelled the share sheet — not an error to surface harshly.
      if (/AbortError|canceled|cancelled/i.test(message) || (error instanceof DOMException && error.name === "AbortError")) {
        setSaveHint(null);
      } else {
        setSaveHint(message);
      }
    } finally {
      setSavingContact(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-navy">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(47,191,74,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(12,42,82,0.9),_transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-5 pb-12 pt-10 sm:px-6">
        <div className="contact-fade-up flex flex-1 flex-col">
          <div className="flex justify-center">
            <Image
              src={withBasePath("/logo.png")}
              alt={SITE.name}
              width={697}
              height={541}
              priority
              className="h-28 w-auto object-contain sm:h-32"
            />
          </div>

          <p className="contact-fade-up-delay-1 mt-6 text-center text-sm leading-relaxed text-white/70 sm:text-base">
            {SITE.tagline}
          </p>

          <div className="contact-fade-up-delay-2 mt-10 flex flex-col gap-3">
            <Link
              href="/#quote"
              className="flex items-center gap-4 rounded-2xl bg-emerald px-5 py-4 text-navy shadow-[0_12px_40px_rgba(47,191,74,0.22)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.99]"
            >
              <ActionIcon tone="onEmerald">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </ActionIcon>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-navy/70">
                  Book
                </span>
                <span className="mt-0.5 block text-lg font-bold">Get a quote &amp; book</span>
              </span>
            </Link>

            <a
              href={`tel:${SITE.landline}`}
              className="flex items-center gap-4 rounded-2xl border border-emerald/40 bg-emerald/10 px-5 py-4 text-white transition-colors hover:border-emerald hover:bg-emerald/15"
            >
              <ActionIcon>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              </ActionIcon>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-emerald">
                  Call
                </span>
                <span className="mt-0.5 block text-lg font-bold">{SITE.landlineDisplay}</span>
              </span>
            </a>

            <a
              href={whatsAppChatUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-4 text-white transition-colors hover:border-white/30 hover:bg-white/[0.06]"
            >
              <ActionIcon>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </ActionIcon>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-white/50">
                  WhatsApp
                </span>
                <span className="mt-0.5 block text-lg font-bold">@{SITE.whatsappUsername}</span>
              </span>
            </a>

            <a
              href={`mailto:${SITE.email}`}
              className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-4 text-white transition-colors hover:border-white/30 hover:bg-white/[0.06]"
            >
              <ActionIcon>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </ActionIcon>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-white/50">
                  Email
                </span>
                <span className="mt-0.5 block truncate text-base font-semibold sm:text-lg">
                  {SITE.email}
                </span>
              </span>
            </a>

            <button
              type="button"
              onClick={() => void handleSaveContact()}
              disabled={savingContact}
              className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-4 text-left text-white transition-colors hover:border-white/30 hover:bg-white/[0.06] disabled:opacity-70"
            >
              <ActionIcon>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
                  />
                </svg>
              </ActionIcon>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-white/50">
                  Save
                </span>
                <span className="mt-0.5 block text-lg font-bold">
                  {savingContact ? "Preparing…" : "Save to contacts"}
                </span>
                <span className="mt-0.5 block text-xs text-white/45">
                  iPhone: choose Contacts in the share sheet
                </span>
              </span>
            </button>
            {saveHint ? (
              <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">
                {saveHint}
              </p>
            ) : null}
          </div>

          <a
            href={SITE.url}
            className="contact-fade-up-delay-3 mt-6 text-center text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
          >
            www.myairporttaxini.co.uk
          </a>

          <div className="contact-fade-up-delay-3 mt-10 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              Scan QR code
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Opens this contact card — book, call, WhatsApp, or save to contacts.
            </p>
            <div className="mx-auto mt-5 inline-flex rounded-2xl bg-white p-3 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt={`QR code linking to ${cardUrl}`}
                width={220}
                height={220}
                className="h-48 w-48 sm:h-52 sm:w-52"
              />
            </div>
            <p className="mt-4 break-all text-xs text-white/45">{cardUrl}</p>
            <a
              href={qrSrc}
              download="my-airport-taxi-ni-contact-qr.png"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald/15 px-4 py-2.5 text-sm font-semibold text-emerald transition-colors hover:bg-emerald/25"
            >
              Download QR image
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
