# SPEC-ingest

## Objective
Accept a local video file, validate it, probe metadata, cache locally, and optionally persist to Blob under a 7-project FIFO.

## Interface
`ingestLocalFile(file, opts) → ProjectMedia`

## Acceptance criteria
- [ ] Rejects files over 200 MB with `FILE_TOO_LARGE`
- [ ] Rejects non-ISO-BMFF containers with `CONTAINER_UNSUPPORTED`
- [ ] Duration must be in (1s, 15min]
- [ ] Min edge ≥ 480px, max edge ≤ 4096px
- [ ] Never trusts `file.type` alone — magic-byte sniff required
- [ ] Stores File in IndexedDB keyed by projectId
- [ ] When local count ≥ 7, requires FIFO confirmation then deletes oldest
- [ ] No URL import paths exist

## Non-goals
Server-side demux, YouTube/social download, WebM/MKV in Release 1.
