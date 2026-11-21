/**
 * Markdown -> styled HTML, for the email body.
 *
 * Email has no markdown concept; the client only renders HTML. And Gmail strips
 * <style> blocks, so every element needs an INLINE style or the mail degrades to
 * a plain run-on paragraph. marked parses; marked-highlight + highlight.js color
 * code; the replacements below turn every class into an inline style.
 */

import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

marked.setOptions({ gfm: true, breaks: true });
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return escapeHtml(code);
      }
    },
  }),
);

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const CODE_BLOCK_STYLE =
  "background:#1e1e2e;border:1px solid #313244;border-radius:8px;padding:14px 16px;margin:12px 0;overflow-x:auto";
const CODE_STYLE = `font:12.5px/1.65 ${MONO};color:#cdd6f4;white-space:pre-wrap;word-break:break-word;display:block`;
const INLINE_CODE_STYLE = `font:12.5px/1.4 ${MONO};background:#eef1f5;color:#1f2328;padding:1px 4px;border-radius:4px`;

const HL_STYLES: Record<string, string> = {
  "hljs-keyword": "color:#cba6f7",
  "hljs-built_in": "color:#f9e2af",
  "hljs-type": "color:#f9e2af",
  "hljs-literal": "color:#fab387",
  "hljs-number": "color:#fab387",
  "hljs-operator": "color:#89dceb",
  "hljs-punctuation": "color:#bac2de",
  "hljs-property": "color:#89b4fa",
  "hljs-regexp": "color:#f5c2e7",
  "hljs-string": "color:#a6e3a1",
  "hljs-char.escape_": "color:#f5c2e7",
  "hljs-subst": "color:#cdd6f4",
  "hljs-symbol": "color:#f5c2e7",
  "hljs-class": "color:#f9e2af",
  "hljs-function": "color:#89b4fa",
  "hljs-title": "color:#89b4fa",
  "hljs-title.function_": "color:#89b4fa",
  "hljs-title.class_": "color:#f9e2af",
  "hljs-params": "color:#cdd6f4",
  "hljs-comment": "color:#6c7086;font-style:italic",
  "hljs-doctag": "color:#6c7086",
  "hljs-meta": "color:#f9e2af",
  "hljs-section": "color:#89b4fa",
  "hljs-tag": "color:#cba6f7",
  "hljs-name": "color:#cba6f7",
  "hljs-attr": "color:#89dceb",
  "hljs-attribute": "color:#89dceb",
  "hljs-variable": "color:#cdd6f4",
  "hljs-template-variable": "color:#f5c2e7",
  "hljs-selector-tag": "color:#cba6f7",
  "hljs-selector-class": "color:#a6e3a1",
  "hljs-selector-id": "color:#89b4fa",
  "hljs-bullet": "color:#fab387",
  "hljs-link": "color:#89b4fa",
  "hljs-code": "color:#a6e3a1",
  "hljs-quote": "color:#6c7086;font-style:italic",
  "hljs-addition": "color:#a6e3a1",
  "hljs-deletion": "color:#f38ba8",
  "hljs-emphasis": "font-style:italic",
  "hljs-strong": "font-weight:700",
};

/** Render a small markdown string to inline-styled HTML. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return styleHtml(raw);
}

/**
 * Add inline styles to the tags marked emits.
 *
 * Code is handled in two passes so a block and an inline `code` never get each
 * other's style: first every `<pre><code ...>` block is rewritten, then any
 * remaining bare `<code>` is styled as inline.
 */
function styleHtml(html: string): string {
  // 1. fenced code blocks, with or without a language class
  let out = html.replace(
    /<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
    (_m, inner) => `<pre style="${CODE_BLOCK_STYLE}"><code style="${CODE_STYLE}">${inner}</code></pre>`,
  );

  // 2. inline code: block code was rewritten above with a style attribute, so
  //    the only bare <code> left are inline spans.
  out = out.replace(/<code>/g, `<code style="${INLINE_CODE_STYLE}">`);

  // 3. block + inline typography
  out = out
    .replace(/<h([1-6])>/g, (_m, n) => `<h${n} style="font:600 ${headingSize(Number(n))}px ${SANS};margin:16px 0 8px">`)
    .replace(/<p>/g, `<p style="margin:8px 0;line-height:1.5">`)
    .replace(/<ul>/g, `<ul style="margin:8px 0;padding-left:22px">`)
    .replace(/<ol>/g, `<ol style="margin:8px 0;padding-left:22px">`)
    .replace(/<li>/g, `<li style="margin:2px 0;line-height:1.5">`)
    .replace(
      /<blockquote>/g,
      `<blockquote style="margin:8px 0;padding:4px 12px;border-left:3px solid #d0d7de;color:#57606a">`,
    )
    .replace(/<hr>/g, `<hr style="border:none;border-top:1px solid #d0d7de;margin:16px 0">`)
    .replace(/<a href="/g, `<a style="color:#0969da;text-decoration:none" href="`)
    .replace(/<table>/g, `<table style="border-collapse:collapse;margin:8px 0">`)
    .replace(/<th>/g, `<th style="border:1px solid #d0d7de;padding:4px 8px;text-align:left;background:#f6f8fa">`)
    .replace(/<td>/g, `<td style="border:1px solid #d0d7de;padding:4px 8px">`);

  // 4. syntax colors: class -> inline style
  out = out.replace(/<span class="([^"]*)">/g, (_m, classes: string) => {
    const styles = classes
      .split(/\s+/)
      .map((c) => HL_STYLES[c])
      .filter(Boolean);
    return styles.length ? `<span style="${styles.join(";")}">` : "<span>";
  });

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
