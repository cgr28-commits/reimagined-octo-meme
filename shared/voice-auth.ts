/**
 * Authenticate inbound fonio → Worker HTTP requests.
 *
 * Fonio's official HTTP Request / Inbound Webhook integrations let you set request
 * headers in the assistant dashboard (docs: fonio.info/en/developers/http-request).
 * Configure either:
 *   Authorization: Bearer <VOICE_WEBHOOK_SECRET>
 * or the legacy header used by /voice/call-ended:
 *   X-Voice-Secret: <VOICE_WEBHOOK_SECRET>
 *
 * This is OUR shared secret that fonio sends to us — not a fonio account API key.
 * Keep the value in Cloudflare Worker secrets only; never NEXT_PUBLIC_*.
 */

export type VoiceAuthEnv = {
  VOICE_WEBHOOK_SECRET?: string;
};

/** Constant-time-ish compare for short secrets (avoids trivial early-exit leaks). */
export function voiceSecretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Extract the shared secret from Authorization Bearer or X-Voice-Secret. */
export function voiceRequestSecret(request: Request): string {
  const legacy = request.headers.get("X-Voice-Secret")?.trim() ?? "";
  if (legacy) return legacy;
  const auth = request.headers.get("Authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() ?? "";
}

/**
 * When VOICE_WEBHOOK_SECRET is set, reject unauthenticated voice traffic.
 * When unset (local / not yet configured), allow — production must set the secret
 * before pointing a live fonio assistant at these routes.
 */
export function voiceAuthDenied(request: Request, env: VoiceAuthEnv): Response | null {
  const expected = env.VOICE_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected) return null;
  const provided = voiceRequestSecret(request);
  if (provided && voiceSecretsEqual(provided, expected)) return null;
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
