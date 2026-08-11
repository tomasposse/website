import { BACKGROUND, ENTITIES } from './config';
import type { Simulation } from './types';
import type { SimulationParams } from './params';

export type RenderOptions = { ascii: boolean; tileSize: number; tileMode: boolean };

let sampleCanvas: HTMLCanvasElement | null = null;
let sampleContext: CanvasRenderingContext2D | null = null;

export function render(ctx: CanvasRenderingContext2D, sim: Simulation, params: SimulationParams, options: RenderOptions) {
  ctx.clearRect(0, 0, sim.width, sim.height);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, sim.width, sim.height);
  if (options.ascii && options.tileMode) renderAsciiImage(ctx, sim, options.tileSize, params);
  else renderDots(ctx, sim, params);
}

function renderDots(ctx: CanvasRenderingContext2D, sim: Simulation, params: SimulationParams) {
  for (const entity of sim.entities) {
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    for (const particle of entity.particles) {
      ctx.moveTo(particle.x + params.dotRadius, particle.y);
      ctx.arc(particle.x, particle.y, params.dotRadius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function renderAsciiImage(ctx: CanvasRenderingContext2D, sim: Simulation, tileSize: number, params: SimulationParams) {
  const size = Math.max(1, Math.floor(tileSize));
  const columns = Math.ceil(sim.width / size);
  const rows = Math.ceil(sim.height / size);
  const sample = ensureSampleBuffer(columns, rows);
  sample.clearRect(0, 0, columns, rows);
  sample.fillStyle = BACKGROUND;
  sample.fillRect(0, 0, columns, rows);

  // Paint each entity into its own ID buffer. A color pixel is never used to
  // infer ownership after blending: the entity index is preserved per sample.
  const owners = new Int16Array(columns * rows);
  owners.fill(-1);
  const coverage = new Uint16Array(columns * rows);

  for (let entityIndex = 0; entityIndex < sim.entities.length; entityIndex++) {
    const entity = sim.entities[entityIndex];
    for (const particle of entity.particles) {
      const column = Math.floor(particle.x / size);
      const row = Math.floor(particle.y / size);
      if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
      const index = row * columns + column;
      coverage[index]++;
      // The owner is the entity with the highest coverage. This prevents a
      // blended canvas pixel from being assigned to the wrong glyph family.
      if (owners[index] < 0) owners[index] = entityIndex;
    }
  }

  // Use a low-resolution image only for occupancy/brightness. Its RGB values
  // are not used as output colors.
  for (let entityIndex = 0; entityIndex < sim.entities.length; entityIndex++) {
    const entity = sim.entities[entityIndex];
    sample.fillStyle = entity.color;
    for (const particle of entity.particles) {
      sample.fillRect(Math.floor(particle.x / size), Math.floor(particle.y / size), 1, 1);
    }
  }

  const pixels = sample.getImageData(0, 0, columns, rows).data;
  const cellWidth = sim.width / columns;
  const cellHeight = sim.height / rows;
  ctx.font = `${Math.max(6, size)}px ui-monospace,SFMono-Regular,Menlo,monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const entityIndex = owners[index];
      if (entityIndex < 0) continue;
      const entity = ENTITIES[entityIndex];
      const pixel = index * 4;
      const brightness = (pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114) / 255;
      const maxGlyph = Math.max(1, entity.glyphs.length - 1);
      const occupancy = Math.min(1, coverage[index] / 3);
      const density = Math.max(0, Math.min(1, occupancy * 0.65 + brightness * 0.35));
      const glyphIndex = Math.min(maxGlyph, Math.floor(density * (maxGlyph + 1)));
      ctx.fillStyle = entity.color;
      ctx.fillText(entity.glyphs[glyphIndex] || entity.glyphs[0] || '·', column * cellWidth + cellWidth / 2, row * cellHeight + cellHeight / 2);
    }
  }

  void coverage;
}

function ensureSampleBuffer(width: number, height: number) {
  if (!sampleCanvas) sampleCanvas = document.createElement('canvas');
  if (sampleCanvas.width !== width || sampleCanvas.height !== height) {
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!sampleContext) throw new Error('Could not create ASCII sample context');
  return sampleContext;
}
