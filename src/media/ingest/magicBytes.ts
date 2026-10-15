import { ALLOWED_CONTAINERS } from "@/lib/constants";

/** ISO BMFF brands commonly found in MP4/MOV/M4V ftyp boxes. */
const BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4A ",
  "qt  ",
  "MSNV",
  "ndas",
  "dash",
]);

export type SniffResult =
  | { ok: true; container: (typeof ALLOWED_CONTAINERS)[number] }
  | { ok: false; reason: string };

/**
 * Sniff container from magic bytes — never trust file.type alone.
 * Looks for an `ftyp` box in the first 32 bytes (ISO BMFF).
 */
export function sniffContainer(bytes: ArrayBuffer | Uint8Array): SniffResult {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength < 12) {
    return { ok: false, reason: "File too small to identify container" };
  }

  // Reject well-known unsupported signatures early
  if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) {
    return { ok: false, reason: "Matroska/WebM/MKV is not supported" };
  }
  if (
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46
  ) {
    return { ok: false, reason: "AVI/RIFF is not supported" };
  }

  // Find ftyp: size(4) + 'ftyp'(4) + major_brand(4)
  for (let i = 0; i + 12 <= Math.min(u8.byteLength, 64); i++) {
    const tag = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]);
    if (tag !== "ftyp") continue;
    const brand = String.fromCharCode(
      u8[i + 8],
      u8[i + 9],
      u8[i + 10],
      u8[i + 11],
    );
    if (!BRANDS.has(brand) && !BRANDS.has(brand.trimEnd() + " ")) {
      // Still accept unknown brands inside ftyp — ISO BMFF family
    }
    if (brand === "qt  ") {
      return { ok: true, container: "mov" };
    }
    if (brand.startsWith("M4V") || brand.startsWith("M4A")) {
      return { ok: true, container: "m4v" };
    }
    return { ok: true, container: "mp4" };
  }

  return { ok: false, reason: "No ISO BMFF ftyp box found" };
}

export function sniffImage(
  bytes: ArrayBuffer | Uint8Array,
): "jpeg" | "png" | "webp" | null {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength < 3) return null;
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "jpeg";
  if (
    u8.byteLength >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    return "png";
  }
  if (u8.byteLength >= 12) {
    const riff = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    const webp = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
    if (riff === "RIFF" && webp === "WEBP") return "webp";
  }
  return null;
}
