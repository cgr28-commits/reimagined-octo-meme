/**
 * Runs WhatsApp webhook work in a Durable Object alarm (10 Nov 2026).
 *
 * The webhook used to do its work in ctx.waitUntil(), which Cloudflare cuts off 30 seconds after
 * the response. That forced the assistant to answer in a hurry. An alarm can run for minutes, so
 * the assistant can take its time to think. One object per customer number also means a
 * customer's messages are answered one at a time, in the order they were sent.
 */

import { processWhatsAppWebhook, type WhatsAppEnv } from "./whatsapp-handlers";

const JOB_PREFIX = "job:";

export class WhatsAppReplyRunner implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: WhatsAppEnv,
  ) {}

  /** POST /enqueue with the webhook payload: stored, then run by the alarm straight away. */
  async fetch(request: Request): Promise<Response> {
    const payload = await request.text();
    const key = `${JOB_PREFIX}${Date.now().toString().padStart(15, "0")}:${crypto.randomUUID()}`;
    await this.ctx.storage.put(key, payload);
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now());
    return new Response("queued", { status: 202 });
  }

  async alarm(): Promise<void> {
    // Oldest first; jobs that arrive while this runs are picked up by the next loop.
    for (;;) {
      const jobs = await this.ctx.storage.list<string>({ prefix: JOB_PREFIX, limit: 20 });
      if (jobs.size === 0) return;
      for (const [key, raw] of jobs) {
        // Removed first: a job is never run twice (message ids are deduped as well).
        await this.ctx.storage.delete(key);
        try {
          await processWhatsAppWebhook(JSON.parse(raw), this.env);
        } catch (err) {
          console.error(
            JSON.stringify({ event: "whatsapp_runner_error", error: err instanceof Error ? err.message : String(err) }),
          );
        }
      }
    }
  }
}
