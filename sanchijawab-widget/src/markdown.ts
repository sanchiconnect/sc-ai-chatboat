/**
 * Minimal, dependency-free markdown-to-HTML for chat bubbles. Deliberately
 * not a full markdown library (would bloat the <60KB gzip widget budget for
 * a handful of patterns the model actually produces). Escapes HTML first,
 * so nothing in the input — including content pulled from crawled pages —
 * can inject markup; only the whitelisted tags below are ever emitted.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

export function renderMarkdown(raw: string): string {
  const escaped = escapeHtml(raw);

  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${text}</a>`);

  const lines = withInline.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const numbered = !bullet ? /^\s*\d+[.)]\s+(.*)/.exec(line) : null;
    const kind: "ul" | "ol" | null = bullet ? "ul" : numbered ? "ol" : null;

    if (kind) {
      if (listType !== kind) {
        if (listType) html.push(`</${listType}>`);
        html.push(`<${kind}>`);
        listType = kind;
      }
      html.push(`<li>${(bullet ?? numbered)![1]}</li>`);
    } else {
      if (listType) {
        html.push(`</${listType}>`);
        listType = null;
      }
      if (line.trim()) html.push(`<p>${line}</p>`);
    }
  }
  if (listType) html.push(`</${listType}>`);

  return html.join("");
}
