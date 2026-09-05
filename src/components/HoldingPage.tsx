import Logo from "./Logo";
import { SITE, SITE_OFFLINE } from "@/lib/data";
import { formatUkInstant } from "@/lib/format-datetime";

function formatReturnLabel(untilIso: string): string {
  try {
    return formatUkInstant(untilIso, { withZoneLabel: true, includeYear: false, includeWeekday: true });
  } catch {
    return "soon";
  }
}

const WHATSAPP_HREF = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
  "Hi, I need help while the website is offline.",
)}`;

export default function HoldingPage() {
  const returnLabel = formatReturnLabel(SITE_OFFLINE.until);

  return (
    <main className="holding-page relative flex min-h-[100dvh] flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(47,191,74,0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, rgba(12,42,82,0.9), transparent 50%), linear-gradient(165deg, #041020 0%, #071c38 45%, #0c2a52 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16 text-center sm:px-8">
        <div className="holding-fade-up mx-auto mb-10">
          <Logo className="mx-auto h-20 sm:h-24" theme="dark" />
        </div>

        <p className="holding-fade-up holding-fade-up-delay-1 text-sm font-semibold uppercase tracking-[0.2em] text-emerald">
          Temporarily offline
        </p>

        <h1 className="holding-fade-up holding-fade-up-delay-1 mt-3 font-sans text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {SITE.name}
        </h1>

        <p className="holding-fade-up holding-fade-up-delay-2 mx-auto mt-5 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
          {SITE_OFFLINE.message} Expected back by{" "}
          <span className="font-semibold text-white">{returnLabel}</span>.
        </p>

        <p className="holding-fade-up holding-fade-up-delay-2 mx-auto mt-3 max-w-md text-sm text-white/60">
          Need a transfer in the meantime? WhatsApp us and we&apos;ll help
          directly.
        </p>

        <div className="holding-fade-up holding-fade-up-delay-3 mt-10 flex flex-col items-stretch gap-3 sm:mx-auto sm:max-w-sm">
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald px-5 py-3.5 text-base font-bold text-navy-dark transition hover:bg-emerald-light"
          >
            WhatsApp @{SITE.whatsappUsername}
          </a>
          <a
            href={`mailto:${SITE.email}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white/70 transition hover:text-white"
          >
            {SITE.email}
          </a>
        </div>
      </div>
    </main>
  );
}
