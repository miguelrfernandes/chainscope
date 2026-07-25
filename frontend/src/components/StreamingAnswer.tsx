"use client";

import { useEffect, useState } from "react";
import { MarkdownLite } from "./MarkdownLite";

const WORD_DELAY_MS = 45;

export function StreamingAnswer({
  text,
  onDone,
}: {
  text: string;
  onDone?: () => void;
}) {
  const words = text.split(" ");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count >= words.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), WORD_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, words.length]);

  const visible = words.slice(0, count).join(" ");
  const streaming = count < words.length;

  return (
    <p className="text-[15px] leading-relaxed text-[var(--ink)]">
      <MarkdownLite text={visible} />
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-caret bg-[var(--accent)]" />
      )}
    </p>
  );
}
