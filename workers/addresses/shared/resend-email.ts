/**
 * Resend email delivery via the public HTTPS API.
 * Works in Cloudflare Workers and Node (Next.js API routes).
 * Never call this from browser code — keep RESEND_API_KEY server-side only.
 */

export type ResendSendOptions = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
};

export type ResendSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
};

export async function sendViaResend(options: ResendSendOptions): Promise<ResendSendResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const to = Array.isArray(options.to) ? options.to : [options.to];
  const replyTo = options.replyTo
    ? Array.isArray(options.replyTo)
      ? options.replyTo
      : [options.replyTo]
    : undefined;

  const body: Record<string, unknown> = {
    from: options.from,
    to,
    subject: options.subject,
    text: options.text,
  };

  if (options.html?.trim()) {
    body.html = options.html;
  }
  if (replyTo?.length) {
    body.reply_to = replyTo;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error";
    return { ok: false, error: `Resend request failed: ${detail}` };
  }

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    message?: string;
    name?: string;
  } | null;

  if (!response.ok) {
    const detail =
      payload?.message ||
      payload?.name ||
      `Resend HTTP ${response.status}`;
    console.error("Resend send failed", response.status, detail);
    return { ok: false, status: response.status, error: detail };
  }

  return { ok: true, id: payload?.id, status: response.status };
}
