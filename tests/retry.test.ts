/**
 * Retry policy: a transient failure is retried before giving up.
 */

import { describe, expect, test } from "bun:test";

import { deliverWithRetry } from "../src/retry";

const noSleep = async () => {};

describe("deliverWithRetry", () => {
  test("succeeds first time", async () => {
    let n = 0;
    const out = await deliverWithRetry(async () => { n++; }, noSleep);
    expect(out).toEqual({ ok: true, attempts: 1 });
    expect(n).toBe(1);
  });

  test("retries then succeeds", async () => {
    let n = 0;
    const out = await deliverWithRetry(async () => {
      n++;
      if (n < 3) throw new Error("smtp hiccup");
    }, noSleep);
    expect(out).toEqual({ ok: true, attempts: 3 });
  });

  test("gives up and reports the last error", async () => {
    const out = await deliverWithRetry(async () => { throw new Error("down"); }, noSleep);
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(3);
    expect(out.error).toBe("down");
  });

  test("uses the supplied backoff schedule", async () => {
    const slept: number[] = [];
    await deliverWithRetry(
      async () => { throw new Error("x"); },
      async (ms) => { slept.push(ms); },
      [10, 20],
    );
    expect(slept).toEqual([10, 20]);
  });

  test("non-Error throw becomes a string", async () => {
    const out = await deliverWithRetry(async () => { throw "boom"; }, noSleep, []);
    expect(out).toEqual({ ok: false, attempts: 1, error: "boom" });
  });
});
