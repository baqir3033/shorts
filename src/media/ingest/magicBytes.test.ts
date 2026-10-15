import { describe, expect, it } from "vitest";
import { sniffContainer, sniffImage } from "./magicBytes";

function ftyp(brand: string): Uint8Array {
  const buf = new Uint8Array(32);
  buf[0] = 0;
  buf[1] = 0;
  buf[2] = 0;
  buf[3] = 24;
  buf.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  for (let i = 0; i < 4; i++) buf[8 + i] = brand.charCodeAt(i);
  return buf;
}

describe("magicBytes", () => {
  it("detects mp4 ftyp", () => {
    const r = sniffContainer(ftyp("isom"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.container).toBe("mp4");
  });

  it("detects qt mov", () => {
    const r = sniffContainer(ftyp("qt  "));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.container).toBe("mov");
  });

  it("rejects matroska", () => {
    const mkv = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    const r = sniffContainer(mkv);
    expect(r.ok).toBe(false);
  });

  it("sniffs jpeg/png", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(
      sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("png");
  });
});
