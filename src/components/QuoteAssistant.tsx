"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddressInput from "@/components/AddressInput";
import { playBotOpenSound, playBotReplySound, playBotWorkingSound } from "@/lib/bot-sounds";
import { contactCardUrl } from "@/lib/contact-card";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import { withBasePath } from "@/lib/paths";
import { prefillQuoteFromAssistant } from "@/lib/quote-prefill";
import {
  createWelcomeMessages,
  emptyQuoteDraft,
  getNextQuoteField,
  isPricableStreetAddress,
  respondToAssistantMessage,
  type AssistantMessage,
  type QuoteCardSummary,
  type QuoteDraft,
} from "@/lib/quote-assistant";

const BOT_WORKING_MS = 450;

function QuotePriceCard({ card, note }: { card: QuoteCardSummary; note: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald/40 bg-emerald/10 shadow-lg shadow-emerald/10">
      <div className="border-b border-emerald/25 bg-emerald px-4 py-4 text-navy">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-navy/70">
          Your fixed journey price
        </p>
        <p className="mt-1 text-4xl font-black tracking-tight">{card.amountLabel}</p>
        <p className="mt-1 text-sm font-semibold text-navy/80">{card.directionLabel}</p>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-white/90">
        <p>
          <span className="text-white/55">Vehicle · </span>
          {card.vehicle}
          {card.returnJourney ? " · return (5% off)" : " · one way"}
        </p>
        <p>
          <span className="text-white/55">Passengers · </span>
          {card.passengers}
          <span className="text-white/55"> · Suitcases · </span>
          {card.suitcases}
        </p>
        {card.area ? (
          <p>
            <span className="text-white/55">Priced for · </span>
            {card.area}
          </p>
        ) : null}
        <p className="break-words">
          <span className="text-white/55">Address · </span>
          {card.address}
        </p>
        <p className="text-xs leading-relaxed text-white/60">{card.waitingNote}</p>
        <p className="whitespace-pre-wrap pt-1 text-sm leading-relaxed text-white/85">{note}</p>
      </div>
    </div>
  );
}

