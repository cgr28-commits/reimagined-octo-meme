"use client";

import { useEffect, useRef, useState } from "react";
import { SITE } from "@/lib/data";
import {
  createWelcomeMessages,
  respondToAssistantMessage,
  type AssistantMessage,
} from "@/lib/quote-assistant";

type Draft = {
  airportCode?: string;
  direction?: "to-airport" | "from-airport";
  address?: string;
  passengers?: number;
  suitcases?: number;
};

export default function QuoteAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>(() => createWelcomeMessages());
  const [quickReplies, setQuickReplies] = useState<string[]>([
    "Get a quote",
    "Cancellation policy",
    "WhatsApp",
  ]);
  const [draft, setDraft] = useState<Draft>({});
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text) return;

    if (/^whatsapp$/i.test(text)) {
      window.open(
        `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(SITE.whatsappDefaultMessage)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
    if (/^book online$/i.test(text)) {
      window.location.href = "/#quote";
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    const result = respondToAssistantMessage(text, draft);
    setDraft(result.draft);
    setQuickReplies(result.quickReplies ?? []);
    setMessages((prev) => [...prev, { role: "bot", text: result.reply }]);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald text-navy shadow-lg shadow-emerald/30 transition-all hover:bg-emerald-light sm:bottom-8 sm:left-8 sm:h-16 sm:w-16"
        aria-label={open ? "Close quote assistant" : "Open quote assistant"}
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h8M8 14h5M21 12c0 4.97-4.03 9-9 9a9.77 9.77 0 01-4.2-.93L3 21l1.05-4.2A8.96 8.96 0 013 12c0-4.97 4.03-9 9-9s9 4.03 9 9z"
            />
          </svg>
        )}
      </button>

      {open ? (
        <div className="fixed bottom-24 left-4 z-50 flex w-[min(100vw-2rem,22rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-navy-dark shadow-2xl sm:bottom-28 sm:left-8">
          <div className="border-b border-white/10 bg-navy px-4 py-3">
            <p className="text-sm font-bold text-white">Quote assistant</p>
            <p className="text-xs text-white/55">Ask questions · get a fixed journey price</p>
          </div>

          <div ref={listRef} className="max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
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
              placeholder="Ask for a quote or question…"
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
