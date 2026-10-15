import type { LayoutSuggestion } from "@/media/edit-spec/types";
import type { FaceSample } from "./faces";
import type { ProbeResult } from "@/media/ingest/types";

/** PiP-only recommendations. */
export function recommendLayouts(input: {
  probe: ProbeResult;
  faces: FaceSample[];
  hasReactionIntent?: boolean;
}): LayoutSuggestion[] {
  void input.probe;
  const faceRatio =
    input.faces.length === 0
      ? 0
      : input.faces.filter((f) => f.primary).length / input.faces.length;

  return [
    {
      layout: {
        type: "pip",
        anchor: "tr",
        sizePercent: 18,
        marginPx: 24,
        fit: "cover",
      },
      score: faceRatio >= 0.4 ? 0.92 : 0.8,
      reason: "Picture-in-picture · top right 18%",
    },
    {
      layout: {
        type: "pip",
        anchor: "br",
        sizePercent: 16,
        marginPx: 20,
        fit: "cover",
      },
      score: 0.7,
      reason: "Picture-in-picture · bottom right 16%",
    },
    {
      layout: {
        type: "pip",
        anchor: "tl",
        sizePercent: 18,
        marginPx: 24,
        fit: "cover",
      },
      score: 0.65,
      reason: "Picture-in-picture · top left 18%",
    },
  ];
}
