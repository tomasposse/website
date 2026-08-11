// Structural configuration for the four identical bodies.
export const DT = 1 / 60;
export const MAX_FRAME = 0.1;
export const SOLVER_PASSES = 4;
export const EDGE_PAD = 2;
export const BACKGROUND = '#04070c';

export type EntityKind = 'ember' | 'wisp' | 'shard' | 'ooze';

export type BlobDef = {
  name: string;
  color: string;             // debug/solid renderer only
  kind: EntityKind;
  glyphs: string;            // this entity's ASCII material
  shade: string;             // bright -> dark shading ramp
};

// Same physical footprint for every entity. Their identities live in their
// material/response, not in size or arbitrary per-entity scales.
export const BLOBS: BlobDef[] = [
  { name: 'Ember', color: '#ff5a6e', kind: 'ember', glyphs: '@#*+-. ', shade: '@%#*+=-:. ' },
  { name: 'Wisp',  color: '#54c8ff', kind: 'wisp',  glyphs: '╱╲╳·  ', shade: '╳╳╱╲·. ' },
  { name: 'Shard', color: '#ffc357', kind: 'shard', glyphs: '◆◇▪▫·  ', shade: '◆◇▪▫·. ' },
  { name: 'Ooze',  color: '#54e6a8', kind: 'ooze',  glyphs: '≈∿~−·  ', shade: '≈∿~−·. ' },
];
export const BLOB_COUNT = BLOBS.length;

export const STARTS = [
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.7, y: 0.7 },
  { x: 0.3, y: 0.7 },
];

// Relationships are qualitative rules, not just different force values.
export type InteractionKind = 'orbit' | 'barrier' | 'exchange' | 'ripple' | 'shear' | 'wander';
export type PairRule = {
  name: string;
  kind: InteractionKind;
  phase: number;
};

function pairIndex(a: number, b: number) {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  if (x === 0 && y === 1) return 0;
  if (x === 0 && y === 2) return 1;
  if (x === 0 && y === 3) return 2;
  if (x === 1 && y === 2) return 3;
  if (x === 1 && y === 3) return 4;
  return 5;
}

export const ruleIndex = pairIndex;

export const RULES: PairRule[] = [
  { name: 'Ember ↔ Wisp / orbit braid', kind: 'orbit', phase: Math.PI / 2 },
  { name: 'Ember ↔ Shard / hard barrier', kind: 'barrier', phase: Math.PI },
  { name: 'Ember ↔ Ooze / momentum exchange', kind: 'exchange', phase: -Math.PI / 2 },
  { name: 'Wisp ↔ Shard / radial ripple', kind: 'ripple', phase: Math.PI / 4 },
  { name: 'Wisp ↔ Ooze / tangential shear', kind: 'shear', phase: -Math.PI / 4 },
  { name: 'Shard ↔ Ooze / rotating drift', kind: 'wander', phase: 0 },
];
