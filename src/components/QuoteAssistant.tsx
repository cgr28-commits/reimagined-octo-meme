"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIsMobileDevice } from "@/lib/device";
import { withBasePath } from "@/lib/paths";
import { contactCardUrl, saveContactToDevice } from "@/lib/contact-card";
import {
  createWelcomeMessages,
  emptyQuoteDraft,
  respondToAssistantMessage,
  type AssistantMessage,
  type QuoteDraft,
} from "@/lib/quote-assistant";

export default function QuoteAssistant() {
  const isMobile = useIsMobileDevice();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>(() => createWelcomeMessages());
  const [quickReplies, setQuickReplies] = useState<string[]>([
    "Get a quote",
    "Cancellation policy",
    "Save contact details",
  ]);
  const [draft, setDraft] = useState<QuoteDraft>({});
  const [showContactOffer, setShowContactOffer] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const qrSrc = withBasePath("/contact-qr.png");

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, showContactOffer]);

  async function handleSaveContact() {
    if (savingContact) return;
    setSavingContact(true);
    setSaveHint(null);
    try {
      const result = await saveContactToDevice();
      if (result === "ios-download") {
        setSaveHint("Contact file downloading — open it to save with our logo.");
      } else if (result === "shared") {
        setSaveHint("Share sheet opened — choose Contacts to save with the logo.");
      } else {
        setSaveHint("Opening contact file…");
      }
    } catch (error) {
      setSaveHint(error instanceof Error ? error.message : "Could not save contact");
    } finally {
      setSavingContact(false);
    }
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text) return;

    if (/^request to book$/i.test(text)) {
      window.location.href = "/#quote";
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    const result = respondToAssistantMessage(text, draft);
    setDraft(result.resetDraft ? emptyQuoteDraft() : result.draft);
    setQuickReplies(result.quickReplies ?? []);
    if (result.showContactOffer) {
      setShowContactOffer(true);
    }
    setMessages((prev) => [...prev, { role: "bot", text: result.reply }]);
    setInput("");
  }

  function resetChat() {
    setMessages(createWelcomeMessages());
    setDraft(emptyQuoteDraft());
    setQuickReplies(["Get a quote", "Cancellation policy", "Save contact details"]);
    setShowContactOffer(true);
    setSaveHint(null);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-emerald bg-navy shadow-lg shadow-emerald/30 transition-all hover:bg-navy-light sm:bottom-8 sm:right-8 sm:h-16 sm:w-16"
        aria-label={open ? "Close quote assistant" : "Open quote assistant"}
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-6 w-6 text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <Image
            src={withBasePath("/logo.png")}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-contain p-1.5"
          />
        )}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex w-[min(100vw-2rem,24rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-navy-dark shadow-2xl sm:bottom-28 sm:right-8">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-navy px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald/50 bg-navy">
                <Image
                  src={withBasePath("/logo.png")}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Quote assistant</p>
                <p className="text-xs text-white/55">Questions · fixed prices · save our contact</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetChat}
              className="shrink-0 text-xs font-semibold text-emerald hover:text-emerald-light"
            >
              New chat
            </button>
          </div>

          <div ref={listRef} className="max-h-[45vh] space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
            {showContactOffer ? (
              <div className="rounded-2xl border border-emerald/35 bg-emerald/10 px-3 py-3">
                <p className="text-sm font-semibold text-white">Would you like to add our contact details?</p>
                <p className="mt-1 text-xs text-white/65">
                  {isMobile
                    ? "Save our contact card to your phone — includes our logo."
                    : "Scan the QR code with your phone to open our contact card."}
                </p>

                {isMobile === false ? (
                  <div className="mt-3 flex flex-col items-center">
                    <div className="rounded-xl bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrSrc}
                        alt={`QR code for ${contactCardUrl()}`}
                        width={160}
                        height={160}
                        className="h-36 w-36"
                      />
                    </div>
                    <p className="mt-2 text-center text-[11px] text-white/50">Scan · Quote · Book</p>
                    <Link
                      href="/contact/"
                      className="mt-2 text-xs font-semibold text-emerald hover:text-emerald-light"
                    >
                      Open contact card
                    </Link>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      disabled={savingContact}
                      onClick={() => void handleSaveContact()}
                      className="w-full rounded-xl bg-emerald px-3 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
                    >
                      {savingContact ? "Preparing…" : "Save our contact details"}
                    </button>
                    <Link
                      href="/contact/"
                      className="block w-full rounded-xl border border-white/15 px-3 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:border-white/30"
                    >
                      Open full contact card
                    </Link>
                    {saveHint ? <p className="text-xs text-emerald">{saveHint}</p> : null}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowContactOffer(false)}
                  className="mt-3 text-xs text-white/45 hover:text-white/70"
                >
                  Hide for now
                </button>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-emerald text-navy"
                    : "mr-auto bg-white/10 text-white/90"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          {quickReplies.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/10 px-3 py-2">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendText(reply)}
                  className="rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald transition-colors hover:bg-emerald/20"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="flex gap-2 border-t border-white/10 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              sendText(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a question or get a quote…"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald/50"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-emerald px-3 py-2 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
