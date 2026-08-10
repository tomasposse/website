import { QUALITY_PROFILE, CFG } from "../../experience-config";

// Per-active-tile density and terrain resolution. The profile can be selected
// in the dev dock to preview mobile/tablet/desktop budgets.
export type QualityLevel = {
  name: string;
  pixelRatio: number;
  grassCount: number;
  terrainSegments: number;
};

export function detectQuality(): QualityLevel {
  const coarse = matchMedia("(pointer:coarse)").matches;
  const narrow = innerWidth < 760;
  const profile = QUALITY_PROFILE === "auto"
    ? (coarse && narrow ? "mobile" : coarse ? "tablet" : "desktop")
    : QUALITY_PROFILE;
  const configuredGrass = Math.max(0, Math.round(CFG.grass.count));
  if (profile === "mobile") return { name: "mobile", pixelRatio: 1.1, grassCount: configuredGrass, terrainSegments: 56 };
  if (profile === "tablet") return { name: "tablet", pixelRatio: 1.3, grassCount: configuredGrass, terrainSegments: 72 };
  return { name: "desktop", pixelRatio: 1.5, grassCount: configuredGrass, terrainSegments: 96 };
}