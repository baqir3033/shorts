# SPEC-analysis

## Objective
Produce evidence-backed clip candidates and layout suggestions using free on-device models only.

## Interface
`analyze(file, opts) → AnalysisResult`

## Acceptance criteria
- [ ] Samples frames at ~2 fps, capped at 1800 frames
- [ ] Scene detection with hysteresis + merge gap 300ms
- [ ] Face detection with MediaPipe when available, heuristic fallback otherwise
- [ ] Whisper via Transformers.js when available; Safari mode skips Whisper
- [ ] Partial success: `status: "partial"` with `degradations[]` when ASR fails
- [ ] Candidates scored deterministically (hook/clarity/context/face/ending)
- [ ] Top K ≤ 8, IoU-on-time dedupe > 0.6
- [ ] Never emits FFmpeg strings — only AnalysisResult / EditSpec fields
- [ ] Runs heavy work without blocking UI (progress callbacks)

## Non-goals
Paid cloud ASR/LLM APIs, guaranteed face tracking accuracy on all footage.
