/**
 * Markdown -> styled HTML for the email body.
 *
 * Email clients render HTML, not markdown, and Gmail strips <style>, so the
 * point of these tests is that styles are INLINE on the elements that appear.
 */

import { describe, expect, test } from "bun:test";

import { escapeHtml, renderMarkdown, renderPlain, wrapDocument } from "../src/render";

describe("renderMarkdown", () => {
  test("bold becomes <strong>", () => {
    expect(renderMarkdown("**hi**")).toContain("<strong>hi</strong>");
  });

  test("heading gets an inline font style", () => {
    const out = renderMarkdown("# Title");
    expect(out).toContain("<h1 style=");
    expect(out).toContain("Title");
  });

  test("fenced code becomes a styled <pre> block", () => {
    const out = renderMarkdown("```sh\nnpm run build\n```");
    expect(out).toContain("<pre style=");
    expect(out).toContain("npm run build");
  });

  test("inline code is styled and distinct from block code", () => {
    const out = renderMarkdown("use `npm ci` now");
    expect(out).toContain("<code style=");
    expect(out).toContain("npm ci");
  });

  test("link gets an inline color", () => {
    const out = renderMarkdown("[x](https://e.com)");
    expect(out).toContain('style="color:#0969da');
  });

  test("list items are styled", () => {
    const out = renderMarkdown("- a\n- b");
    expect(out).toContain("<ul style=");
    expect(out).toContain("<li style=");
  });

  test("no <style> block is emitted (Gmail strips it)", () => {
    const out = renderMarkdown("# t\n\n**b**\n\n- l");
    expect(out).not.toContain("<style");
  });
});

describe("wrapDocument / escapeHtml / renderPlain", () => {
  test("wrap adds a container with font", () => {
    expect(wrapDocument("<p>x</p>")).toContain("max-width:720px");
  });
  test("escapeHtml neutralises tags", () => {
    expect(escapeHtml("<b>&")).toBe("&lt;b&gt;&amp;");
  });
  test("renderPlain keeps text verbatim, escaped", () => {
    const out = renderPlain("a < b\nc");
    expect(out).toContain("&lt;");
    expect(out).toContain("white-space:pre-wrap");
    expect(out).not.toContain("<strong>");
  });
});
