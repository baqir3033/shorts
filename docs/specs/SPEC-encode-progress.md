# SPEC — Encode progress overlay

## Purpose
While the browser encodes an MP4, show a **blocking fullscreen progress surface** so mobile users know work is happening and keep the tab open.

## Trigger
- Open when `busy === "encode"` in `EditorStudio`.
- Close when encode finishes (success or error). No user dismiss/cancel in v1.

## UI
- `fixed inset-0 z-50`, `role="dialog"`, `aria-modal="true"`, `aria-busy="true"`.
- Centered card (`max-w-md`) with title, subtitle (“Keep this tab open”), thick amber `ProgressBar`, phase message, large percent.
- Body scroll locked while open (`document.body.style.overflow = "hidden"`).
- Safe-area padding on the overlay shell.

## Progress data
- Source: `ProgressEvent` from `encodeEditSpec` (`percent`, `phase`, `message`).
- UI state: `{ percent, message }` separate from analyze `phaseMsg`.
- Milestones only (wasm load → write → analyze/encode passes → validate → done). No `ffmpeg.on("progress")` in this version.
- Bar uses CSS width transition; indeterminate shimmer if percent unchanged >1.5s.

## Non-goals
- Cancel/abort encode.
- Fake frame-accurate progress.
- Blocking overlay during Suggest/analyze (Length stays inline).

## Components
- `src/components/ui/ProgressBar.tsx`
- `src/components/editor/EncodeProgressOverlay.tsx`
