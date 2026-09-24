/**
 * CLI: send one notification email, or check the configuration.
 *
 *   bun run src/notify.ts <subject> <body...>
 *   bun run src/notify.ts --check      # verify SMTP + send a test message
 *   echo "body" | bun run src/notify.ts "subject"
 */

import { configPath, loadConfig, recipients, resolvedSmtp } from "./config";
import { sendEmail } from "./mail";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  try {
    return await Bun.stdin.text();
  } catch {
    return "";
  }
}

export async function check(): Promise<number> {
  const cfg = loadConfig();
  const smtp = resolvedSmtp(cfg);
  const to = recipients(cfg);

  console.log(`config: ${configPath()}`);
  if (!smtp) {
    console.log("  smtp: NOT configured (host/user/pass missing)");
    return 2;
  }
  console.log(`  smtp: ${smtp.host}:${smtp.port} (${smtp.secure ? "TLS" : "STARTTLS"})`);
  console.log(`  user: ${smtp.user}`);
  console.log(`  to:   ${to.length ? to.join(", ") : "(not set)"}`);
  if (to.length === 0) return 2;

  try {
    const r = await sendEmail("opencode · 测试邮件", "这是一封测试邮件。收到即表示 SMTP 配置正确。");
    console.log(`  send: OK (${r.messageId ?? "?"})`);
    return 0;
  } catch (cause) {
    console.log(`  send: FAILED - ${cause instanceof Error ? cause.message : cause}`);
    return 1;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args[0] === "--check") return check();
  if (args.length === 0) {
    console.error("usage: notify.ts <subject> [body...]  |  notify.ts --check");
    return 2;
  }
  const subject = args[0]!;
  const inlineBody = args.slice(1).join(" ");
  const body = inlineBody || (await readStdin()) || subject;

  try {
    const r = await sendEmail(subject, body);
    console.log(`sent (${r.messageId ?? "?"})`);
    return 0;
  } catch (cause) {
    console.error(`failed: ${cause instanceof Error ? cause.message : cause}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
