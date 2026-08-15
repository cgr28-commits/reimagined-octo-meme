"use client";

import { useState } from "react";
import { FAQS, SERVICE_FLAGS } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = FAQS.filter((faq) => {
    if (!SERVICE_FLAGS.chauffeur && /chauffeur/i.test(faq.question)) {
      return false;
    }
    if (!SERVICE_FLAGS.dayTrips && /day trip/i.test(faq.question)) {
      return false;
    }
    return true;
  });

  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Help Centre"
          title="Frequently Asked Questions"
          description="Everything you need to know about booking your airport transfer."
        />

        <div className="mt-14 divide-y divide-white/10 border-y border-white/10">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left sm:py-6"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-white sm:text-base">
                    {faq.question}
                  </span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-transform ${
                      isOpen
                        ? "rotate-180 border-emerald/40 text-emerald"
                        : "border-white/15 text-white/50"
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                <div className={`faq-answer ${isOpen ? "open" : ""}`}>
                  <div>
                    <p className="pb-5 text-sm leading-relaxed text-white/60 sm:pb-6">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
