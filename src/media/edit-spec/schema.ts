import { z } from "zod";
import {
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  PIP_SIZE_MAX,
  PIP_SIZE_MIN,
} from "@/lib/constants";
// OUTPUT_* used in defaultEditSpec
import type { EditSpec } from "./types";

const BoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const LayoutSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("split_vertical"),
    primaryRatio: z.number().min(0.3).max(0.7),
  }),
  z.object({
    type: z.literal("split_horizontal"),
    primaryRatio: z.number().min(0.3).max(0.7),
    primaryOn: z.enum(["top", "bottom"]),
  }),
  z.object({
    type: z.literal("pip"),
    anchor: z.enum(["tl", "tr", "bl", "br"]),
    sizePercent: z.number().min(PIP_SIZE_MIN).max(PIP_SIZE_MAX),
    marginPx: z.number().min(0).max(200),
    fit: z.enum(["cover", "contain"]).optional(),
  }),
]);

export const EditSpecSchema = z
  .object({
    version: z.literal(1),
    source: z.object({
      startMs: z.number().min(0),
      endMs: z.number().positive(),
      cropNorm: BoxSchema,
      backgroundFill: z.enum(["blur", "solid", "none"]).optional(),
      backgroundColor: z.string().optional(),
      speedSegments: z
        .array(
          z.object({
            startMs: z.number().min(0),
            endMs: z.number().positive(),
            rate: z.number().min(0.25).max(4),
          }),
        )
        .max(10)
        .optional(),
    }),
    reaction: z
      .object({
        kind: z.enum(["video", "image", "none"]),
        offsetMs: z.number(),
        audio: z.object({
          sourceGain: z.number().min(0).max(2),
          reactionGain: z.number().min(0).max(2),
          ducking: z.boolean(),
        }),
      })
      .optional(),
    layout: LayoutSchema,
    captions: z
      .object({
        enabled: z.boolean(),
        styleId: z.enum([
          "bold-white-outline",
          "bold-yellow-black",
          "word-by-word-pop",
        ]),
        words: z.array(
          z.object({
            startMs: z.number().min(0),
            endMs: z.number().min(0),
            text: z.string(),
          }),
        ),
      })
      .optional(),
    textOverlays: z
      .array(
        z.object({
          id: z.string(),
          text: z.string().max(200),
          startMs: z.number().min(0),
          endMs: z.number().min(0),
          positionNorm: z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          }),
          fontSize: z.number().min(24).max(120),
          fontFamily: z.enum(["bold", "mono", "handwritten"]),
          color: z.string(),
          bgColor: z.string().optional(),
          animation: z.enum(["none", "pop", "slide_up"]),
        }),
      )
      .max(10)
      .optional(),
    backgroundMusic: z
      .object({
        trackId: z.string(),
        gainDb: z.number(),
        fadeInMs: z.number().min(0),
        fadeOutMs: z.number().min(0),
        offset: z.union([z.literal("start"), z.number()]),
      })
      .optional(),
    jumpCuts: z
      .object({
        removeSilencesAboveMs: z.number().min(100).max(5000),
        transitionMs: z.number().min(0).max(500),
      })
      .optional(),
    transitions: z
      .array(
        z.object({
          afterSegmentIndex: z.number().int().min(0),
          type: z.enum(["none", "dissolve", "fade_black", "swipe_left"]),
          durationMs: z.number().min(0).max(500),
        }),
      )
      .optional(),
    output: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      fps: z.number().positive(),
      videoBitrate: z.string(),
    }),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.source.endMs <= spec.source.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endMs must be greater than startMs",
        path: ["source", "endMs"],
      });
    }
  });

export function parseEditSpec(input: unknown): EditSpec {
  return EditSpecSchema.parse(input) as EditSpec;
}

export function defaultEditSpec(durationMs: number, cropNorm: EditSpec["source"]["cropNorm"]): EditSpec {
  const endMs = Math.min(durationMs, 30_000);
  return {
    version: 1,
    source: {
      startMs: 0,
      endMs: Math.max(1000, endMs),
      cropNorm,
      backgroundFill: "none",
    },
    reaction: {
      kind: "none",
      offsetMs: 0,
      audio: { sourceGain: 1, reactionGain: 0.8, ducking: true },
    },
    layout: {
      type: "pip",
      anchor: "tr",
      sizePercent: 18,
      marginPx: 24,
      fit: "cover",
    },
    captions: {
      enabled: false,
      styleId: "bold-white-outline",
      words: [],
    },
    output: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      fps: OUTPUT_FPS,
      videoBitrate: "8M",
    },
  };
}
