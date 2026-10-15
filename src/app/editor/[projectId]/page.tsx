"use client";

import { Suspense, use } from "react";
import { AppShell } from "@/components/AppShell";
import { EditorStudio } from "@/components/editor/EditorStudio";

export default function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  return (
    <AppShell title="Editor" showEditorActions>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <Suspense
          fallback={
            <div className="animate-pulse text-zinc-400">Loading editor…</div>
          }
        >
          <EditorStudio projectId={projectId} />
        </Suspense>
      </main>
    </AppShell>
  );
}
