"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  children: React.ReactNode;
  title?: string;
  showEditorActions?: boolean;
};

export function AppShell({ children, title, showEditorActions }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const onHome = pathname === "/";

  return (
    <div className="relative min-h-dvh bg-zinc-950 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.10),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(16,185,129,0.06),_transparent_45%)]"
      />
      <header className="relative z-10 border-b border-zinc-800/80 bg-zinc-950/80 pt-[var(--safe-top)] backdrop-blur">
        <div className="mx-auto flex min-h-[var(--app-header-h)] max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] md:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.18em] text-amber-400"
            >
              Shorts Studio
            </Link>
            {title ? (
              <span className="hidden truncate text-sm text-zinc-400 sm:inline">
                / {title}
              </span>
            ) : null}
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {showEditorActions ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Back home
              </button>
            ) : null}
            <Link
              href="/#upload"
              className="inline-flex min-h-11 items-center rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
            >
              New upload
            </Link>
            {!onHome ? (
              <Link
                href="/#recents"
                className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Recents
              </Link>
            ) : (
              <a
                href="#recents"
                className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Recents
              </a>
            )}
          </nav>
        </div>
      </header>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
