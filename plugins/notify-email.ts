/**
 * Email notifications for opencode. Automatic paths, same shape as the QQ plugin:
 *
 *   1. `notify_email` tool - the agent decides to send (long task done, a
 *      decision is needed, user stepped out).
 *   2. Idle auto-push - when a turn finishes AND the switch is ON.
 *   3. Permission auto-push - when the agent is blocked on a permission
 *      request AND the switch is ON.
 *
 * Why email alongside QQ: QQ is the phone/remote channel; on the desktop it
 * doubles up with the Windows toast. Email is the quiet, archivable channel.
 *
 * The switch is read FRESH on every event, so `notify-email on|off` (or editing
 * the JSON) takes effect without a restart.
 *
 * Setup: SMTP + recipient in ~/.config/opencode/notify-email.json (see README).
 */

import type { Plugin } from "@opencode/plugin";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NotifyEvent } from "../src/events";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Client sources live in a sibling module. Both layouts are tried: repo
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

/** V2 plugin entrypoint. Returns a cleanup that stops the event subscription. */
async function setup(ctx: Plugin.Context): Promise<() => void> {
  console.log("[notify-email] notify_email tool registered");

  /** Full workspace path, home abbreviated to `~` (same as the QQ plugin). */
  const workspace = (() => {
    const dir = ctx.location.directory || process.cwd();
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const short = home && dir.toLowerCase().startsWith(home.toLowerCase()) ? `~${dir.slice(home.length)}` : dir;
    return short.replace(/\\/g, "/");
  })();

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

  /** Handle one V2 event; V2 carries every payload under `data`. */
  async function handleEvent(event: NotifyEvent): Promise<void> {
    // A permission request blocks the agent; notify the user so they can come
    // back. Checked before the idle gate, which only matches session.status.
    if (event.type === "permission.asked") {
      const notice = client.permissionNotice(event, client.awayEnabled(), workspace);
      if (!notice) {
        trace("permission skipped: awayNotify is off");
        return;
      }
      if (!shouldSend("permission")) {
        trace("permission skipped: dedup");
        return;
      }
      await trySend(notice.subject, notice.body);
      return;
    }

    if (event.type !== "session.status") return;
    if (event.data?.status?.type !== "idle") return;
    if (!client.awayEnabled()) return;
    const sessionID = event.data.sessionID;
    // A subagent finishing is not "done": the main session is still working.
    if (sessionID && (await client.isSubagent(ctx, sessionID))) return;
    if (!shouldSend("idle")) return;

    const summary = sessionID ? await client.lastAssistantText(ctx, sessionID) : "";
    const body = summary || "(turn finished)";
    await trySend("opencode · 完成", body);
  }

  await ctx.tool.transform((editor) => {
    editor.add({
      name: "notify_email",
      description:
        "Send a short email to the user. Use when the user is away or asked to be notified " +
        "(long task finished, a decision is needed). Returns the send result.",
      input: {
        type: "object",
        properties: {
          subject: { type: "string", description: "short subject line" },
          message: { type: "string", description: "message body" },
        },
        required: ["subject", "message"],
        additionalProperties: false,
      },
      async execute(input) {
        const args = input as { subject: string; message: string };
        return { content: await trySend(args.subject, args.message) };
      },
    });

    editor.add({
      name: "email_switch",
      description:
        "Read or change whether opencode emails you while you are away (turn finished). " +
        "status=true reports; otherwise set enabled.",
      input: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "new state for away auto-push" },
          status: { type: "boolean", description: "report the current state instead of changing it" },
        },
        required: [],
        additionalProperties: false,
      },
      async execute(input) {
        const args = input as { enabled?: boolean; status?: boolean };
        try {
          if (args.status) {
            return { content: `away auto-push: ${client.awayEnabled() ? "ON" : "OFF"} | config: ${client.configPath()}` };
          }
          if (typeof args.enabled === "boolean") {
            const now = client.setAwayNotify(args.enabled);
            return { content: `away auto-push is now ${now ? "ON" : "OFF"} (takes effect immediately)` };
          }
          return { content: "nothing to do: pass status=true or enabled=<bool>" };
        } catch (cause) {
          return { content: `failed: ${cause instanceof Error ? cause.message : String(cause)}` };
        }
      },
    });
  });

  const controller = new AbortController();
  void (async () => {
    for await (const raw of ctx.event.subscribe({ signal: controller.signal })) {
      try {
        await handleEvent(raw as unknown as NotifyEvent);
      } catch (cause) {
        // One bad event must never kill the subscription.
        trace(`handler error: ${cause instanceof Error ? cause.message : cause}`);
      }
    }
  })();

  return () => controller.abort();
}

export default { id: "notify-email", setup };
