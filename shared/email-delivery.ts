export type FormSubmitEmailOptions = {
  to: string;
  subject: string;
  htmlBody?: string;
  textBody: string;
  fromName?: string;
};

export async function sendViaFormSubmitEmail(
  options: FormSubmitEmailOptions,
): Promise<boolean> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(options.to)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: options.subject,
      _captcha: "false",
      _template: "box",
      name: options.fromName ?? options.to,
      message: options.htmlBody?.trim() || options.textBody,
    }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  const payload = (await response.json().catch(() => null)) as { success?: unknown } | null;
  return response.ok && (payload?.success === "true" || payload?.success === true);
}
