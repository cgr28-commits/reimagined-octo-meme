import Script from "next/script";

const RETELL_WIDGET_SRC = "https://dashboard.retellai.com/retell-widget-embed.js";

/**
 * Optional browser voice assistant on the contact page.
 *
 * Retell public credentials are intentionally public and are only emitted when
 * configured as GitHub Actions repository variables at build time. The Retell
 * API secret must never be placed in a NEXT_PUBLIC_ variable or the site.
 */
export default function RetellVoiceSection() {
  const publicKey = process.env.NEXT_PUBLIC_RETELL_VOICE_PUBLIC_KEY?.trim();
  const agentId = process.env.NEXT_PUBLIC_RETELL_VOICE_AGENT_ID?.trim();

  if (!publicKey || !agentId) return null;

  return (
    <section
      aria-labelledby="retell-voice-heading"
      className="mx-auto w-full max-w-5xl px-4 pb-12 pt-8 sm:px-6 lg:px-8"
    >
      <div className="rounded-3xl border border-white/10 bg-[#071C38] p-5 text-white shadow-xl sm:p-8">
        <div className="mx-auto mb-5 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2FBF4A]">
            Speak with us
          </p>
          <h2
            id="retell-voice-heading"
            className="mt-2 text-2xl font-semibold sm:text-3xl"
          >
            Get a taxi price by voice
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/75 sm:text-base">
            Tell our assistant your pickup, destination, travel date and time,
            passengers and luggage. It will check the live fare calculator.
          </p>
        </div>

        <div
          data-retell-widget="true"
          data-voice-public-key={publicKey}
          data-voice-agent-id={agentId}
          data-title="My Airport Taxi NI"
          data-theme-color="#071C38"
          data-component-color="#2FBF4A"
          className="mx-auto h-[560px] w-full max-w-[460px] overflow-hidden rounded-2xl bg-[#071C38]"
        />

        <p className="mx-auto mt-4 max-w-xl text-center text-xs leading-5 text-white/60">
          Please do not share payment card details in the voice conversation.
        </p>
      </div>

      <Script
        id="retell-widget-embed"
        src={RETELL_WIDGET_SRC}
        strategy="afterInteractive"
      />
    </section>
  );
}
