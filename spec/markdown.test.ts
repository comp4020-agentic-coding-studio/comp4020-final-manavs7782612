import { describe, expect, it } from "vitest";
import { render } from "../src/lib/markdown.ts";

// Pure function, no running app needed: escaping and the small markdown
// subset markdown.ts claims to support (CLAUDE.md "every deterministic part
// gets a test in spec/").
describe("markdown.render", () => {
  it("escapes HTML in plain text so user content never becomes markup", () => {
    expect(render("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("renders headings at the right level", () => {
    expect(render("# One\n## Two\n###### Six")).toBe(
      "<h1>One</h1>\n<h2>Two</h2>\n<h6>Six</h6>",
    );
  });

  it("renders a paragraph, bold and em inline", () => {
    expect(render("plain **bold** and *em* text")).toBe(
      "<p>plain <strong>bold</strong> and <em>em</em> text</p>",
    );
  });

  it("renders inline code without interpreting its contents", () => {
    expect(render("call `f(<x>)` now")).toBe(
      "<p>call <code>f(&lt;x&gt;)</code> now</p>",
    );
  });

  it("only linkifies safe-looking targets, and escapes the href", () => {
    expect(render("[go](https://example.com)")).toBe(
      '<p><a href="https://example.com">go</a></p>',
    );
    expect(render("[go](ftp://evil)")).toBe("<p>go</p>");
  });

  it("groups consecutive bullet or numbered lines into one list", () => {
    expect(render("- a\n- b\n- c")).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
    expect(render("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders a fenced code block verbatim, escaped", () => {
    expect(render("```\n<b>raw</b>\n```")).toBe("<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>");
  });

  it("renders a blockquote", () => {
    expect(render("> a quote")).toBe("<blockquote><p>a quote</p></blockquote>");
  });
});
