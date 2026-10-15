# Shorts Studio

Expert-grade **AI Video-to-Shorts** editor designed for **Vercel Hobby**:

- Local video upload only (no URL import)
- Free on-device analysis (Whisper / MediaPipe when available, heuristics otherwise)
- Dumb client execution: AI writes `EditSpec`, ffmpeg.wasm only executes it
- Customizable layouts: 50/50, top/bottom ratios, PiP 5–25%
- Per-user FIFO of **7 projects** (IndexedDB always; Neon + Blob when configured)

## Quick start

```bash
npm install
cp .env.example .env.local
# set AUTH_SECRET at minimum (openssl rand -base64 32)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Continue as guest → upload a local MP4/MOV.

## Optional cloud (Hobby)

1. Neon Free via Vercel Marketplace → `DATABASE_URL`
2. Vercel Blob → `BLOB_READ_WRITE_TOKEN`
3. `npm run db:push`

Without these, the app runs fully in **local IndexedDB mode**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (layout math, sniff, scoring, graphs) |
| `npm run build` | Production build |
| `npm run db:push` | Push Drizzle schema to Neon |

## Architecture

See `docs/specs/` and `CONSTRAINTS.md`. Module seams:

- `src/media/ingest` — upload / probe / IndexedDB / FIFO
- `src/media/analysis` — scenes, faces, whisper, scoring
- `src/media/edit-spec` — Zod EditSpec + history
- `src/media/render` — layoutMath, filter graph, ffmpeg encode
