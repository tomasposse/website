import type { ExperienceDefinition, ExperienceFactory } from './experience-config';

export type LoadedExperience = ExperienceDefinition & {
  load: () => Promise<ExperienceFactory>;
};

type RuntimeModule = { createExperience: ExperienceFactory };
type MetadataModule = { experience: ExperienceDefinition };

const runtimeModules = import.meta.glob<RuntimeModule>('./*/runtime.ts');
const metadataModules = import.meta.glob<MetadataModule>('./*/metadata.ts', { eager: true });

export const experiences: LoadedExperience[] = Object.entries(metadataModules)
  .map(([metadataPath, metadataModule]) => {
    const folder = metadataPath.split('/').at(-2);
    if (!folder) return null;
    const runtimePath = `./${folder}/runtime.ts`;
    const loadRuntime = runtimeModules[runtimePath];
    if (!loadRuntime) return null;
    return {
      ...metadataModule.experience,
      load: async () => (await loadRuntime()).createExperience,
    };
  })
  .filter((item): item is LoadedExperience => item !== null)
  // Windward is the permanent opening scene. Keep the manifest stable so the
  // selector, preload queue, and first view all agree about position zero.
  .sort((a, b) => (a.id === 'grass' ? -1 : b.id === 'grass' ? 1 : 0));
