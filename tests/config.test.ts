/**
 * Config parsing: the away switch, SMTP resolution, recipients.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  awayEnabled,
  loadConfig,
  recipients,
  resolvedSmtp,
  setAwayNotify,
} from "../src/config";

describe("awayEnabled", () => {
  test("accepts a boolean", () => {
    expect(awayEnabled({ awayNotify: true })).toBe(true);
    expect(awayEnabled({ awayNotify: false })).toBe(false);
  });
  test("accepts an {enabled} object", () => {
    expect(awayEnabled({ awayNotify: { enabled: true } })).toBe(true);
    expect(awayEnabled({ awayNotify: { enabled: false } })).toBe(false);
  });
  test("defaults to false when unset", () => {
    expect(awayEnabled({})).toBe(false);
  });
});

describe("resolvedSmtp", () => {
  test("null when host/user/pass missing", () => {
    expect(resolvedSmtp({})).toBeNull();
    expect(resolvedSmtp({ smtp: { host: "x", user: "u" } })).toBeNull();
  });
  test("fills defaults for port/secure", () => {
    const s = resolvedSmtp({ smtp: { host: "h", user: "u", pass: "p" } });
    expect(s).toEqual({ host: "h", user: "u", pass: "p", port: 465, secure: true });
  });
  test("honours explicit port/secure", () => {
    const s = resolvedSmtp({ smtp: { host: "h", user: "u", pass: "p", port: 587, secure: false } });
    expect(s?.port).toBe(587);
    expect(s?.secure).toBe(false);
  });
});

describe("recipients", () => {
  test("single string", () => {
    expect(recipients({ to: "a@x.com" })).toEqual(["a@x.com"]);
  });
  test("list, trimmed and de-blanked", () => {
    expect(recipients({ to: [" a@x.com ", "", "b@x.com"] })).toEqual(["a@x.com", "b@x.com"]);
  });
  test("empty when unset", () => {
    expect(recipients({})).toEqual([]);
  });
});

describe("loadConfig / setAwayNotify", () => {
  test("missing file is empty config", () => {
    const p = join(tmpdir(), "does-not-exist-xyz.json");
    expect(loadConfig(p)).toEqual({});
  });

  test("setAwayNotify preserves other fields and toggles", () => {
    const dir = mkdtempSync(join(tmpdir(), "email-cfg-"));
    const p = join(dir, "c.json");
    try {
      writeFileSync(p, JSON.stringify({ smtp: { host: "h", user: "u", pass: "p" }, to: "a@x.com" }), "utf8");
      setAwayNotify(true, p);
      const back = loadConfig(p);
      expect(awayEnabled(back)).toBe(true);
      expect(back.to).toBe("a@x.com");
      expect(back.smtp?.host).toBe("h");
      setAwayNotify(false, p);
      expect(awayEnabled(loadConfig(p))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid JSON throws with the path", () => {
    const dir = mkdtempSync(join(tmpdir(), "email-cfg-"));
    const p = join(dir, "bad.json");
    try {
      writeFileSync(p, "{not json", "utf8");
      expect(() => loadConfig(p)).toThrow(/invalid config/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
