/**
 * Sending mail over SMTP.
 *
 * Uses nodemailer: it handles AUTH, implicit TLS vs STARTTLS, and MIME encoding,
 * all of which are easy to get subtly wrong by hand.
 */

import nodemailer from "nodemailer";

import { loadConfig, recipients, resolvedSmtp, type SmtpConfig } from "./config";
import { renderMarkdown, renderPlain, wrapDocument } from "./render";

export type SendResult = { messageId?: string; accepted?: string[] };

export class EmailError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "EmailError";
    this.code = code;
  }
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function makeTransport(smtp: SmtpConfig): ReturnType<typeof nodemailer.createTransport> {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transport;
}

/**
 * Send an email.
 *
 * Reads SMTP settings and recipients fresh from the config, so a config edit
 * takes effect on the next message without a restart.
 *
 * Body rendering:
 *   - `html` (default): the body is treated as MARKDOWN and rendered to
 *     inline-styled HTML (Gmail strips <style>, so styles are inline). Same
 *     intent as the QQ channel's markdown push.
 *   - `plain: true`: no markdown parse; wrap in <pre> so it stays verbatim.
 * The text/plain alternative is always the raw body, for non-HTML clients.
 */
export async function sendEmail(
  subject: string,
  body: string,
  options: { plain?: boolean } = {},
): Promise<SendResult> {
  const cfg = loadConfig();
  const smtp = resolvedSmtp(cfg);
  const to = recipients(cfg);

  if (!smtp) {
    throw new EmailError("SMTP not configured (host/user/pass missing) - see README");
  }
  if (to.length === 0) {
    throw new EmailError("no recipient configured (`to` is empty) - see README");
  }

  const raw = smtp.from ?? smtp.user;
  // Accept both `Name <addr>` and a bare address.
  const from = raw.includes("<") ? raw : `${raw} <${raw}>`;
  // A bare "<pre>" wrap needs the container too, so inline code spans inside a
  // plain body still render on one line.
  const html = wrapDocument(options.plain ? renderPlain(body) : renderMarkdown(body));

  try {
    const info = await makeTransport(smtp).sendMail({
      from,
      to: to.join(", "),
      subject,
      text: body,
      html,
    });
    return { messageId: info.messageId, accepted: info.accepted as string[] };
  } catch (cause) {
    const e = cause as { message?: string; code?: string };
    throw new EmailError(e.message ?? String(cause), e.code);
  }
}

/** Drop the cached transport (after a config change, or in tests). */
export function resetTransport(): void {
  transport = null;
}
