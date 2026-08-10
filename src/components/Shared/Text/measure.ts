export type Glyph = { ch: string; x: number; w: number; top: number; bottom: number };

export type WordMetrics = { width: number; glyphs: Glyph[] };

// Metrics the whole bar is laid out in (SVG viewBox units).
export const BASELINE_Y = 52;
export const BAND_ASCENT = 82;
export const BAND_DESCENT = 26;

export function measureWord(
  text: string,
  fontFamily: string,
  weight: string,
  refFs: number
): WordMetrics | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${weight} ${refFs}px ${fontFamily}`;
  const glyphs: Glyph[] = [];
  let x = 0;
  for (const ch of text) {
    const m = ctx.measureText(ch);
    glyphs.push({
      ch,
      x,
      w: m.width,
      // Translate canvas (baseline at 0) into SVG coords where baseline sits at BASELINE_Y.
      top: BASELINE_Y - m.actualBoundingBoxAscent,
      bottom: BASELINE_Y + m.actualBoundingBoxDescent,
    });
    x += m.width;
  }
  return { width: x, glyphs };
}
