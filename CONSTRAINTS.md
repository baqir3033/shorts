# CONSTRAINTS — Shorts Studio

Quality bar for agents and humans. Do not weaken these without an explicit decision.

## Product caps
| Constraint | Value |
|------------|-------|
| Max source size | 200 MB |
| Max duration | 15 minutes |
| Max projects / user | 7 (FIFO) |
| Max variants / project | 3 |
| Output | 1080×1920 · 30 fps · H.264/AAC/MP4 · ~8 Mbps |
| PiP size | 5–25% |
| Edit history depth | 30 |
| Timeline selection | Locked length `L`; slide-only window (`endMs - startMs === L`) |
| Look presets | none, vivid, warm, cool, cinema, soft, noir, fade_film |
| Playback rate | 0.25×–4× (global + ≤10 segments) |
| Text overlays | ≤10 |
| Jump-cut keep segments | ≤24 |
| Shorts per edit pass | 1 (no multi-short queue) |
| Suggest moment cards | ≤5 (pick one) |

## Coach guidance (NextAction)
- Exactly one primary next action at a time; badge `(1)` + accessible copy.
- Busy analyze/encode never pulses a disabled Continue.
- Soft-dismiss suppresses an action id until the step is re-entered.
- See `docs/specs/SPEC-coach-guidance.md`.

## Single short
- No “How many shorts?” control. Suggest cards replace the active window; they do not queue encodes.
- Status UI must not show “Clip N of M” batch language.

## Effects (Polish step)
- Look after crop/scale; captions/text after look. Encode is truth; preview may be approx.
- Preset change resets advanced color knobs to that preset’s defaults.
- Speed/jump-cuts change **output** duration; locked window still defines the **source** range.
- `sourceMuted` forces effective source gain 0; reaction bus stays separate.
- Silence removal: on-device audio detect → cut gaps → refill harvest until kept speech ≈ target length `L`.
- Transitions only between keep segments (`none` | `dissolve` | `fade_black`).
- No library BGM in product path (schema stub unused).
- See `docs/specs/SPEC-effects.md`.

## Timeline selection (locked window)
- Length is chosen before placement (presets or custom). Edges are never dragged to resize.
- Sliding updates `startMs` only; `endMs = startMs + L`, clamped to `[0, durationMs - L]`.
- AI candidates snap the same locked box; manual refine remains available.
- Step coach order: Length → Place clip → Polish → Render. Render is gated until place is confirmed.
- See `docs/specs/SPEC-timeline-selection.md`.

## Code quality
- No `@ts-ignore` / `eslint-disable` on media math or graph builder without a linked issue.
- Unit tests required for: `layoutMath`, `magicBytes`, `scoreCandidates`, `buildFilterGraph`, `history`, `anaphora`, `groupCards`, `captionBurn`, `window`, `timeMap`, `jumpCutPlan`, `lookPresets`, `nextAction`.
- `EditSpec` must pass Zod `.strict()` parse before encode.
- Ingest error codes are stable API surface — do not rename.

## Security
- No URL import / SSRF surface.
- Ownership checks on every project-scoped API route.
- Never trust `Content-Type` / `file.type` alone for media.
- Secrets only in env (`AUTH_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`).

## Performance / Hobby
- No server-side FFmpeg or Whisper / embeddings / sentiment / LLM.
- Lazy-load ffmpeg.wasm / Whisper / MiniLM / DistilBERT / optional Qwen only when needed.
- Editor route sets COOP/COEP; do not apply globally (breaks OAuth popups).
- Safari-optimised mode skips Whisper + deep brain models by default.

## Degrade matrix
| Failure | Behavior |
|---------|----------|
| Whisper OOM / missing | `partial` + block Suggest (Manual trim) |
| MediaPipe missing | skin-tone heuristic faces |
| Blob / Neon missing | IndexedDB local-only mode |
| Encode OOM | `ENCODE_OOM`, keep EditSpec, allow retry |
| Embeddings OOM / unavailable | hash-embed fallback + `embeddings_*` degradation |
| Sentiment model missing | heuristic intensity + `sentiment_heuristic` |
| Local LLM OOM / skip | template title/reason; disable further LLM loads |
| `afftdn` missing in ffmpeg.wasm | strip denoise filter; keep loudnorm + highpass |
| Two-pass encode fails | single-pass CRF 18 + preset slow fallback |
| `xfade` unsupported in wasm | hard cut between jump-cut segments + `transitions_degraded` |
| Long `atempo` chain | clamp/split rates; warn `atempo_chain_long` |
| Jump cut with no silence data | UI disables Apply; encode ignores jumpCuts.enabled |
