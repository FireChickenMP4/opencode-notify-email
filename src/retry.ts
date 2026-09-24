/**
 * Delivery with retry.
 *
 * A notification exists so you learn about something while away; a transient
 * SMTP failure must not drop it silently. Retried a couple of times, and the
 * caller records undelivered messages to a file when it still fails.
 *
 * The sleep is injected so the schedule is testable without real waiting.
 */

import { sendEmail } from "./mail";

export type DeliveryOutcome = { ok: boolean; attempts: number; error?: string };

export const DEFAULT_DELAYS = [1000, 3000];

export async function deliverWithRetry(
  send: () => Promise<void>,
  sleep: (ms: number) => Promise<void>,
  delays: number[] = DEFAULT_DELAYS,
): Promise<DeliveryOutcome> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
    try {
      await send();
      return { ok: true, attempts: attempt };
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
      if (attempt <= delays.length) await sleep(delays[attempt - 1]!);
    }
  }
  return { ok: false, attempts: delays.length + 1, error: lastError };
}

/** Convenience: deliver an email through the retry wrapper. */
export function sendWithRetry(subject: string, body: string): Promise<DeliveryOutcome> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return deliverWithRetry(() => sendEmail(subject, body).then(() => {}), sleep);
}
