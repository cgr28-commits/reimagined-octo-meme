import Script from "next/script";

const RETELL_WIDGET_SRC = "https://dashboard.retellai.com/retell-widget-v2.js";

/**
 * Retell's public website widget exposes voice calls on the site.
 * These are public widget credentials, not a Retell API secret.
 */
export default function RetellVoiceWidget() {
  const publicKey = process.env.NEXT_PUBLIC_RETELL_VOICE_PUBLIC_KEY?.trim();
  const agentId = process.env.NEXT_PUBLIC_RETELL_VOICE_AGENT_ID?.trim();

  if (!publicKey || !agentId) return null;

  return (
    <Script
      id="retell-widget"
      src={RETELL_WIDGET_SRC}
      type="module"
      strategy="afterInteractive"
      data-voice-public-key={publicKey}
      data-voice-agent-id={agentId}
      data-title="My Airport Taxi NI"
      data-theme-color="#071C38"
      data-component-color="#2FBF4A"
      data-fab-text="Get a taxi price"
      data-show-ai-popup="false"
    />
  );
}
