import React from "react";

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string };

/**
 * Parses raw markdown text into structured blocks (paragraphs, headings, code, lists, blockquotes).
 */
export function parseBlocks(rawText: string): Block[] {
  if (!rawText) return [];

  const normalized = rawText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: Block[] = [];

  let currentParagraphLines: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.join(" ").trim();
      if (text) {
        blocks.push({ type: "paragraph", text });
      }
      currentParagraphLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle (```)
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        blocks.push({ type: "code", language: codeLang, code: codeLines.join("\n") });
        inCodeBlock = false;
        codeLines = [];
        codeLang = "";
      } else {
        flushParagraph();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Empty line separates blocks
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Heading (# Heading, ## Heading, ### Heading)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // Blockquote (> text)
    const quoteMatch = line.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      const quoteText = quoteMatch[1].trim();
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === "blockquote") {
        lastBlock.text += " " + quoteText;
      } else {
        blocks.push({ type: "blockquote", text: quoteText });
      }
      continue;
    }

    // Bullet or numbered list item (- item, * item, + item, 1. item)
    const ulMatch = line.match(/^[\-\*\+]\s+(.+)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);

    if (ulMatch || olMatch) {
      flushParagraph();
      const isOrdered = Boolean(olMatch);
      const itemText = (olMatch ? olMatch[2] : ulMatch![1]).trim();

      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === "list" && lastBlock.ordered === isOrdered) {
        lastBlock.items.push(itemText);
      } else {
        blocks.push({
          type: "list",
          ordered: isOrdered,
          items: [itemText],
        });
      }
      continue;
    }

    // Regular paragraph text
    currentParagraphLines.push(line.trim());
  }

  flushParagraph();

  // Handle unclosed code block during streaming
  if (inCodeBlock && codeLines.length > 0) {
    blocks.push({ type: "code", language: codeLang, code: codeLines.join("\n") });
  }

  return blocks;
}

/**
 * Renders inline Markdown constructs:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `inline code`
 * - [link text](url)
 * - streaming unclosed tags
 */
export function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  const inlineRegex = /(`[^`\n]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [full, code, link, bold, italic] = match;

    if (code) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-1.5 py-0.5 font-mono text-[13px] font-normal text-[var(--accent)]"
        >
          {code.slice(1, -1)}
        </code>
      );
    } else if (link) {
      const linkMatch = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        nodes.push(
          <a
            key={`link-${match.index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline transition-opacity hover:opacity-80"
          >
            {renderInline(label)}
          </a>
        );
      } else {
        nodes.push(full);
      }
    } else if (bold) {
      const content = bold.slice(2, -2);
      nodes.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-[var(--accent)]">
          {renderInline(content)}
        </strong>
      );
    } else if (italic) {
      const content = italic.slice(1, -1);
      nodes.push(
        <em key={`italic-${match.index}`} className="italic text-[var(--ink)]">
          {renderInline(content)}
        </em>
      );
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);

    // Handle partial/unclosed streaming tags gracefully
    if (remaining.startsWith("**") && !remaining.slice(2).includes("**")) {
      nodes.push(
        <strong key="dangling-bold" className="font-semibold text-[var(--accent)]">
          {remaining.slice(2)}
        </strong>
      );
    } else if (remaining.startsWith("`") && !remaining.slice(1).includes("`")) {
      nodes.push(
        <code
          key="dangling-code"
          className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-1.5 py-0.5 font-mono text-[13px] font-normal text-[var(--accent)]"
        >
          {remaining.slice(1)}
        </code>
      );
    } else if (
      (remaining.startsWith("*") || remaining.startsWith("_")) &&
      !remaining.slice(1).includes(remaining[0])
    ) {
      nodes.push(
        <em key="dangling-italic" className="italic text-[var(--ink)]">
          {remaining.slice(1)}
        </em>
      );
    } else {
      nodes.push(remaining);
    }
  }

  return nodes;
}

export function MarkdownLite({ text }: { text: string }) {
  if (!text) return null;

  const blocks = parseBlocks(text);

  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, idx) => {
        if (block.type === "paragraph") {
          return (
            <p key={idx} className="leading-relaxed text-[var(--ink)]">
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "heading") {
          const Tag = block.level <= 2 ? "h2" : "h3";
          const sizeClass =
            block.level === 1
              ? "text-lg font-bold"
              : block.level === 2
                ? "text-base font-semibold"
                : "text-[15px] font-semibold";
          return (
            <Tag key={idx} className={`${sizeClass} my-0.5 text-[var(--ink)]`}>
              {renderInline(block.text)}
            </Tag>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={idx}
              className={`my-1 flex flex-col gap-1 pl-5 ${
                block.ordered ? "list-decimal" : "list-disc"
              } text-[var(--ink)]`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={idx}
              className="my-1 border-l-2 border-[var(--accent)] pl-3 italic text-[var(--ink-dim)]"
            >
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={idx}
              className="my-1.5 overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 font-mono text-xs text-[var(--ink)]"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        return null;
      })}
    </div>
  );
}

