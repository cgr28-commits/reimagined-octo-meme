/**
 * Optional guidance panel for the Retell voice assistant.
 * The global widget is added by RetellVoiceWidget in the site layout.
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
        <div className="mx-auto max-w-2xl text-center">
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
            Tap <span className="font-semibold text-white">Get a taxi price</span>{" "}
            and tell our assistant your pickup, destination, travel date and time,
            passengers and luggage. It checks the live fare calculator.
          </p>
        </div>

        <p className="mx-auto mt-4 max-w-xl text-center text-xs leading-5 text-white/60">
          Please do not share payment card details in the voice conversation.
        </p>
      </div>
    </section>
  );
}
