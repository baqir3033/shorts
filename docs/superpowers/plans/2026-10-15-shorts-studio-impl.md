# Shorts Studio Implementation Plan

> Vertical slices: ingest → manual EditSpec → encode → analysis → polish

## Slice 1 — Ingest (done)
- [x] Magic-byte sniff + probe + validate
- [x] IndexedDB cache + local FIFO
- [x] Upload dropzone + error taxonomy
- [x] Thin `/api/projects` with cloud FIFO when Neon configured

## Slice 2 — Manual edit + preview (done)
- [x] EditSpec Zod schema + history undo/redo
- [x] layoutMath shared by preview + encoder
- [x] Editor studio timeline / layout knobs / crop
- [x] Canvas PreviewStage

## Slice 3 — Dumb encode (done)
- [x] buildFilterGraph
- [x] encodeEditSpec with ffmpeg.wasm
- [x] COOP/COEP on `/editor/*`
- [x] Download + optional Blob register

## Slice 4 — Free AI (done)
- [x] Frame sample / scenes / faces / Whisper adapters
- [x] scoreCandidates + recommendLayouts
- [x] Analyze button wires into EditSpec
- [x] Safari-optimised degrade path

## Slice 5 — Specs & constraints (done)
- [x] SPEC-ingest / analysis / edit-spec / render-executor
- [x] CONSTRAINTS.md
- [x] Unit tests for media math

## Next (nice-to-have)
- NTH-1 blurred background fill UI toggle
- NTH-2 silence remover
- NTH-3–10 as documented in the Expert Media Plan
