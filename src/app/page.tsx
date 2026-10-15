"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GuestSignIn } from "@/components/GuestSignIn";
import { UploadDropzone } from "@/components/UploadDropzone";
import {
  deleteLocalProject,
  getCachedSourceFile,
  listLocalProjectMetas,
  type LocalProjectMeta,
} from "@/media/ingest/indexedDb";
import { MAX_PROJECTS_PER_USER } from "@/lib/constants";

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProjectMeta[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showGuest, setShowGuest] = useState(false);

  const refresh = async () => {
    const metas = await listLocalProjectMetas();
    const live: LocalProjectMeta[] = [];
    for (const m of metas) {
      const file = await getCachedSourceFile(m.projectId);
      if (!file) {
        await deleteLocalProject(m.projectId);
        continue;
      }
      live.push(m);
    }
    setProjects(live);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openProject = async (id: string) => {
    const file = await getCachedSourceFile(id);
    if (!file) {
      await deleteLocalProject(id);
      await refresh();
      setToast("That project’s video is missing — removed from recents.");
      return;
    }
    router.push(`/editor/${id}?step=wizard`);
  };

  return (
    <AppShell>
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-5xl flex-col px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="max-w-xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-zinc-50 md:text-5xl">
              Upload a video. Choose length. Pick clips. Export.
            </h1>
            <p className="mt-3 max-w-lg text-zinc-400">
              Local files only. You decide how many seconds and which shorts to
              keep — then export vertical PiP-ready MP4s. Up to{" "}
              {MAX_PROJECTS_PER_USER} recent projects saved on this device.
            </p>
          </div>
          <div className="text-right">
            <button
              type="button"
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              onClick={() => setShowGuest((v) => !v)}
            >
              {showGuest ? "Hide account" : "Optional sign-in"}
            </button>
            {showGuest ? (
              <div className="mt-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left">
                <GuestSignIn />
              </div>
            ) : null}
          </div>
        </header>

        <section
          id="upload"
          className="mt-14 flex flex-1 scroll-mt-24 flex-col items-center justify-center"
        >
          <UploadDropzone
            onReady={(id) => {
              void refresh();
              router.push(`/editor/${id}?step=wizard`);
            }}
          />
        </section>

        {toast ? (
          <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            {toast}
          </p>
        ) : null}

        <section id="recents" className="mt-16 scroll-mt-24 pb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Recent projects
            </h2>
            <span className="text-xs text-zinc-500">
              {projects.length}/{MAX_PROJECTS_PER_USER} slots
            </span>
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-500">No projects yet — upload a video above.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <li
                  key={p.projectId}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => void openProject(p.projectId)}
                  >
                    <div className="font-medium text-zinc-100">{p.title}</div>
                    <div className="text-xs text-zinc-500">
                      {(p.bytes / (1024 * 1024)).toFixed(1)} MB ·{" "}
                      {(p.probe.durationMs / 1000).toFixed(0)}s
                    </div>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-red-300"
                    onClick={async () => {
                      await deleteLocalProject(p.projectId);
                      await refresh();
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
