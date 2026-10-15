# SPEC-timeline-selection

## Objective

Manual (and AI-refined) clip placement uses a **locked-duration** window on the full source timeline. The user picks length first (e.g. 30s / 40s), then slides a highlighted box to choose which chunk of that exact length to keep. Edges do not resize.

## Rules

| ID | Rule |
|----|------|
| R1 | After length `L` is chosen, `endMs - startMs === L` always. If source is shorter than `L`, clamp `L = durationMs` and the window is the full file. |
| R2 | Dragging the selection moves `startMs` only; `endMs = startMs + L`. No edge handles. Clicking the track jumps/recenters the window so the click falls inside it when possible. |
| R3 | `startMs` stays in `[0, durationMs - L]`. |
| R4 | Playhead can scrub the full source; “preview this short” loops only inside the window. Moving the window seeks preview to the new `startMs`. |
| R5 | Changing the length preset resets or reclamps the window; edges stay locked. |
| R6 | AI Suggest returns candidates of length `L`; picking a card snaps the same locked box to that `startMs`. Manual slide still works after AI. |
| R7 | Window moves go through existing EditSpec history (undo/redo). |
| R8 | Step coach: user cannot reach Render until length + window are confirmed; coach copy is mandatory, not decorative. |

## Interface

- `resolveLengthMs(requestedMs, durationMs) → number`
- `clampWindow(startMs, lengthMs, durationMs) → { startMs, endMs, lengthMs }`
- `moveWindow(startMs, deltaMs, lengthMs, durationMs) → { startMs, endMs, lengthMs }`
- `windowFromLength(lengthMs, durationMs) → { startMs, endMs, lengthMs }` (default at `0`)
- `jumpWindowToMs(clickMs, lengthMs, durationMs) → { startMs, endMs, lengthMs }`

UI: `SourceTimeline` (controlled) + `EditorStepRail` (length → place → polish → render).

## Acceptance criteria

- [ ] Selection width on the full track always represents locked `L` (except when source &lt; requested L).
- [ ] Drag never changes duration; only start.
- [ ] EditSpec `source.startMs` / `endMs` remain the sole encode window.
- [ ] Step rail gates forward progress; past steps remain reachable.

## Non-goals (v1)

Filmstrip thumbnails, waveform, pinch-zoom, multi-layer NLE, unlocked edge trim on this path.
