import {
  customerTransactionBcc,
  resendCustomerPayload,
} from "../shared/owner-email-copy";

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
  BOOKING_NOTIFICATION_EMAIL?: string;
  /** Optional override for the hidden owner copy. Invalid values are ignored. */
  OWNER_EMAIL_COPY_ADDRESS?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  RESEND_API_KEY?: string;
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
  /**
   * Owner operational alerts (payment started / unsuccessful) must not rely on FormSubmit.
   * Prefer Cloudflare Email / Web3Forms / MailChannels only.
   */
  preferWorkerProviders?: boolean;
  /**
   * Branded customer emails (invoices, refunds, driver details) must never use FormSubmit.
   * FormSubmit often returns success for new recipient addresses without delivering the
   * booking confirmation (activation / spam / silent drop).
   */
  customerDelivery?: boolean;
  /**
   * Hidden BCC of this same message to the business mailbox.
   * On for customer booking and journey emails. Set false for driver-only
   * mail that still uses the branded HTML sender.
   */
  ownerCopy?: boolean;
};

export type EmailSendResult = {
  sent: boolean;
  error?: string;
  provider?: string;
  /** Resend message id when provider is resend and the API accepted the send. */
  resendId?: string;
  /** True when the accepted send included a hidden owner BCC. */
  ownerBcc?: boolean;
};

const DEFAULT_BOOKING_EMAIL = "bookings@myairporttaxini.co.uk";
const BUSINESS_NAME = "My Airport Taxi NI";
const WORKER_PUBLIC_HOST = "reimagined-octo-meme.cgr28.workers.dev";

function ownerCopyRequested(options: EmailPayload): boolean {
  return Boolean(options.customerDelivery) && options.ownerCopy !== false;
}

function ownerBccFor(env: WorkerEmailEnv, options: EmailPayload): string | null {
  if (!ownerCopyRequested(options)) return null;
  return customerTransactionBcc(env, options.to).bcc;
}

function warnIfOwnerCopyUnavailable(env: WorkerEmailEnv, options: EmailPayload): void {
  if (!ownerCopyRequested(options)) return;
  const copy = customerTransactionBcc(env, options.to);
  if (copy.warning) console.warn(copy.warning);
}

function warnIfOwnerCopyUnsupported(
  env: WorkerEmailEnv,
  options: EmailPayload,
  providerLabel: string,
): void {
  if (!ownerBccFor(env, options)) return;
  console.warn(
    `Owner BCC is not supported by ${providerLabel} — the customer email was still sent`,
  );
}

