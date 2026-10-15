"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";

type Props = {
  open: boolean;
  percent: number;
  message: string;
  title?: string;
  subtitle?: string;
};

export function EncodeProgressOverlay({
  open,
  percent,
  message,
  title = "Rendering your short",
  subtitle = "Encoding in this browser. Keep this tab open.",
}: Props) {
  const [indeterminate, setIndeterminate] = useState(false);
  const lastPercentRef = useRef(percent);
  const lastChangeRef = useRef(Date.now());

  useEffect(() => {
    if (!open) {
      setIndeterminate(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (percent !== lastPercentRef.current) {
      lastPercentRef.current = percent;
      lastChangeRef.current = Date.now();
      setIndeterminate(false);
      return;
    }
    const id = window.setInterval(() => {
      if (Date.now() - lastChangeRef.current > 1500) {
        setIndeterminate(true);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [open, percent]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 px-4 pt-[var(--safe-top)] pb-[var(--safe-bottom)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="encode-progress-title"
      aria-describedby="encode-progress-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-8">
        <h2
          id="encode-progress-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl"
        >
          {title}
        </h2>
        <p id="encode-progress-desc" className="mt-2 text-sm text-zinc-400">
          {subtitle}
        </p>
        <div className="mt-8">
          <ProgressBar
            value={percent}
            size="thick"
            label={message || "Working…"}
            indeterminate={indeterminate}
          />
        </div>
      </div>
    </div>
  );
}
