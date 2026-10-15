"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, ssrMatches = false): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => ssrMatches,
  );
}

/** Tailwind `lg` breakpoint (1024px). */
export function useIsLg(): boolean {
  return useMediaQuery("(min-width: 1024px)", true);
}
