# SPEC-effects

## Objective

Polish-step Effects: look filters, speed, transforms, fades, source audio, silence jump-cuts with transitions, and text overlays. EditSpec is the sole contract; preview approximates; ffmpeg.wasm encode is truth.

## Anti-goals

Multi-layer NLE, freeform multi-clip timeline, library BGM.

## Rules

### Look (F*)
- F1 `look.preset` ∈ none|vivid|warm|cool|cinema|soft|noir|fade_film; default none.
- F2 Knobs: brightness -1..1, contrast 0.5..2, saturation 0..2, temperature -1..1, vignette 0..1, sharpen 0..1.
- F3 Preset change resets knobs to preset defaults.
- F4 Look after crop/scale, before captions/text.
- F5 Preview CSS approx; show “Preview approx” when non-default look/speed/jumpcuts.

### Speed (S*)
- S1 `source.playbackRate` 0.25..4; default 1.
- S2 `speedSegments` max 10, clip-absolute ms inside window; gaps use global rate.
- S3 Normalize: sort, clamp, drop overlaps/invalids.
- S4 Output duration from timeMap; remap caption/text times.
- S5 Video `setpts`; audio chained `atempo`.
- S6 Preview playbackRate / per-segment best-effort.

### Transform (T*)
- T1 flipX/flipY → hflip/vflip.
- T2 rotateQuarterTurns 0..3.
- T3 Order: trim → probe upright → editor rotate → flip → crop → scale → look → fade → overlays.

### Fade (D*)
- D1 fadeInMs/fadeOutMs 0..2000, ≤ half output duration.
- D2 fade + afade after retime.

### Audio (A*)
- A1 sourceGain 0..2 + sourceMuted.
- A2 Reaction bus stays in reaction panel.
- A3 loudnorm/afftdn after volume.

### Jump cuts (J*)
- J1 `{ enabled, removeSilencesAboveMs 100..5000, transitionMs 0..500 }`.
- J2 Silence from analysis.silenceRanges or transcript gaps.
- J3 No silence data → disable Apply with coach copy.
- J4 Internal segment list; locked window is outer range.
- J5 Max 24 keep segments.

### Transitions (X*)
- X1 Between jump-cut segments only.
- X2 UI: none|dissolve|fade_black; swipe_left → dissolve.
- X3 Default duration from jumpCuts.transitionMs.
- X4 xfade/acrossfade; degrade to hard cut if unsupported.

### Text overlays (O*)
- O1 Max 10; source ms; remap via timeMap.
- O2 drawtext + caption.ttf.
- O3 Canvas preview parity for position/size/color.
- O4 CRUD + drag on preview when selected.

### UX (U*)
- U1 EffectsPanel on Polish step.
- U2 Coach mentions Effects.
- U3 History/undo.
- U4 Per-section reset.

## Acceptance
- [ ] Preset + advanced color encode
- [ ] 0.5x–2x speed + optional segments
- [ ] Flip/rotate/fade/mute
- [ ] Jump cuts with dissolve/fade_black when silence known
- [ ] Text overlay burns in
- [ ] Undo restores Effects
- [ ] Unit tests: timeMap, jumpCutPlan, lookPresets, filter graphs
