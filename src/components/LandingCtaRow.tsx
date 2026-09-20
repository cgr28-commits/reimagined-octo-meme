import { LandingPageQuoteCta } from "@/components/LandingPageQuoteCta";
import { SITE } from "@/lib/data";

type Props = {
  quoteLabel?: string;
  whatsappMessage: string;
};

export default function LandingCtaRow({
  quoteLabel = "Get a Live Quote",
  whatsappMessage,
}: Props) {
  const whatsappHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(whatsappMessage)}`;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <LandingPageQuoteCta label={quoteLabel} />
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
