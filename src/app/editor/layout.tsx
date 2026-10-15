import type { Metadata } from "next";

export const metadata: Metadata = {
  other: {
    // Documented for operators; actual COOP/COEP set via next.config / vercel.json
    "x-shorts-editor": "sharedarraybuffer-required",
  },
};

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
