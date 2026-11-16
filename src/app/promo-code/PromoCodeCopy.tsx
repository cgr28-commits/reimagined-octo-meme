"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { normalizePromoCode } from "../../../shared/promo-code";

export default function PromoCodeCopy() {
  const params = useSearchParams();
  const code = normalizePromoCode(params.get("code") ?? "");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // Keep the code for this visit, so "Book now" and the checkout field are pre-filled.
  useEffect(() => {
    if (!code) return;
    try {
      window.sessionStorage.setItem("matni-promo-code", code);
    } catch {
      // private browsing: the Book now link still carries the code
    }
  }, [code]);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Older browsers: select the text so a long-press / Ctrl+C copies it.
      const el = document.getElementById("promo-code-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setFailed(true);
    }
  }

  if (!code) {
    return (
      <section className="rounded-3xl bg-white p-6 text-[#071c38]">
        <h1 className="text-2xl font-extrabold">Discount code</h1>
        <p className="mt-2">This link doesn&apos;t contain a valid code. Please use the button in your email again.</p>
        <Link href="/#quote" className="btn-primary mt-5 w-full rounded-xl">Get a fixed price</Link>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-6 text-center text-[#071c38] shadow-xl" data-promo-copy-page>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a7f31]">My Airport Taxi NI</p>
      <h1 className="mt-2 text-2xl font-extrabold">Your discount code</h1>
      <p
        id="promo-code-text"
        className="mx-auto mt-5 inline-block select-all rounded-2xl border-2 border-dashed border-[#2fbf4a] bg-[#f2fbf4] px-6 py-4 font-mono text-[1.65rem] font-bold tracking-[0.12em]"
      >
        {code}
      </p>
      <button type="button" onClick={() => void copy()} className="btn-primary mt-5 w-full rounded-xl text-base" aria-live="polite">
        {copied ? "✓ Copied" : "Copy code"}
      </button>
      {failed ? <p className="mt-2 text-sm">The code is selected — press and hold (or Ctrl+C) to copy it.</p> : null}
      <Link
        href={`/?promo=${encodeURIComponent(code)}#quote`}
        className="mt-3 inline-flex min-h-[50px] w-full items-center justify-center rounded-xl border-2 border-[#071c38] px-5 text-base font-bold text-[#071c38]"
      >
        Book now — code added for you
      </Link>
      <p className="mt-4 text-xs leading-relaxed text-[#071c38]/70">
        At checkout, use the same email address your code was sent to. Airport charges are not discounted; minimum
        vehicle fare and excluded dates apply.
      </p>
    </section>
  );
}
