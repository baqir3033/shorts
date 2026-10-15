# SPEC-render-executor

## Objective
Dumb client executor: EditSpec → MP4 via ffmpeg.wasm. Preview and encode share `layoutMath`.

## Interface
- `layoutPanes / split* / pipRect / suggestCrop9x16`
- `buildFilterGraph(spec, opts) → FilterGraphResult`
- `encodeEditSpec(spec, inputs) → EncodeResult`

## Acceptance criteria
- [ ] Validates EditSpec before encode
- [ ] Output 1080×1920, 30fps, yuv420p, H.264, AAC, `+faststart`
- [ ] Encodes trimmed window only (not full source)
- [ ] Single-flight mutex (second encode → `ENCODE_BUSY`)
- [ ] Watchdog timeout → `ENCODE_TIMEOUT`
- [ ] Layout geometry unit-tested (50/50, 40/60, PiP 10%, etc.)
- [ ] Preview canvas uses same pane rects as filter graph
- [ ] COOP/COEP headers on `/editor/*` for SharedArrayBuffer
- [ ] Never calls analysis/AI modules

## Non-goals
Server-side FFmpeg, Celery workers, HDR tone mapping in R1.
