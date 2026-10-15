# SPEC-edit-spec

## Objective
Versioned EditSpec is the sole contract between recommendations and rendering. Manual edits and AI recommendations both patch the same schema.

## Interface
- `parseEditSpec(input) → EditSpec` (Zod, strict)
- `defaultEditSpec(durationMs, cropNorm) → EditSpec`
- `recommendLayouts(...) → LayoutSuggestion[]`
- History: `pushSpec / undo / redo` (max 30)

## Acceptance criteria
- [ ] `version: 1` required; unknown versions rejected
- [ ] Layouts: `split_vertical`, `split_horizontal`, `pip` with documented knobs
- [ ] PiP sizePercent clamped 5–25
- [ ] primaryRatio clamped 0.3–0.7
- [ ] endMs > startMs
- [ ] Local-first persist to IndexedDB before Neon sync
- [ ] Undo/redo stack clears future on new push
- [ ] Variants supported (`main` default); analysis reused across variants

## Non-goals
Renderer inventing crops; storing media bytes inside EditSpec.
