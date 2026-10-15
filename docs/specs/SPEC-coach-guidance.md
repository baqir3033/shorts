# SPEC-coach-guidance

## Objective

Exactly one short per edit pass, with a **NextAction** coach that always answers “what do I press now?”

## Product

- One active short (`EditSpec` window). No multi-short count or encode queue.
- Suggest returns up to 5 moment cards; picking one replaces the active window.

## Rules (C*)

| ID | Rule |
|----|------|
| C1 | Exactly one `NextAction` active at a time (or wait/none while busy). |
| C2 | Action fields: `id`, `title`, `body`, `target`, `emphasize`. |
| C3 | Cue shows badge `(1)` + title near the target; body in step rail / sticky strip. |
| C4 | Completing the action clears it; resolver recomputes immediately. |
| C5 | Entering a step re-evaluates NextAction. |
| C6 | While analyze/encode busy → wait action, no pulse on disabled Continue. |
| C7 | Errors → `recover_*` actions (Manual / Retry). |
| C8 | Cue text is accessible; pulse is not the only signal. |
| C9 | Soft-dismiss (X) suppresses that `id` until step re-enter. |

## Targets

`continue` | `placeManual` | `suggest` | `timeline` | `momentCard` | `effectsDetectSilence` | `renderMp4` | `download` | `none`

## Interface

- `resolveNextAction(snapshot, opts?) → NextAction`
- UI: `CoachCue`, `data-coach-target`, `EditorStepRail`

## Acceptance

- [ ] No “How many shorts?” UI
- [ ] Length / Place / Polish / Render always expose a clear next control
- [ ] Unit tests cover the action matrix (≥12 cases)
