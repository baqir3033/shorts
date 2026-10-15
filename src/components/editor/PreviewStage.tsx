"use client";

import { useEffect, useRef } from "react";
import type { Box, EditSpec } from "@/media/edit-spec/types";
import { groupWordsIntoCards } from "@/media/analysis/captions/groupCards";
import type { PixelRect } from "@/media/render/layoutMath";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/lib/constants";

type Props = {
  videoUrl: string;
  spec: EditSpec;
  panes: {
    primary?: PixelRect;
    secondary?: PixelRect;
    full?: PixelRect;
    overlay?: PixelRect;
  };
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onCropChange?: (crop: Box) => void;
};

/** Canvas preview — full-frame source; PiP + karaoke captions matching burn-in. */
export function PreviewStage({
  videoUrl,
  spec,
  panes,
  videoRef,
  onCropChange,
}: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mediaRef = videoRef ?? internalRef;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    crop: Box;
  } | null>(null);
  const cropRef = useRef(spec.source.cropNorm);
  cropRef.current = spec.source.cropNorm;
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    const video = mediaRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const s = specRef.current;
      const w = OUTPUT_WIDTH;
      const h = OUTPUT_HEIGHT;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      if (video.readyState >= 2) {
        const crop = cropRef.current;
        const sx = crop.x * video.videoWidth;
        const sy = crop.y * video.videoHeight;
        const sw = Math.max(1, crop.w * video.videoWidth);
        const sh = Math.max(1, crop.h * video.videoHeight);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      }

      const showPip =
        s.layout.type === "pip" &&
        s.reaction?.kind &&
        s.reaction.kind !== "none" &&
        panes.overlay;

      if (showPip && panes.overlay) {
        ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
        ctx.fillRect(
          panes.overlay.x,
          panes.overlay.y,
          panes.overlay.w,
          panes.overlay.h,
        );
        ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
        ctx.lineWidth = 4;
        ctx.strokeRect(
          panes.overlay.x,
          panes.overlay.y,
          panes.overlay.w,
          panes.overlay.h,
        );
        ctx.fillStyle = "#fff";
        ctx.font = "28px sans-serif";
        ctx.fillText("PiP", panes.overlay.x + 12, panes.overlay.y + 36);
      }

      // Karaoke captions — times are clip-relative; map wall clock → clip ms
      if (s.captions?.enabled && s.captions.words.length) {
        const clipStart = s.source.startMs;
        const tMs = Math.max(0, video.currentTime * 1000 - clipStart);
        drawCaptions(ctx, w, h, s, tMs);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const onReady = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("play", onReady);
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("play", onReady);
    };
  }, [videoUrl, spec, panes, mediaRef]);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;
    const onTime = () => {
      const start = spec.source.startMs / 1000;
      const end = spec.source.endMs / 1000;
      if (video.currentTime < start - 0.05) video.currentTime = start;
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = start;
      }
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [spec.source.startMs, spec.source.endMs, mediaRef]);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;
    const start = spec.source.startMs / 1000;
    if (Math.abs(video.currentTime - start) > 0.4) {
      video.currentTime = start;
    }
  }, [spec.source.startMs, mediaRef]);

  const clampCrop = (c: Box): Box => {
    const cw = Math.min(1, Math.max(0.05, c.w));
    const ch = Math.min(1, Math.max(0.05, c.h));
    const x = Math.min(1 - cw, Math.max(0, c.x));
    const y = Math.min(1 - ch, Math.max(0, c.y));
    return { x, y, w: cw, h: ch };
  };

  return (
    <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/50">
      <video
        ref={mediaRef}
        src={videoUrl}
        className="hidden"
        playsInline
        loop={false}
      />
      <canvas
        ref={canvasRef}
        width={OUTPUT_WIDTH}
        height={OUTPUT_HEIGHT}
        className={`h-auto w-full ${onCropChange ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={(e) => {
          if (!onCropChange) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.setPointerCapture(e.pointerId);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            crop: { ...cropRef.current },
          };
        }}
        onPointerMove={(e) => {
          if (!onCropChange || !dragRef.current) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const dx = (e.clientX - dragRef.current.startX) / rect.width;
          const dy = (e.clientY - dragRef.current.startY) / rect.height;
          const next = clampCrop({
            ...dragRef.current.crop,
            x: dragRef.current.crop.x - dx * dragRef.current.crop.w,
            y: dragRef.current.crop.y - dy * dragRef.current.crop.h,
          });
          onCropChange(next);
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          canvasRef.current?.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
      <div className="absolute bottom-3 left-3 right-3 flex justify-between text-[10px] text-zinc-300">
        <span>
          {(spec.source.startMs / 1000).toFixed(1)}s –{" "}
          {(spec.source.endMs / 1000).toFixed(1)}s
        </span>
        <span>{onCropChange ? "Drag to pan crop · " : ""}1080×1920</span>
      </div>
    </div>
  );
}

function drawCaptions(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: EditSpec,
  tMs: number,
) {
  const style = spec.captions!.styleId;
  const cards = groupWordsIntoCards(spec.captions!.words);
  const card = cards.find((c) => tMs >= c.startMs && tMs < c.endMs);
  if (!card) return;

  const y = h * 0.78;
  const baseSize = style === "word-by-word-pop" ? 52 : 56;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dim card line
  ctx.font = `bold ${baseSize}px "Arial Black", Impact, sans-serif`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = style === "bold-yellow-black" ? "#ccc" : "#ddd";
  ctx.strokeText(card.text, w / 2, y);
  ctx.fillText(card.text, w / 2, y);

  const active = card.words.find(
    (word) => tMs >= word.startMs && tMs < word.endMs,
  );
  if (!active) return;

  const emph = !!active.emphasis;
  const hiSize = emph
    ? style === "word-by-word-pop"
      ? 72
      : 68
    : style === "word-by-word-pop"
      ? 64
      : 60;

  ctx.font = `bold ${hiSize}px "Arial Black", Impact, sans-serif`;
  const metrics = ctx.measureText(active.text);
  const tw = metrics.width;
  const th = hiSize * 1.2;

  if (style === "bold-yellow-black") {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(w / 2 - tw / 2 - 16, y - th / 2, tw + 32, th);
  }

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#000";
  ctx.fillStyle =
    style === "bold-yellow-black" ? "#ffe600" : emph ? "#ffcc00" : "#fff";
  ctx.strokeText(active.text, w / 2, y);
  ctx.fillText(active.text, w / 2, y);
}
