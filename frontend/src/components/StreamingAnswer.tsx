"use client";

import { useEffect, useState } from "react";
import { MarkdownLite } from "./MarkdownLite";

const WORD_DELAY_MS = 45;

export function StreamingAnswer({
  text,
  onDone,
  instant = false,
}: {
  text: string;
  onDone?: () => void;
  instant?: boolean;
}) {
  const words = text.split(" ");
  const [count, setCount] = useState(instant ? words.length : 0);

  useEffect(() => {
    if (instant || count >= words.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), WORD_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, words.length, instant]);

  const visible = words.slice(0, count).join(" ");
  const streaming = count < words.length;

  return (
    <div className="relative text-[15px] leading-relaxed text-[var(--ink)]">
      <MarkdownLite text={visible} />
      {streaming && (
        <span className="ml-1 inline-block h-4 w-2 translate-y-0.5 animate-caret bg-[var(--accent)]" />
      )}
    </div>
  );
}
