# Experience folder guide

Each experience is self-contained in its own folder:

```text
experiences/
└── my-experience/
    ├── my-experience.astro
    └── runtime.ts
```

Grass additionally keeps its implementation helpers in `grass/utils/` and its
local development controls in `grass/dev.ts`.

## Astro file

The `.astro` file owns metadata and lightweight placeholder markup only:

```astro
---
export const title = "My Experience";
export const description = "Short selector description.";
---
<div class="experience-shell"></div>
```

Do not put a runtime script in the Astro file. The panel mounts the runtime
lazily into the single shared host.

## Runtime file

Every runtime exports the same factory name:

```ts
import type { ExperienceRuntime } from "../experience-types";

export function createExperience(host: HTMLElement): ExperienceRuntime {
  // Create DOM, canvas, listeners, observers, RAF and GPU resources here.
  return {
    destroy() {
      // Release every resource created by this factory.
    },
  };
}
```

The parent manager owns switching. A runtime must not use window lifecycle
registries, visibility polling, or its own global active-state system.

## Destruction requirements

`destroy()` must be idempotent and must:

- cancel every RAF and timer;
- remove every event listener;
- disconnect every observer;
- dispose Three.js geometries, materials, textures, render targets,
  composers and renderer;
- call `forceContextLoss()` when the runtime owns a WebGL renderer;
- remove all runtime DOM from the host;
- remove any global debug UI created by the runtime.

There must be at most one mounted runtime and one active render loop. The panel
always destroys the current runtime before loading the next one.

## Adding an experience

1. Create the folder and its `.astro` metadata file.
2. Create `runtime.ts` with `createExperience(host)`.
3. Add the runtime metadata/load entry to `EXPERIENCE_MANIFEST.ts`.
4. Keep all implementation helpers inside the experience folder.
5. Run `npx astro check` and `npm run build`.
6. Repeatedly switch between every experience and inspect the console and
   performance timeline for duplicate loops or WebGL contexts.
# Runtime lifecycle guide

The panel owns one runtime at a time. It loads the selected runtime lazily,
mounts it into one host, and calls `destroy()` before loading another.

## Contract

```ts
export type ExperienceRuntime = {
  destroy: () => void;
};
```

A factory must allocate resources only when called. `destroy()` must be safe to
call once or repeatedly and must release all resources owned by the runtime.

## Rules

- No `window.__expLife` or lifecycle registry inside experiences.
- No visibility polling or fallback RAF watchers.
- No runtime code in `.astro` files.
- Keep event callbacks so they can be removed.
- Cancel every RAF and timeout.
- Disconnect every observer.
- Dispose every Three.js resource, including renderer and composer.
- Do not create a separate AudioContext per experience.
- Do not assume replacing DOM releases GPU resources.

## Switching

Switching is serialized by the manager. It destroys the active runtime, clears
the host, loads the selected factory, and mounts the new runtime. A load token
prevents an obsolete asynchronous import from becoming active.

## Review checklist

- one host;
- one runtime;
- one RAF/render loop;
- no hidden canvas or renderer;
- no stale listeners or observers;
- no stale global elements;
- `astro check` has zero errors;
- build succeeds.
