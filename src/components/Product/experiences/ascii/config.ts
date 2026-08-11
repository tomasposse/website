export const STEP_SECONDS = 1 / 60;
export const MAX_ELAPSED_SECONDS = 0.1;
export const SOLVER_PASSES = 6;
export const EDGE_MARGIN = 4;
export const BACKGROUND = '#04070c';

export type EntityDefinition = {
  name: string;
  color: string;
  glyphs: string;
  shade: string;
  response: number;
};

export const ENTITIES: readonly EntityDefinition[] = [
  { name: 'Ember', color: '#ff5a6e', glyphs: '@#*+-. ', shade: '@%#*+=-:. ', response: 1 },
  { name: 'Wisp', color: '#54c8ff', glyphs: '╳╱╲·. ', shade: '╳╱╲·. ', response: 1.2 },
  { name: 'Shard', color: '#ffc357', glyphs: '◆◇▪▫·  ', shade: '◆◇▪▫·  ', response: 0.9 },
  { name: 'Ooze', color: '#54e6a8', glyphs: '≈∿~−· ', shade: '≈∿~−· ', response: 1.1 },
];

export const START_POSITIONS = [
  { x: 0.26, y: 0.26 },
  { x: 0.74, y: 0.26 },
  { x: 0.74, y: 0.74 },
  { x: 0.26, y: 0.74 },
] as const;
