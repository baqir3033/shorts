import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shorts Studio",
  description:
    "Local-upload AI video-to-shorts editor with dumb-client FFmpeg execution",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${syne.variable} ${dmSans.variable} min-h-screen bg-zinc-950 font-[family-name:var(--font-body)] text-zinc-100 antialiased`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
