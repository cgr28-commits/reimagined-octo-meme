import QuoteNavLink from "@/components/QuoteNavLink";
import { SITE } from "@/lib/data";

type Props = {
  quoteLabel: string;
  whatsappMessage: string;
};

export default function LandingCtaRow({ quoteLabel, whatsappMessage }: Props) {
  const whatsappHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(whatsappMessage)}`;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <QuoteNavLink
        href="#quote"
        className="inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
      >
        {quoteLabel}
      </QuoteNavLink>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-emerald/40 hover:text-emerald"
      >
        WhatsApp @{SITE.whatsappUsername}
      </a>
    </div>
  );
}
