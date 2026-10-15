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

## Code quality
- No `@ts-ignore` / `eslint-disable` on media math or graph builder without a linked issue.
- Unit tests required for: `layoutMath`, `magicBytes`, `scoreCandidates`, `buildFilterGraph`, `history`, `anaphora`, `groupCards`, `captionBurn`.
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
