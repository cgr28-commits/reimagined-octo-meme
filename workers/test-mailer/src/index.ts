/**
 * One-shot Cloudflare Worker used by CI to deliver test emails from an
 * edge IP (FormSubmit / MailChannels / Web3Forms work here; GitHub runner IPs do not).
 */
type Env = {
  WEB3FORMS_ACCESS_KEY?: string;
};

type SendBody = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaFormSubmit(body: SendBody): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(body.to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: body.subject,
      _captcha: "false",
      _template: "box",
      name: "My Airport Taxi NI",
      message: body.html || body.text,
      _replyto: "bookings@myairporttaxini.co.uk",
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

async function sendViaMailChannels(body: SendBody): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Worker": "matni-test-mailer",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: body.to }] }],
      from: { email: "bookings@myairporttaxini.co.uk", name: "My Airport Taxi NI" },
      reply_to: { email: "bookings@myairporttaxini.co.uk", name: "My Airport Taxi NI" },
      subject: body.subject,
      content: [
        { type: "text/plain", value: body.text },
        { type: "text/html", value: body.html },
      ],
    }),
  });
  const text = await response.text();
  return { ok: response.ok, detail: `${response.status} ${text.slice(0, 200)}` };
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
      from_name: "My Airport Taxi NI",
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
      return new Response("matni-test-mailer ok — POST JSON {to,subject,text,html}");
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
      ["formsubmit", () => sendViaFormSubmit(body)],
      ["mailchannels", () => sendViaMailChannels(body)],
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
