/**
 * Closing-text selection for the push body. Same rule as notify-qq, locked here.
 */

import { describe, expect, test } from "bun:test";

import { pickFinalText, isQuietSession, type MessageList, type TranscriptClient } from "../src/transcript";

const A = (content: Array<{ type: string; text?: string }>) => ({ type: "assistant", content });
const U = (text: string) => ({ type: "user", text });

describe("pickFinalText", () => {
  test("takes the last text-only assistant message", () => {
    const msgs: MessageList = [
      U("go"),
      A([{ type: "text", text: "let me check" }, { type: "tool" }]),
      A([{ type: "text", text: "here is the result" }]),
      A([{ type: "tool" }]),
    ];
    expect(pickFinalText(msgs)).toBe("here is the result");
  });

  test("skips a message that contains a tool part", () => {
    expect(pickFinalText([U("go"), A([{ type: "text", text: "preamble" }, { type: "tool" }])])).toBe("");
  });

  test("skips a trailing injected user message (idle race)", () => {
    const msgs: MessageList = [
      U("earlier"),
      A([{ type: "text", text: "the previous answer" }]),
      U(".task do the next thing"),
    ];
    expect(pickFinalText(msgs)).toBe("the previous answer");
  });

  test("skips a trailing turn-end marker too (V2 appends its own message kinds)", () => {
    const msgs: MessageList = [
      U("go"),
      A([{ type: "text", text: "the answer" }]),
      U(".task do the next thing"),
      { type: "idle" },
    ];
    expect(pickFinalText(msgs)).toBe("the answer");
  });

  test("stops at the turn boundary", () => {
    const msgs: MessageList = [A([{ type: "text", text: "old" }]), U("new turn"), A([{ type: "tool" }])];
    expect(pickFinalText(msgs)).toBe("");
  });

  test("joins multiple text parts", () => {
    expect(pickFinalText([U("x"), A([{ type: "text", text: "a" }, { type: "text", text: "b" }])])).toBe("a\n\nb");
  });

  test("empty input yields empty", () => {
    expect(pickFinalText([])).toBe("");
  });
});

describe("isQuietSession", () => {
  const fake = (session: unknown, throws = false): TranscriptClient =>
    ({ session: { get: async () => { if (throws) throw new Error("x"); return session; } } }) as unknown as TranscriptClient;

  test("true when parentID is set", async () => {
    expect(await isQuietSession(fake({ parentID: "ses_p" }), "s")).toBe(true);
  });
  test("true for a .bt aside fork, marked or titled", async () => {
    expect(await isQuietSession(fake({ metadata: { aside: true } }), "s")).toBe(true);
    expect(await isQuietSession(fake({ title: "旁问 · 为什么构建挂了" }), "s")).toBe(true);
  });
  test("false for a main session", async () => {
    expect(await isQuietSession(fake({}), "s")).toBe(false);
  });
  test("fails open (false) on error, so a real notice is not dropped", async () => {
    expect(await isQuietSession(fake(null, true), "s")).toBe(false);
  });
});
