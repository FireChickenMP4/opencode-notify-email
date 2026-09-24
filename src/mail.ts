/**
 * Sending mail over SMTP.
 *
 * Uses nodemailer: it handles AUTH, implicit TLS vs STARTTLS, and MIME encoding,
 * all of which are easy to get subtly wrong by hand.
 */

import nodemailer from "nodemailer";

import { loadConfig, recipients, resolvedSmtp, type SmtpConfig } from "./config";

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
 * takes effect on the next message without a restart. Subject/body accept the
 * plain text; the body is sent as both text and HTML (a <pre> wrapper) so
 * markdown-ish output stays readable.
 */
export async function sendEmail(
  subject: string,
  body: string,
  options: { html?: boolean } = {},
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

  try {
    const info = await makeTransport(smtp).sendMail({
      from,
      to: to.join(", "),
      subject,
      text: body,
      // Wrap plain text in <pre> so indentation/newlines survive, unless the
      // caller already supplied HTML.
      html: options.html ? body : `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
    });
    return { messageId: info.messageId, accepted: info.accepted as string[] };
  } catch (cause) {
    const e = cause as { message?: string; code?: string };
    throw new EmailError(e.message ?? String(cause), e.code);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Drop the cached transport (after a config change, or in tests). */
export function resetTransport(): void {
  transport = null;
}
