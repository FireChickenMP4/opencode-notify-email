/**
 * Configuration for opencode-notify-email.
 *
 * Lives OUTSIDE the repo, next to the other opencode credentials:
 *
 *   ~/.config/opencode/notify-email.json
 *   (Windows: C:\Users\<you>\.config\opencode\notify-email.json)
 *
 * Override the location with OPENCODE_NOTIFY_EMAIL_CONFIG.
 *
 * Shape:
 *   {
 *     "smtp": {
 *       "host": "smtp.exmail.qq.com",
 *       "port": 465,
 *       "secure": true,
 *       "user": "you@example.edu",
 *       "pass": "app-password-or-login-password",
 *       "from": "opencode <you@example.edu>"   // optional, defaults to user
 *     },
 *     "to": "you@example.edu",
 *     "awayNotify": { "enabled": false }
 *   }
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type SmtpConfig = {
  host: string;
  port: number;
  /** true for implicit TLS (465); false for STARTTLS (587). */
  secure: boolean;
  user: string;
  pass: string;
  /** Optional RFC5322 From; defaults to `user`. */
  from?: string;
};

export type NotifyEmailConfig = {
  smtp?: Partial<SmtpConfig>;
  /** Recipient(s). A single address or a list. */
  to?: string | string[];
  awayNotify?: boolean | { enabled?: boolean };
};

export function defaultConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "opencode", "notify-email.json");
}

export function configPath(): string {
  const override = process.env.OPENCODE_NOTIFY_EMAIL_CONFIG?.trim();
  if (override) return isAbsolute(override) ? override : resolve(override);
  return defaultConfigPath();
}

export function loadConfig(path = configPath()): NotifyEmailConfig {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NotifyEmailConfig;
  } catch (cause) {
    throw new Error(`invalid config at ${path}: ${cause instanceof Error ? cause.message : cause}`);
  }
}

/** Fully-resolved SMTP settings, or null when unconfigured. */
export function resolvedSmtp(cfg: NotifyEmailConfig = loadConfig()): SmtpConfig | null {
  const s = cfg.smtp;
  if (!s?.host || !s.user || !s.pass) return null;
  return {
    host: s.host,
    port: typeof s.port === "number" ? s.port : 465,
    secure: typeof s.secure === "boolean" ? s.secure : true,
    user: s.user,
    pass: s.pass,
    ...(s.from ? { from: s.from } : {}),
  };
}

/** Recipients as a normalised array (empty when unset). */
export function recipients(cfg: NotifyEmailConfig = loadConfig()): string[] {
  const to = cfg.to;
  if (!to) return [];
  return (Array.isArray(to) ? to : [to]).map((x) => String(x).trim()).filter(Boolean);
}

/** The away auto-push switch (accepts both a bool and an {enabled} object). */
export function awayEnabled(cfg: NotifyEmailConfig = loadConfig()): boolean {
  const a = cfg.awayNotify;
  if (typeof a === "boolean") return a;
  return a?.enabled === true;
}

/** Set the away switch in the config file, preserving every other field. */
export function setAwayNotify(enabled: boolean, path = configPath()): boolean {
  const cfg = loadConfig(path);
  cfg.awayNotify = { enabled };
  writeFileSync(path, JSON.stringify(cfg, null, 2), "utf8");
  return enabled;
}
