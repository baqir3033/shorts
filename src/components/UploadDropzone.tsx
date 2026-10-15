"use client";

import { useCallback, useState } from "react";
import {
  ingestLocalFile,
  IngestError,
  INGEST_USER_ACTIONS,
} from "@/media/ingest/ingest";
import { MAX_PROJECTS_PER_USER } from "@/lib/constants";
import {
  enforceLocalFifo,
  listLocalProjectMetas,
} from "@/media/ingest/indexedDb";

type Props = {
  onReady: (projectId: string) => void;
};

export function UploadDropzone({ onReady }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fifoWarn, setFifoWarn] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const runIngest = useCallback(
    async (file: File, confirmFifo: boolean) => {
      setBusy(true);
      setError(null);
      setMessage("Starting…");
      try {
        const metas = await listLocalProjectMetas();
        if (metas.length >= MAX_PROJECTS_PER_USER && !confirmFifo) {
          const oldest = [...metas].sort(
            (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
          )[0];
          setFifoWarn(
            `Saving this will remove your oldest project: ${oldest?.title ?? "untitled"}`,
          );
          setPendingFile(file);
          setBusy(false);
          return;
        }

        if (confirmFifo) {
          await enforceLocalFifo(MAX_PROJECTS_PER_USER);
        }

        const projectId = crypto.randomUUID();
        await ingestLocalFile(file, {
          projectId,
          confirmFifo: true,
          onProgress: (p, m) => {
            setProgress(p);
            setMessage(m);
          },
        });

        // Best-effort cloud project create
        try {
          await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              title: file.name.replace(/\.[^.]+$/, ""),
              confirmFifo: true,
              sourceBytes: file.size,
            }),
          });
        } catch {
          /* local mode ok */
        }

        onReady(projectId);
      } catch (err) {
        if (err instanceof IngestError) {
          setError(
            `${err.message} — ${INGEST_USER_ACTIONS[err.code]}`,
          );
        } else {
          setError(err instanceof Error ? err.message : "Upload failed");
        }
      } finally {
        setBusy(false);
        setFifoWarn(null);
        setPendingFile(null);
      }
    },
    [onReady],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void runIngest(file, false);
  };

  return (
    <div className="w-full max-w-xl">
      <label
        className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 transition ${
          busy
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-zinc-600 bg-zinc-900/60 hover:border-amber-400/70 hover:bg-zinc-900"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
          className="hidden"
          disabled={busy}
          onChange={(e) => onFiles(e.target.files)}
        />
        <span className="text-lg font-semibold text-zinc-100">
          Drop a local video
        </span>
        <span className="mt-2 text-center text-sm text-zinc-400">
          MP4 / MOV · max 200 MB · up to 15 minutes · no URL import
        </span>
        {busy && (
          <div className="mt-6 w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-zinc-400">{message}</p>
          </div>
        )}
      </label>

      {fifoWarn && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p>{fifoWarn}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-400 px-3 py-1.5 font-medium text-zinc-950"
              onClick={() => pendingFile && runIngest(pendingFile, true)}
            >
              Replace oldest
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-zinc-200"
              onClick={() => {
                setFifoWarn(null);
                setPendingFile(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
