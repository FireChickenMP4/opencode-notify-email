/**
 * Markdown -> styled HTML, for the email body.
 *
 * Email has no markdown concept; the client only renders HTML. And Gmail strips
 * <style> blocks, so every element needs an INLINE style or the mail degrades to
 * a plain run-on paragraph. marked does the parsing; this adds the inline styles.
 *
 * Only a small, safe subset is styled (headings, bold/italic/code, lists, quotes,
 * rules, links, pre) - enough for an agent's status message, nothing exotic.
 */

import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const CODE_BLOCK_STYLE = `background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:12px;overflow:auto;margin:8px 0`;
const CODE_STYLE = `font:12.5px/1.45 ${MONO};white-space:pre`;
const INLINE_CODE_STYLE = `font:12.5px/1.4 ${MONO};background:#f6f8fa;padding:1px 4px;border-radius:4px`;

/** Render a small markdown string to inline-styled HTML. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return styleHtml(raw);
}

/**
 * Add inline styles to the tags marked emits.
 *
 * Code is handled in two passes so a block and an inline `code` never get each
 * other's style: first every `<pre><code ...>` block is rewritten (and its inner
 * code marked with a sentinel class), then any remaining bare `<code>` is styled
 * as inline.
 */
function styleHtml(html: string): string {
  // 1. fenced code blocks, with or without a language class
  let out = html.replace(
    /<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
    (_m, inner) => `<pre style="${CODE_BLOCK_STYLE}"><code style="${CODE_STYLE}">${inner}</code></pre>`,
  );

  // 2. inline code: block code was rewritten above with a style attribute, so
  //    the only bare `<code>` left are inline spans.
  out = out.replace(/<code>/g, `<code style="${INLINE_CODE_STYLE}">`);

  // 3. block + inline typography
  out = out
    .replace(/<h([1-6])>/g, (_m, n) => `<h${n} style="font:600 ${headingSize(Number(n))}px ${SANS};margin:16px 0 8px">`)
    .replace(/<p>/g, `<p style="margin:8px 0;line-height:1.5">`)
    .replace(/<ul>/g, `<ul style="margin:8px 0;padding-left:22px">`)
    .replace(/<ol>/g, `<ol style="margin:8px 0;padding-left:22px">`)
    .replace(/<li>/g, `<li style="margin:2px 0;line-height:1.5">`)
    .replace(/<blockquote>/g, `<blockquote style="margin:8px 0;padding:4px 12px;border-left:3px solid #d0d7de;color:#57606a">`)
    .replace(/<hr>/g, `<hr style="border:none;border-top:1px solid #d0d7de;margin:16px 0">`)
    .replace(/<a href="/g, `<a style="color:#0969da;text-decoration:none" href="`)
    .replace(/<table>/g, `<table style="border-collapse:collapse;margin:8px 0">`)
    .replace(/<th>/g, `<th style="border:1px solid #d0d7de;padding:4px 8px;text-align:left;background:#f6f8fa">`)
    .replace(/<td>/g, `<td style="border:1px solid #d0d7de;padding:4px 8px">`);

  return out;
}

function headingSize(level: number): number {
  return [22, 19, 17, 15, 14, 13][level - 1] ?? 16;
}

/** Wrap already-rendered body HTML in a page container. */
export function wrapDocument(inner: string): string {
  return `<div style="font:14px/1.55 ${SANS};color:#1f2328;max-width:720px">${inner}</div>`;
}

/** Escape for safe inclusion in HTML (used by the plain-text path). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text as a <pre> block (newlines preserved, no markdown parse). */
export function renderPlain(text: string): string {
  return `<pre style="font:13px/1.5 ${MONO};white-space:pre-wrap;word-break:break-word;margin:8px 0">${escapeHtml(text)}</pre>`;
}
