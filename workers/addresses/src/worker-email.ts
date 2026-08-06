import {
  BUSINESS_MAILBOX,
  BUSINESS_NAME,
  businessMailbox,
  isBusinessMailbox,
} from "../shared/business-email";

type EmailBinding = {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | { email: string; name?: string };
  }): Promise<{ messageId?: string }>;
};

export type WorkerEmailEnv = {
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  EMAIL?: EmailBinding;
};

export type EmailPayload = {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  toName?: string;
  /** When true, do not fall back to plain-text-only providers for customer emails. */
  requireHtml?: boolean;
};

export type EmailSendResult = {
  sent: boolean;
  error?: string;
  /** Provider labels tried when send failed (for diagnostics). */
  providersTried?: string[];
};

/** @deprecated Use BUSINESS_MAILBOX — kept for existing imports. */
const DEFAULT_BOOKING_EMAIL = BUSINESS_MAILBOX;
const WORKER_PUBLIC_HOST = "reimagined-octo-meme.cgr28.workers.dev";

async function sendViaCloudflareEmail(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }

  const fromEmail = businessMailbox(env.BOOKING_FROM_EMAIL);

  await env.EMAIL.send({
    to: options.to,
    from: { email: fromEmail, name: BUSINESS_NAME },
    replyTo: { email: fromEmail, name: BUSINESS_NAME },
    subject: options.subject,
    text: options.body,
    ...(options.htmlBody ? { html: options.htmlBody } : {}),
  });
}

async function sendViaWeb3Forms(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  const accessKey = env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) {
    throw new Error("Web3Forms is not configured");
  }

  const ownerEmail = businessMailbox(env.BOOKING_TO_EMAIL);
  const sendAutoresponse = !isBusinessMailbox(options.to);

  const payload: Record<string, unknown> = {
    access_key: accessKey,
    subject: sendAutoresponse ? `[Paid booking copy] ${options.subject}` : options.subject,
    name: options.toName ?? BUSINESS_NAME,
    from_name: BUSINESS_NAME,
    replyto: BUSINESS_MAILBOX,
    message: options.body,
  };

  if (sendAutoresponse) {
    payload.email = options.to;
    const autoresponseMessage = options.htmlBody?.trim() || options.body;
    payload.autoresponse = {
      subject: options.subject,
      message: autoresponseMessage,
    };
  }

  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as {
    success?: unknown;
    message?: string;
  } | null;
  if (!response.ok || body?.success !== true) {
    throw new Error(body?.message ? `Web3Forms: ${body.message}` : "Web3Forms request failed");
  }
}

async function sendViaFormSubmit(options: EmailPayload): Promise<void> {
  const html = options.htmlBody?.trim();
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(options.to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: options.subject,
      _captcha: "false",
      _template: "box",
      name: BUSINESS_NAME,
      message: html || options.body,
      _replyto: BUSINESS_MAILBOX,
    }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("FormSubmit returned an unexpected response");
  }

  const payload = (await response.json().catch(() => null)) as { success?: unknown } | null;
  if (!response.ok || (payload?.success !== "true" && payload?.success !== true)) {
    throw new Error("FormSubmit request failed");
  }
}

async function sendViaMailChannels(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  const fromEmail = businessMailbox(env.BOOKING_FROM_EMAIL);

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Worker": WORKER_PUBLIC_HOST,
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: options.to, name: options.toName ?? options.to }],
        },
      ],
      from: {
        email: fromEmail,
        name: BUSINESS_NAME,
      },
      reply_to: {
        email: fromEmail,
        name: BUSINESS_NAME,
      },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.body },
        ...(options.htmlBody ? [{ type: "text/html", value: options.htmlBody }] : []),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("MailChannels request failed");
  }
}

export async function trySendEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  const providers: Array<{ label: string; run: () => Promise<void> }> = [];
  const wantsHtml = Boolean(options.htmlBody?.trim());
  const ownerEmail = businessMailbox(env.BOOKING_TO_EMAIL);
  const isCustomerEmail = !isBusinessMailbox(options.to);
  const skipPlainTextFallback = Boolean(options.requireHtml && wantsHtml && isCustomerEmail);

  if (env.EMAIL) {
    providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
  }

  if (wantsHtml) {
    providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });
  }

  if (!skipPlainTextFallback && env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
  } else if (wantsHtml && isCustomerEmail && env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({
      label: "web3forms-html-autoresponse",
      run: () => sendViaWeb3Forms(env, { ...options, body: options.htmlBody!.trim() }),
    });
  }

  if (!wantsHtml) {
    providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });
  }

  let lastError: unknown = null;
  const providersTried: string[] = [];

  for (const provider of providers) {
    providersTried.push(provider.label);
    try {
      await provider.run();
      return { sent: true };
    } catch (error) {
      lastError = error;
      console.error(`Email via ${provider.label} failed`, error);
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : "All email providers failed";
  return { sent: false, error: `${detail} (tried: ${providersTried.join(", ")})`, providersTried };
}

/** Sends a branded HTML email to a customer — never falls back to plain-text-only delivery. */
export async function trySendBrandedCustomerEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  if (!options.htmlBody?.trim()) {
    return { sent: false, error: "Missing HTML email body" };
  }

  return trySendEmail(env, { ...options, requireHtml: true });
}

export async function sendEmail(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  const result = await trySendEmail(env, options);
  if (!result.sent) {
    throw new Error(result.error ?? "All email providers failed");
  }
}

export { BUSINESS_NAME, DEFAULT_BOOKING_EMAIL, BUSINESS_MAILBOX, businessMailbox, isBusinessMailbox };
