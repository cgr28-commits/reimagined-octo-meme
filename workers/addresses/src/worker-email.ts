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
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
const BUSINESS_NAME = "My Airport Taxi NI";
const WORKER_PUBLIC_HOST = "reimagined-octo-meme.cgr28.workers.dev";

async function sendViaCloudflareEmail(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }

  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

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

  const ownerEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const sendAutoresponse = options.to.toLowerCase() !== ownerEmail.toLowerCase();

  const payload: Record<string, unknown> = {
    access_key: accessKey,
    // Always include email — Web3Forms treats submissions without it as incomplete.
    email: options.to,
    subject: sendAutoresponse ? `[Paid booking copy] ${options.subject}` : options.subject,
    name: options.toName ?? options.to,
    from_name: options.toName ?? BUSINESS_NAME,
    message: options.body,
  };

  if (sendAutoresponse) {
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

  const body = (await response.json().catch(() => null)) as { success?: unknown } | null;
  if (!response.ok || body?.success !== true) {
    throw new Error("Web3Forms request failed");
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
      _template: html ? "box" : "box",
      name: options.toName ?? BUSINESS_NAME,
      message: html || options.body,
      ...(html ? { _replyto: DEFAULT_BOOKING_EMAIL } : {}),
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
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;

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
  const ownerEmail = env.BOOKING_TO_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const isCustomerEmail = options.to.toLowerCase() !== ownerEmail.toLowerCase();
  const skipPlainTextFallback = Boolean(options.requireHtml && wantsHtml && isCustomerEmail);

  // Prefer FormSubmit first — Web3Forms from the shared worker IP has been
  // returning 403 / silent non-delivery. Cloudflare Email binding is skipped
  // (domain not verified yet).
  providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });

  if (!skipPlainTextFallback && env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
  } else if (wantsHtml && isCustomerEmail && env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({
      label: "web3forms-html-autoresponse",
      run: () => sendViaWeb3Forms(env, { ...options, body: options.htmlBody!.trim() }),
    });
  }

  providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options) });

  let lastError: unknown = null;

  for (const provider of providers) {
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
  return { sent: false, error: detail };
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

export { BUSINESS_NAME, DEFAULT_BOOKING_EMAIL };