async function sendViaCloudflareEmail(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  if (!env.EMAIL) {
    throw new Error("Cloudflare Email Service is not configured");
  }

  warnIfOwnerCopyUnsupported(env, options, "Cloudflare Email");
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

async function sendViaResend(
  env: WorkerEmailEnv,
  options: EmailPayload,
  bcc: string | null,
): Promise<string | undefined> {
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("Resend is not configured");
  }

  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const html = options.htmlBody?.trim();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(
      resendCustomerPayload({
        from: `${BUSINESS_NAME} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.body,
        ...(html ? { html } : {}),
        replyTo: fromEmail,
        bcc,
      }),
    ),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null;

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object"
        ? String(payload.message ?? payload.name ?? response.status)
        : String(response.status);
    throw new Error(`Resend request failed: ${detail}`);
  }

  return typeof payload?.id === "string" && payload.id.trim() ? payload.id.trim() : undefined;
}

async function sendViaWeb3Forms(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  const accessKey = env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) {
    throw new Error("Web3Forms is not configured");
  }

  warnIfOwnerCopyUnsupported(env, options, "Web3Forms");
  const ownerEmail =
    env.BOOKING_NOTIFICATION_EMAIL?.trim() ||
    env.BOOKING_TO_EMAIL?.trim() ||
    DEFAULT_BOOKING_EMAIL;
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

async function sendViaMailChannels(
  env: WorkerEmailEnv,
  options: EmailPayload,
  attempt?: { ownerBcc: boolean },
): Promise<void> {
  const fromEmail = env.BOOKING_FROM_EMAIL?.trim() || DEFAULT_BOOKING_EMAIL;
  const bcc = ownerBccFor(env, options);

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
          ...(bcc ? { bcc: [{ email: bcc }] } : {}),
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
  if (attempt && bcc) attempt.ownerBcc = true;
}

async function sendCustomerResend(
  env: WorkerEmailEnv,
  options: EmailPayload,
  attempt: { ownerBcc: boolean },
): Promise<void> {
  const bcc = ownerBccFor(env, options);
  try {
    await sendViaResend(env, options, bcc);
    attempt.ownerBcc = Boolean(bcc);
  } catch (error) {
    if (!bcc) throw error;
    console.warn("Owner BCC was not accepted — sending the customer email without BCC");
    attempt.ownerBcc = false;
    await sendViaResend(env, options, null);
  }
}

function buildProviderChain(
  env: WorkerEmailEnv,
  options: EmailPayload,
  attempt: { ownerBcc: boolean },
): Array<{ label: string; run: () => Promise<void> }> {
  const providers: Array<{ label: string; run: () => Promise<void> }> = [];
  const wantsHtml = Boolean(options.htmlBody?.trim());
  const ownerEmail =
    env.BOOKING_NOTIFICATION_EMAIL?.trim() ||
    env.BOOKING_TO_EMAIL?.trim() ||
    DEFAULT_BOOKING_EMAIL;
  const isCustomerEmail = options.to.toLowerCase() !== ownerEmail.toLowerCase();
  const customerDelivery = Boolean(options.customerDelivery || (options.requireHtml && isCustomerEmail));
  const skipFormSubmit = Boolean(options.preferWorkerProviders || customerDelivery);

  // Customer branded invoices: never FormSubmit (false “success” / activation trap).
  if (customerDelivery) {
    if (env.RESEND_API_KEY?.trim()) {
      providers.push({
        label: "resend",
        run: async () => {
          await sendCustomerResend(env, options, attempt);
        },
      });
    }
    if (env.EMAIL) {
      providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
    }
    if (env.WEB3FORMS_ACCESS_KEY?.trim() && wantsHtml) {
      providers.push({
        label: "web3forms-html-autoresponse",
        run: () => sendViaWeb3Forms(env, { ...options, body: options.htmlBody!.trim() }),
      });
    } else if (env.WEB3FORMS_ACCESS_KEY?.trim()) {
      providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
    }
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options, attempt) });
    return providers;
  }

  if (skipFormSubmit) {
    if (env.RESEND_API_KEY?.trim()) {
      providers.push({
        label: "resend",
        run: async () => {
          await sendViaResend(env, options, null);
        },
      });
    }
    if (env.EMAIL) {
      providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
    }
    if (env.WEB3FORMS_ACCESS_KEY?.trim()) {
      providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
    }
    providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options, attempt) });
    return providers;
  }

  // Owner / general traffic: FormSubmit first (activated for bookings@ inbox),
  // then Cloudflare Email / Resend / Web3Forms / MailChannels.
  providers.push({ label: "formsubmit", run: () => sendViaFormSubmit(options) });

  if (env.EMAIL) {
    providers.push({ label: "cloudflare-email", run: () => sendViaCloudflareEmail(env, options) });
  }
  if (env.RESEND_API_KEY?.trim()) {
    providers.push({
      label: "resend",
      run: async () => {
        await sendViaResend(env, options, null);
      },
    });
  }
  if (env.WEB3FORMS_ACCESS_KEY?.trim()) {
    providers.push({ label: "web3forms", run: () => sendViaWeb3Forms(env, options) });
  }
  providers.push({ label: "mailchannels", run: () => sendViaMailChannels(env, options, attempt) });

  return providers;
}

export async function trySendEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  const resendAttempt = { ownerBcc: false };
  warnIfOwnerCopyUnavailable(env, options);
  const providers = buildProviderChain(env, options, resendAttempt);
  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      await provider.run();
      return {
        sent: true,
        provider: provider.label,
        ...(resendAttempt.ownerBcc ? { ownerBcc: true } : {}),
      };
    } catch (error) {
      lastError = error;
      console.error(`Email via ${provider.label} failed`, error);
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : "All email providers failed";
  return { sent: false, error: detail };
}

/**
 * Owner operational emails (payment started / paid / failed) — never FormSubmit.
 * Prefer Cloudflare Email / Web3Forms so paid confirmations actually reach bookings@.
 */
export async function trySendOwnerOperationalEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  return trySendEmail(env, { ...options, preferWorkerProviders: true });
}

/** Sends a branded HTML email to a customer — never FormSubmit. */
export async function trySendBrandedCustomerEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  if (!options.htmlBody?.trim()) {
    return { sent: false, error: "Missing HTML email body" };
  }

  return trySendEmail(env, {
    ...options,
    requireHtml: true,
    customerDelivery: true,
  });
}

/**
 * Resend only — same BOOKING_FROM_EMAIL / reply-to as booking emails.
 * Never falls back to Cloudflare Email, Web3Forms, FormSubmit, or MailChannels.
 */
export async function trySendResendOnlyEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  if (!env.RESEND_API_KEY?.trim()) {
    return { sent: false, error: "Resend is not configured (RESEND_API_KEY)" };
  }

  warnIfOwnerCopyUnavailable(env, options);

  try {
    const bcc = ownerBccFor(env, options);
    let resendId: string | undefined;
    let ownerBcc = false;
    try {
      resendId = await sendViaResend(env, options, bcc);
      ownerBcc = Boolean(bcc);
    } catch (error) {
      if (!bcc) throw error;
      console.warn("Owner BCC was not accepted — sending the customer email without BCC");
      resendId = await sendViaResend(env, options, null);
    }
    return {
      sent: true,
      provider: "resend",
      ...(resendId ? { resendId } : {}),
      ...(ownerBcc ? { ownerBcc: true } : {}),
    };
  } catch (error) {
    console.error("Resend-only email failed", error);
    return {
      sent: false,
      provider: "resend",
      error: error instanceof Error ? error.message : "Resend request failed",
    };
  }
}

/**
 * Google review request emails must go through Resend only.
 * Fallback providers (Web3Forms / MailChannels) can report success without
 * a trustworthy delivery signal — owner UI must only show Sent when Resend accepts.
 */
export async function trySendResendOnlyCustomerEmail(
  env: WorkerEmailEnv,
  options: EmailPayload,
): Promise<EmailSendResult> {
  if (!options.htmlBody?.trim()) {
    return { sent: false, error: "Missing HTML email body" };
  }

  return trySendResendOnlyEmail(env, {
    ...options,
    requireHtml: true,
    customerDelivery: true,
  });
}

export async function sendEmail(env: WorkerEmailEnv, options: EmailPayload): Promise<void> {
  const result = await trySendEmail(env, options);
  if (!result.sent) {
    throw new Error(result.error ?? "All email providers failed");
  }
}

export { BUSINESS_NAME, DEFAULT_BOOKING_EMAIL };
