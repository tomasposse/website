export type ColorName = 'red' | 'blue' | 'yellow' | 'green';
export const COLOR_NAMES: readonly ColorName[] = ['red', 'blue', 'yellow', 'green'];

export type InteractionRule = {
  label: string;
  preferredDistance: number;
  sensingDistance: number;
  attraction: number;
  repulsion: number;
  velocityMatch: number;
  prediction: number;
  braking: number;
  sideways: number;
  strength: number;
  deformation: number;
};

const rule = (actor: ColorName, target: ColorName, values: Omit<InteractionRule, 'label'>): InteractionRule => ({
  ...values,
  label: `${actor} → ${target}`,
});

export const DEFAULT_INTERACTIONS: readonly InteractionRule[] = [
  rule('red', 'red', { preferredDistance: 125, sensingDistance: 720, attraction: 150, repulsion: 180, velocityMatch: 1.5, prediction: 0, braking: 2.5, sideways: 0, strength: 1, deformation: 0.25 }),
  rule('red', 'blue', { preferredDistance: 170, sensingDistance: 900, attraction: 250, repulsion: 70, velocityMatch: 0.5, prediction: 0.5, braking: 1.5, sideways: 0.2, strength: 1.2, deformation: 0.3 }),
  rule('red', 'yellow', { preferredDistance: 245, sensingDistance: 1000, attraction: 0, repulsion: 360, velocityMatch: 0, prediction: 0.2, braking: 1, sideways: 0, strength: 1.4, deformation: 0.2 }),
  rule('red', 'green', { preferredDistance: 180, sensingDistance: 900, attraction: 150, repulsion: 150, velocityMatch: 2, prediction: 0.25, braking: 2.5, sideways: 0.6, strength: 1.1, deformation: 0.3 }),
  rule('blue', 'red', { preferredDistance: 150, sensingDistance: 900, attraction: 130, repulsion: 180, velocityMatch: 5, prediction: 0.4, braking: 3, sideways: -0.4, strength: 1.2, deformation: 0.25 }),
  rule('blue', 'blue', { preferredDistance: 125, sensingDistance: 720, attraction: 170, repulsion: 180, velocityMatch: 2, prediction: 0, braking: 2.5, sideways: 0, strength: 1, deformation: 0.25 }),
  rule('blue', 'yellow', { preferredDistance: 225, sensingDistance: 1000, attraction: 0, repulsion: 340, velocityMatch: 0.5, prediction: 0.2, braking: 1, sideways: 0.5, strength: 1.3, deformation: 0.25 }),
  rule('blue', 'green', { preferredDistance: 135, sensingDistance: 920, attraction: 290, repulsion: 70, velocityMatch: 2, prediction: 0.7, braking: 1.5, sideways: -0.5, strength: 1.25, deformation: 0.35 }),
  rule('yellow', 'red', { preferredDistance: 255, sensingDistance: 1050, attraction: 0, repulsion: 390, velocityMatch: 0, prediction: 0.25, braking: 1, sideways: 0, strength: 1.5, deformation: 0.2 }),
  rule('yellow', 'blue', { preferredDistance: 240, sensingDistance: 1050, attraction: 0, repulsion: 360, velocityMatch: 0, prediction: 0.3, braking: 1, sideways: -0.4, strength: 1.4, deformation: 0.2 }),
  rule('yellow', 'yellow', { preferredDistance: 145, sensingDistance: 760, attraction: 190, repulsion: 190, velocityMatch: 2.5, prediction: 0, braking: 3, sideways: 0, strength: 1, deformation: 0.25 }),
  rule('yellow', 'green', { preferredDistance: 265, sensingDistance: 1100, attraction: 0, repulsion: 410, velocityMatch: 0, prediction: 0.25, braking: 1, sideways: 0.4, strength: 1.5, deformation: 0.2 }),
  rule('green', 'red', { preferredDistance: 170, sensingDistance: 900, attraction: 150, repulsion: 180, velocityMatch: 3, prediction: 0.35, braking: 2.5, sideways: 0.6, strength: 1.2, deformation: 0.3 }),
  rule('green', 'blue', { preferredDistance: 130, sensingDistance: 980, attraction: 310, repulsion: 80, velocityMatch: 3, prediction: 0.8, braking: 1.5, sideways: -0.3, strength: 1.3, deformation: 0.35 }),
  rule('green', 'yellow', { preferredDistance: 250, sensingDistance: 1100, attraction: 0, repulsion: 380, velocityMatch: 0, prediction: 0.3, braking: 1, sideways: -0.5, strength: 1.45, deformation: 0.25 }),
  rule('green', 'green', { preferredDistance: 130, sensingDistance: 740, attraction: 180, repulsion: 180, velocityMatch: 2, prediction: 0, braking: 2.5, sideways: 0, strength: 1, deformation: 0.25 }),
];

export function createInteractionRules() {
  return DEFAULT_INTERACTIONS.map((item) => ({ ...item }));
}

export function getInteractionRule(rules: readonly InteractionRule[], actorIndex: number, targetIndex: number) {
  return rules[actorIndex * COLOR_NAMES.length + targetIndex];
}