export default function QuoteAssistant() {
  const isMobile = useIsMobileDevice();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>(() => createWelcomeMessages());
  const [quickReplies, setQuickReplies] = useState<string[]>([
    "Get a quote",
    "Save to contacts",
  ]);
  const [draft, setDraft] = useState<QuoteDraft>({});
  const [showContactOffer, setShowContactOffer] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [addressValue, setAddressValue] = useState("");
  const [mounted, setMounted] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contactOfferRef = useRef<HTMLDivElement>(null);
  const workingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const qrSrc = withBasePath("/contact-qr.png");
  const awaitingField = !isWorking ? getNextQuoteField(draft) : null;
  const showAddressPicker = awaitingField === "address";
  const addressLabel =
    draft.direction === "from-airport" ? "Drop-off address" : "Pickup address";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (workingTimerRef.current) {
        clearTimeout(workingTimerRef.current);
      }
    };
  }, []);

  // Keep the page from sliding sideways while the chat is open.
  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehaviorX;
    const prevBodyOverscroll = body.style.overscrollBehaviorX;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehaviorX = "none";
    body.style.overscrollBehaviorX = "none";

    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }

    const keepHorizontalOrigin = () => {
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
    };

    const preventBackgroundTouchScroll = (event: TouchEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (panelRef.current?.contains(target) || launcherRef.current?.contains(target))
      ) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("scroll", keepHorizontalOrigin, { passive: true });
    document.addEventListener("touchmove", preventBackgroundTouchScroll, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehaviorX = prevHtmlOverscroll;
      body.style.overscrollBehaviorX = prevBodyOverscroll;
      window.removeEventListener("scroll", keepHorizontalOrigin);
      document.removeEventListener("touchmove", preventBackgroundTouchScroll);
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (showContactOffer && !isWorking) {
      contactOfferRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      return;
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, showContactOffer, isWorking, showAddressPicker]);

  useEffect(() => {
    if (!showAddressPicker) {
      setAddressValue("");
    }
  }, [showAddressPicker]);

  function toggleOpen() {
    setOpen((value) => {
      const next = !value;
      if (next) {
        playBotOpenSound();
      }
      return next;
    });
  }

  function openContactCardOnMobile() {
    setShowContactOffer(false);
    setOpen(false);
    window.location.assign(withBasePath("/contact/"));
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text || isWorking) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setAddressValue("");
    setIsWorking(true);
    playBotWorkingSound();

    if (workingTimerRef.current) {
      clearTimeout(workingTimerRef.current);
    }

    workingTimerRef.current = setTimeout(() => {
      const result = respondToAssistantMessage(text, draftRef.current);
      const nextDraft = result.resetDraft ? emptyQuoteDraft() : result.draft;
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      setQuickReplies(result.quickReplies ?? []);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: result.reply,
          ...(result.quoteCard ? { quoteCard: result.quoteCard } : {}),
        },
      ]);
      setIsWorking(false);
      playBotReplySound();
      workingTimerRef.current = null;

      if (result.openQuoteForm) {
        setShowContactOffer(false);
        prefillQuoteFromAssistant(nextDraft);
        setOpen(false);
        return;
      }

      if (result.showContactOffer === true) {
        const mobile = isMobile ?? detectMobileDevice();
        if (mobile) {
          // Mobile: minimise the bot and open the contact card (no QR needed).
          openContactCardOnMobile();
          return;
        }
        setShowContactOffer(true);
        return;
      }

      setShowContactOffer(false);
    }, BOT_WORKING_MS);
  }

  function confirmAddress() {
    if (!addressValue.trim() || isWorking) return;
    sendText(addressValue);
  }

  function resetChat() {
    setMessages(createWelcomeMessages());
    setDraft(emptyQuoteDraft());
    setQuickReplies(["Get a quote", "Save to contacts"]);
    setShowContactOffer(false);
    setAddressValue("");
    setInput("");
  }

  const ui = (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={toggleOpen}
        className={`fixed bottom-6 right-3 z-50 flex max-w-[calc(100%-1.5rem)] items-center border-2 border-emerald bg-navy shadow-lg shadow-emerald/30 transition-all hover:bg-navy-light sm:bottom-8 sm:right-8 ${
          open
            ? "h-14 w-14 justify-center rounded-full sm:h-16 sm:w-16"
            : "gap-2 rounded-2xl py-2 pl-2 pr-3 sm:gap-3 sm:py-2.5 sm:pl-2.5 sm:pr-4"
        }`}
        aria-label={open ? "Close ask-a-question chat" : "Ask a question — get quotes and help"}
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-6 w-6 text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <>
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-dark sm:h-12 sm:w-12">
              <Image
                src={withBasePath("/logo.png")}
                alt=""
                width={48}
                height={48}
                className="h-full w-full object-contain p-1"
              />
              <span
                className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-md bg-emerald text-navy"
                aria-hidden
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </span>
            </span>
            <span className="min-w-0 max-w-[9.5rem] text-left sm:max-w-none">
              <span className="block truncate text-sm font-bold leading-tight text-white sm:text-base">
                Ask a question
              </span>
              <span className="block truncate text-[11px] font-medium leading-tight text-emerald sm:text-xs">
                Quotes · help · contact
              </span>
            </span>
          </>
        )}
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="fixed bottom-24 left-3 right-3 z-50 flex max-h-[min(70dvh,32rem)] min-w-0 max-w-full touch-pan-y flex-col overflow-hidden overscroll-x-none rounded-2xl border border-white/15 bg-navy-dark shadow-2xl sm:bottom-28 sm:left-auto sm:right-8 sm:w-[24rem] sm:max-w-[min(24rem,calc(100%-4rem))]"
        >
          <div className="flex min-w-0 items-start justify-between gap-3 border-b border-white/10 bg-navy px-4 py-3">
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
                <p className="truncate text-sm font-bold text-white">Ask a question</p>
                <p className="truncate text-xs text-white/55">Quotes · help · contact</p>
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

          <div
            ref={listRef}
            className="max-h-[45vh] min-w-0 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain overscroll-x-none px-3 py-3 touch-pan-y"
          >
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[92%] break-words [overflow-wrap:anywhere] ${
                  message.role === "user" ? "ml-auto" : "mr-auto"
                }`}
              >
                {message.quoteCard ? (
                  <QuotePriceCard card={message.quoteCard} note={message.text} />
                ) : (
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "bg-emerald text-navy"
                        : "bg-white/10 text-white/90"
                    }`}
                  >
                    {message.text}
                  </div>
                )}
              </div>
            ))}

            {isWorking ? (
              <div
                className="mr-auto flex max-w-[92%] items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/70"
                aria-live="polite"
              >
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald [animation-delay:240ms]" />
                </span>
                Working on your answer…
              </div>
            ) : null}

            {/* Desktop only: QR to scan and save. Mobile opens /contact/ instead. */}
            {showContactOffer && !isWorking && isMobile === false ? (
              <div
                ref={contactOfferRef}
                className="min-w-0 rounded-2xl border border-emerald/35 bg-emerald/10 px-3 py-3"
              >
                <p className="text-sm font-semibold text-white">Would you like to save to contacts?</p>
                <p className="mt-1 text-xs text-white/65">
                  Scan and save — point your phone camera at the QR code to open our contact card (includes our logo).
                </p>

                <div className="mt-3 flex flex-col items-center">
                  <div className="rounded-xl bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc}
                      alt={`Scan and save QR code for ${contactCardUrl()}`}
                      width={180}
                      height={180}
                      className="h-40 w-40 max-w-full"
                    />
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold text-emerald">Scan and save</p>
                  <p className="mt-0.5 text-center text-[11px] text-white/50">Scan · Quote · Book</p>
                  <Link
                    href="/contact/"
                    className="mt-2 text-xs font-semibold text-emerald hover:text-emerald-light"
                  >
                    Open contact card
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={() => setShowContactOffer(false)}
                  className="mt-3 text-xs text-white/45 hover:text-white/70"
                >
                  Hide for now
                </button>
              </div>
            ) : null}

            {showAddressPicker && !isWorking ? (
              <div className="min-w-0 rounded-2xl border border-emerald/35 bg-emerald/10 px-3 py-2.5">
                <p className="text-sm font-semibold text-white">{addressLabel}</p>
                <p className="mt-1 text-xs text-white/65">
                  Type your full address with door number, street, and town or BT postcode — I’ll
                  only quote once it’s complete. Town-only answers are not accepted.
                </p>
              </div>
            ) : null}
          </div>

          {quickReplies.length > 0 && !isWorking && !showAddressPicker ? (
            <div className="flex min-w-0 flex-wrap gap-2 border-t border-white/10 px-3 py-2">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendText(reply)}
                  className="max-w-full break-words rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald transition-colors hover:bg-emerald/20"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}

          {showAddressPicker ? (
            <form
              className="min-w-0 border-t border-white/10 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                confirmAddress();
              }}
            >
              <AddressInput
                id="bot-quote-address"
                name="bot-quote-address"
                value={addressValue}
                onChange={setAddressValue}
                onSelectAddress={(address) => {
                  setAddressValue(address);
                  if (isPricableStreetAddress(address, draft.airportCode)) {
                    sendText(address);
                  }
                }}
                airportCode={draft.airportCode ?? ""}
                label={addressLabel}
                hideLabel
                placeholder="e.g. 12 High Street, Bangor, BT20"
                helperText="Include door number, street, and town or postcode before we quote"
                required={false}
                disableAutoScroll
                suggestionsPlacement="above"
              />
              <button
                type="submit"
                disabled={
                  isWorking || !isPricableStreetAddress(addressValue, draft.airportCode)
                }
                className="mt-2 w-full rounded-xl bg-emerald px-3 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
              >
                Use this address
              </button>
            </form>
          ) : (
            <form
              className="flex min-w-0 gap-2 border-t border-white/10 p-3"
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
                disabled={isWorking}
                className="shrink-0 rounded-xl bg-emerald px-3 py-2 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
              >
                Send
              </button>
            </form>
          )}
        </div>
      ) : null}
    </>
  );

  if (!mounted) return null;
  return createPortal(ui, document.body);
}
