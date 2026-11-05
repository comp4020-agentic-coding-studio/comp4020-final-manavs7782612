// Just enough markdown for README.md: headings, paragraphs, lists, fenced
// code, quotes, links, `code`, **bold** and *em*. Everything is escaped first,
// so nothing in the file reaches the page as markup it didn't ask for.
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) =>
      /^(https?:|\/|#|\.)/.test(href) ? `<a href="${href}">${text}</a>` : text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function render(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  let para: string[] = [];
  let list: { tag: string; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,3}(```|~~~)/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^ {0,3}(```|~~~)/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^ {0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const tag = /\d/.test(li[1]) ? "ol" : "ul";
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push(li[2]);
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); continue; }
    if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flush(); out.push(`<blockquote><p>${inline(q[1])}</p></blockquote>`); continue; }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}
