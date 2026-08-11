import { BACKGROUND, BLOBS } from './config';
import type { Params } from './params';
import type { World } from './types';

export type RenderOptions = { ascii: boolean; tiles: number };

type Sample = { x: number; y: number; body: number };

export function draw(ctx: CanvasRenderingContext2D, world: World, params: Params, opts: RenderOptions) {
  ctx.clearRect(0, 0, world.width, world.height);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, world.width, world.height);
  if (opts.ascii) drawAscii(ctx, world, opts.tiles);
  else drawSolid(ctx, world, params);
}

function drawSolid(ctx: CanvasRenderingContext2D, world: World, params: Params) {
  const radius = Math.max(0.5, params.dot);
  for (const blob of world.blobs) {
    ctx.beginPath();
    for (const p of blob.particles) {
      ctx.moveTo(p.x + radius, p.y);
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = blob.color;
    ctx.fill();
  }
}

// ASCII is a material renderer, not a nearest-particle dump:
// - each body owns a glyph vocabulary
// - density picks the glyph within that vocabulary
// - a finite-difference density normal provides fake light/shading
// - the light angle makes highlights and shadow edges readable
function drawAscii(ctx: CanvasRenderingContext2D, world: World, tiles: number) {
  const cell = Math.max(5, world.width / Math.max(1, tiles));
  const cols = Math.ceil(world.width / cell);
  const rows = Math.ceil(world.height / cell);
  const buckets = new Map<number, Sample[]>();
  const key = (x: number, y: number) => y * cols + x;

  for (let body = 0; body < world.blobs.length; body++) {
    for (const p of world.blobs[body].particles) {
      const x = Math.max(0, Math.min(cols - 1, Math.floor(p.x / cell)));
      const y = Math.max(0, Math.min(rows - 1, Math.floor(p.y / cell)));
      const k = key(x, y);
      const list = buckets.get(k);
      if (list) list.push({ x: p.x, y: p.y, body });
      else buckets.set(k, [{ x: p.x, y: p.y, body }]);
    }
  }

  const samplesNear = (col: number, row: number) => {
    const result: Sample[] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = col + dx, y = row + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const list = buckets.get(key(x, y));
      if (list) result.push(...list);
    }
    return result;
  };

  const densityAt = (x: number, y: number, candidates: Sample[]) => {
    let density = 0;
    for (const p of candidates) {
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      density += Math.exp(-d2 / (cell * cell * 0.72));
    }
    return density;
  };

  ctx.font = `${Math.max(6, Math.floor(cell * 1.08))}px ui-monospace,SFMono-Regular,Menlo,monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lightX = -0.65;
  const lightY = -0.76;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cell;
      const y = (row + 0.5) * cell;
      const candidates = samplesNear(col, row);
      if (!candidates.length) continue;

      let nearest = candidates[0];
      let nearestD2 = Infinity;
      for (const p of candidates) {
        const dx = p.x - x, dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) { nearestD2 = d2; nearest = p; }
      }

      const density = Math.min(1, densityAt(x, y, candidates) / 4.5);
      const left = densityAt(x - cell * 0.55, y, candidates);
      const right = densityAt(x + cell * 0.55, y, candidates);
      const up = densityAt(x, y - cell * 0.55, candidates);
      const down = densityAt(x, y + cell * 0.55, candidates);
      const nx = left - right;
      const ny = up - down;
      const normalLength = Math.hypot(nx, ny) || 1;
      const lighting = Math.max(0, Math.min(1, 0.5 + ((nx / normalLength) * lightX + (ny / normalLength) * lightY) * 0.5));
      const value = Math.max(0, Math.min(1, density * 0.72 + lighting * 0.28));
      const material = BLOBS[nearest.body];
      const ramp = material.shade || material.glyphs;
      const index = Math.min(ramp.length - 1, Math.floor((1 - value) * (ramp.length - 1)));
      const glyph = ramp[index] || ' ';
      if (glyph === ' ') continue;
      ctx.fillStyle = material.color;
      ctx.fillText(glyph, x, y);
    }
  }
}
