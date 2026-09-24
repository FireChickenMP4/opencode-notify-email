/**
 * Email notifications for opencode. Two paths, same shape as the QQ plugin:
 *
 *   1. `notify_email` tool - the agent decides to send (long task done, a
 *      decision is needed, user stepped out).
 *   2. Idle auto-push - when a turn finishes AND the switch is ON.
 *
 * Why email alongside QQ: QQ is the phone/remote channel; on the desktop it
 * doubles up with the Windows toast. Email is the quiet, archivable channel.
 *
 * The switch is read FRESH on every event, so `notify-email on|off` (or editing
 * the JSON) takes effect without a restart.
 *
 * Setup: SMTP + recipient in ~/.config/opencode/notify-email.json (see README).
 */

import { tool, type Plugin } from "@opencode-ai/plugin";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Client sources live in a sibling module. opencode treats EVERY named export of
 * a plugins/*.ts file as a plugin function and calls it with no arguments, so
 * this file must export only NotifyEmailPlugin. Both layouts are tried: repo
 * (`../src`) and installed (`./notify-email/`).
 */
const client = await (async () => {
  for (const p of ["./notify-email/client.ts", "../src/client.ts"]) {
    try {
      return (await import(p)) as typeof import("../src/client.ts");
    } catch {
      continue;
    }
  }
  throw new Error("notify-email: cannot locate client.ts");
})();

/** File log for the event path; opencode's own log does not record dispatch. */
function trace(line: string): void {
  if (process.env.OPENCODE_NOTIFY_EMAIL_LOG === "0") return;
  try {
    appendFileSync(join(HERE, "notify-email.events.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* diagnostics must never break anything */
  }
}

export const NotifyEmailPlugin: Plugin = async ({ client: oc }) => {
  await oc.app
    .log({ body: { service: "notify-email", level: "info", message: "notify_email tool registered" } })
    .catch(() => {});

  /** Send with a couple of retries; a lost notification is the thing we prevent. */
  async function trySend(subject: string, body: string): Promise<string> {
    const sent = await client.sendWithRetry(subject, body);
    if (sent.ok) {
      trace(`sent: ${subject}`);
      return "sent by email";
    }
    trace(`send FAILED after ${sent.attempts}: ${sent.error}`);
    try {
      appendFileSync(
        join(HERE, "notify-email.undelivered.log"),
        `${new Date().toISOString()} [${subject}] ${body}\n`,
        "utf8",
      );
    } catch {
      /* best effort */
    }
    return `failed after ${sent.attempts} attempts: ${sent.error}`;
  }

  const DEDUP_MS = Number(process.env.OPENCODE_NOTIFY_EMAIL_DEDUP_MS ?? 5000);
  const lastSent = new Map<string, number>();
  function shouldSend(kind: string): boolean {
    const now = Date.now();
    if (now - (lastSent.get(kind) ?? 0) < DEDUP_MS) return false;
    lastSent.set(kind, now);
    return true;
  }

  return {
    event: async ({ event }) => {
      if (event.type !== "session.status") return;
      const props = (event as { properties?: { sessionID?: string; status?: { type?: string } } }).properties;
      if (props?.status?.type !== "idle") return;
      if (!client.awayEnabled()) return;
      if (!shouldSend("idle")) return;

      const summary = props.sessionID ? await client.lastAssistantText(oc, props.sessionID) : "";
      const body = summary || "(turn finished)";
      await trySend("opencode · 完成", body);
    },

    tool: {
      notify_email: tool({
        description:
          "Send a short email to the user. Use when the user is away or asked to be notified " +
          "(long task finished, a decision is needed). Returns the send result.",
        args: {
          subject: tool.schema.string().describe("short subject line"),
          message: tool.schema.string().describe("message body"),
        },
        async execute(args) {
          return trySend(args.subject, args.message);
        },
      }),

      email_switch: tool({
        description:
          "Read or change whether opencode emails you while you are away (turn finished). " +
          "status=true reports; otherwise set enabled.",
        args: {
          enabled: tool.schema.boolean().optional().describe("new state for away auto-push"),
          status: tool.schema.boolean().optional().describe("report the current state instead of changing it"),
        },
        async execute(args) {
          try {
            if (args.status) {
              return `away auto-push: ${client.awayEnabled() ? "ON" : "OFF"} | config: ${client.configPath()}`;
            }
            if (typeof args.enabled === "boolean") {
              const now = client.setAwayNotify(args.enabled);
              return `away auto-push is now ${now ? "ON" : "OFF"} (takes effect immediately)`;
            }
            return "nothing to do: pass status=true or enabled=<bool>";
          } catch (cause) {
            return `failed: ${cause instanceof Error ? cause.message : String(cause)}`;
          }
        },
      }),
    },
  };
};
