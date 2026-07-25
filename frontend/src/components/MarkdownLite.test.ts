import { describe, expect, it } from "vitest";
import { parseBlocks, renderInline } from "./MarkdownLite";

describe("MarkdownLite parser", () => {
  describe("parseBlocks", () => {
    it("parses single paragraph text", () => {
      const blocks = parseBlocks("Hello world!");
      expect(blocks).toEqual([{ type: "paragraph", text: "Hello world!" }]);
    });

    it("parses multiple paragraphs split by newlines", () => {
      const blocks = parseBlocks("Paragraph 1.\n\nParagraph 2.");
      expect(blocks).toEqual([
        { type: "paragraph", text: "Paragraph 1." },
        { type: "paragraph", text: "Paragraph 2." },
      ]);
    });

    it("parses headings", () => {
      const blocks = parseBlocks("# Heading 1\n## Heading 2\n### Heading 3");
      expect(blocks).toEqual([
        { type: "heading", level: 1, text: "Heading 1" },
        { type: "heading", level: 2, text: "Heading 2" },
        { type: "heading", level: 3, text: "Heading 3" },
      ]);
    });

    it("parses unordered bullet lists", () => {
      const blocks = parseBlocks("- Item 1\n- Item 2\n* Item 3");
      expect(blocks).toEqual([
        {
          type: "list",
          ordered: false,
          items: ["Item 1", "Item 2", "Item 3"],
        },
      ]);
    });

    it("parses ordered numbered lists", () => {
      const blocks = parseBlocks("1. First step\n2. Second step");
      expect(blocks).toEqual([
        {
          type: "list",
          ordered: true,
          items: ["First step", "Second step"],
        },
      ]);
    });

    it("parses blockquotes", () => {
      const blocks = parseBlocks("> Important note about yield");
      expect(blocks).toEqual([
        { type: "blockquote", text: "Important note about yield" },
      ]);
    });

    it("parses multiline code blocks", () => {
      const raw = "Here is code:\n```json\n{\n  \"status\": \"ok\"\n}\n```";
      const blocks = parseBlocks(raw);
      expect(blocks).toEqual([
        { type: "paragraph", text: "Here is code:" },
        { type: "code", language: "json", code: "{\n  \"status\": \"ok\"\n}" },
      ]);
    });
  });

  describe("renderInline", () => {
    it("handles plain text", () => {
      const nodes = renderInline("Plain text");
      expect(nodes).toEqual(["Plain text"]);
    });

    it("handles bold, inline code, and links", () => {
      const nodes = renderInline("Hold **$48,320** on `0.0.78492` via [HashScan](https://hashscan.io)");
      expect(nodes).toHaveLength(6);
      // Check node types/contents
      expect(nodes[0]).toBe("Hold ");
      expect(nodes[2]).toBe(" on ");
      expect(nodes[4]).toBe(" via ");
    });

    it("gracefully handles unclosed/dangling tags during streaming", () => {
      expect(() => renderInline("Streaming **bold text")).not.toThrow();
      expect(() => renderInline("Streaming `inline code")).not.toThrow();
      expect(() => renderInline("Streaming *italic text")).not.toThrow();
    });
  });
});
