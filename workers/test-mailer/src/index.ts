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

type Env = {
  WEB3FORMS_ACCESS_KEY?: string;
  EMAIL?: EmailBinding;
};

type SendBody = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const FROM = "bookings@myairporttaxini.co.uk";
const BUSINESS = "My Airport Taxi NI";

async function sendViaCloudflareEmail(
  env: Env,
  body: SendBody,
): Promise<{ ok: boolean; detail: string }> {
  if (!env.EMAIL) return { ok: false, detail: "EMAIL binding missing" };
  try {
    const result = await env.EMAIL.send({
      to: body.to,
      from: { email: FROM, name: BUSINESS },
      replyTo: { email: FROM, name: BUSINESS },
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    return { ok: true, detail: `messageId=${result.messageId ?? "ok"}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function sendViaFormSubmit(body: SendBody): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(body.to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: body.subject,
      _captcha: "false",
      _template: "box",
      name: BUSINESS,
      message: body.html || body.text,
      _replyto: FROM,
    }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, detail: `formsubmit non-json ${response.status}: ${text.slice(0, 120)}` };
  }
  try {
    const payload = JSON.parse(text) as { success?: unknown };
    const ok = response.ok && (payload.success === "true" || payload.success === true);
    return { ok, detail: text.slice(0, 200) };
  } catch {
    return { ok: false, detail: text.slice(0, 200) };
  }
}

async function sendViaWeb3Forms(
  env: Env,
  body: SendBody,
): Promise<{ ok: boolean; detail: string }> {
  const accessKey = env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) return { ok: false, detail: "no WEB3FORMS_ACCESS_KEY" };
  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: accessKey,
      subject: `[Paid booking copy] ${body.subject}`,
      name: body.to,
      from_name: BUSINESS,
      message: body.text,
      email: body.to,
      autoresponse: { subject: body.subject, message: body.html },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: unknown;
    message?: string;
  } | null;
  return {
    ok: response.ok && payload?.success === true,
    detail: JSON.stringify(payload ?? { status: response.status }).slice(0, 200),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") {
      return new Response(
        `matni-test-mailer ok — EMAIL=${Boolean(env.EMAIL)} WEB3=${Boolean(env.WEB3FORMS_ACCESS_KEY?.trim())}`,
      );
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = (await request.json()) as SendBody;
    if (!body.to || !body.subject || (!body.text && !body.html)) {
      return Response.json({ ok: false, error: "Missing to/subject/text|html" }, { status: 400 });
    }

    const attempts: Array<{ provider: string; ok: boolean; detail: string }> = [];
    for (const [provider, run] of [
      ["cloudflare-email", () => sendViaCloudflareEmail(env, body)],
      ["formsubmit", () => sendViaFormSubmit(body)],
      ["web3forms", () => sendViaWeb3Forms(env, body)],
    ] as const) {
      const result = await run();
      attempts.push({ provider, ...result });
      if (result.ok) {
        return Response.json({ ok: true, via: provider, attempts });
      }
    }

    return Response.json({ ok: false, attempts }, { status: 502 });
  },
};
