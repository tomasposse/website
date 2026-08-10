// Shared experience configuration and development controls.
// Keep all experience-wide switches, runtime types, and Grass tuning here.

export const EXPERIENCE_DEV = false;
export const DEV = false;

export type ExperienceRuntime = { destroy: () => void };
export type ExperienceFactory = (host: HTMLElement) => ExperienceRuntime;
export type ExperienceDefinition = {
  id: string;
  title: string;
  description: string;
  firstPositionWeight?: number;
};

export type QualityProfile = "auto" | "desktop" | "tablet" | "mobile";
export let QUALITY_PROFILE: QualityProfile = "auto";
export function setQualityProfile(profile: QualityProfile) { QUALITY_PROFILE = profile; }

export type Config = {
  world: { tileSize: number; activeTiles: number };
  river: {
    enabled: boolean; occurrence: number; featureScaleTiles: number; warpTiles: number; fieldLevel: number; seed: number;
    width: number; bankWidth: number; heightSoftness: number; vegetationMargin: number;
  };
  scene: {
    fogMode: "exp2" | "linear"; fogDensity: number; fogNear: number; fogFar: number; fogPower: number;
    fogColor: string; clearColor: string; exposure: number; envIntensity: number;
    ambientIntensity: number; ambientSkyColor: string; ambientGroundColor: string;
    keyIntensity: number; keyColor: string;
  };
  sky: { top: string; mid: string; horizon: string };
  camera: { fov: number; speed: number; eyeHeight: number; lookAhead: number; pitch: number; terrainFollow: number; lerpK: number };
  bloom: { strength: number; radius: number; threshold: number };
  water: { deepColor: string; lightColor: string; contrast: number };
  grass: {
    count: number; bladeHeight: number; bladeWidth: number; scaleMin: number; scaleMax: number;
    tintBase: number; tintRange: number; windStrength: number; windSpeed: number; windBend: number;
  };
  terrain: { rolling: number; hillSize: number; hillDetail: number; smallBumps: number; fineBumps: number };
  trees: { count: number; heightMul: number; spreadMul: number; trunkColor: string; leafColor: string };
  flowers: { count: number; sizeMin: number; sizeMax: number; height: number };
  clouds: { count: number; spread: number; altMin: number; altMax: number; opacityMin: number; opacityMax: number; speedMul: number; fadeFar: number };
};

export const CFG: Config = {
  world: { tileSize: 35, activeTiles: 12 },
  river: { enabled: true, occurrence: 0.75, featureScaleTiles: 7, warpTiles: 0, fieldLevel: 0.66, seed: 910814, width: 7, bankWidth: 6, heightSoftness: 1.05, vegetationMargin: 3.5 },
  scene: {
    fogMode: "exp2", fogDensity: 0.017, fogNear: 220, fogFar: 873, fogPower: 4,
    fogColor: "#ebffdb", clearColor: "#c3ddef", exposure: 0.75, envIntensity: 1.65,
    ambientIntensity: 2.35, ambientSkyColor: "#dfe9f2", ambientGroundColor: "#7f9a68",
    keyIntensity: 1.15, keyColor: "#ff9500",
  },
  sky: { top: "#38a3f0", mid: "#afd6ee", horizon: "#edf1ea" },
  camera: { fov: 72, speed: 5, eyeHeight: 3.5, lookAhead: 61, pitch: -0.02, terrainFollow: 1.5, lerpK: 19.1 },
  bloom: { strength: 0.1, radius: 0.85, threshold: 0.7 },
  water: { deepColor: "#0d4f70", lightColor: "#2aa6c1", contrast: 0.22 },
  grass: { count: 1700, bladeHeight: 1.6, bladeWidth: 1.25, scaleMin: 0.8, scaleMax: 1.6, tintBase: 0.22, tintRange: 0.7, windStrength: 0.75, windSpeed: 1.2, windBend: 2.2 },
  terrain: { rolling: 0, hillSize: 21, hillDetail: 3, smallBumps: 7.25, fineBumps: 8.2 },
  trees: { count: 7, heightMul: 0.95, spreadMul: 1.3, trunkColor: "#6b5238", leafColor: "#7d9c68" },
  flowers: { count: 70, sizeMin: 0.75, sizeMax: 1.45, height: 1.45 },
  clouds: { count: 19, spread: 405, altMin: 59, altMax: 146, opacityMin: 0.2, opacityMax: 1, speedMul: 5, fadeFar: 415 },
};

export function installUI(rebuild: () => void) {
  const dock = document.createElement("div");
  dock.id = "garden-dev";
  dock.className = "garden-dev-dock";
  document.body.appendChild(dock);

  const style = document.createElement("style");
  style.textContent = `
    body > #garden-dev {
      box-sizing:border-box; position:fixed; z-index:99999; right:14px; bottom:14px;
      width:min(470px, calc(100vw - 28px)); max-height:min(68vh, 720px); overflow:auto;
      padding:10px; background:rgb(16 24 34 / 94%); color:#dfe9f2;
      font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;
      backdrop-filter:blur(14px); border:1px solid rgb(151 205 236 / 22%);
      border-radius:12px; box-shadow:0 14px 40px rgb(0 0 0 / 34%);
    }
    #garden-dev::-webkit-scrollbar { width:8px; height:8px; }
    #garden-dev::-webkit-scrollbar-thumb { background:rgb(255 255 255 / 20%); border-radius:4px; }
    .gd-head { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px; color:#9ddcff; font-weight:700; }
    .gd-head button, #garden-dev button, #garden-dev select {
      background:#1d3a52; color:#cfe7ff; border:1px solid #3a6a8f; border-radius:6px;
      padding:4px 8px; cursor:pointer; font:inherit;
    }
    #garden-dev button:hover, #garden-dev select:hover { background:#2a4f70; }
    #garden-dev button.gd-danger { background:#6b2d2d; border-color:#a45252; color:#ffd5d5; }
    .gd-tabs { display:flex; gap:4px; overflow-x:auto; padding:0 0 8px; scrollbar-width:thin; border-bottom:1px solid rgb(255 255 255 / 10%); }
    .gd-tab { flex:0 0 auto; border-color:#315c78 !important; color:#9dbed2 !important; }
    .gd-tab.is-active { background:#4b91bd !important; border-color:#7fc9ef !important; color:#fff !important; }
    .gd-panel { display:none; grid-template-columns:1fr; gap:7px; padding-top:8px; }
    .gd-panel.is-active { display:grid; }
    .gd-group { min-width:0; border:1px solid rgb(255 255 255 / 10%); border-radius:8px; padding:8px 10px; background:linear-gradient(135deg,rgb(255 255 255 / 7%),rgb(255 255 255 / 3%)); }
    .gd-group h4 { margin:0 0 6px; color:#9fc2d8; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
    .gd-row { display:grid; grid-template-columns:minmax(150px,1fr) 105px 64px; align-items:center; gap:7px; margin:5px 0; min-width:0; }
    .gd-row label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#c1d5e1; cursor:help; border-bottom:1px dotted rgb(185 206 222 / 45%); }
    .gd-row input[type=number] { width:64px; box-sizing:border-box; background:#0c1622; color:#dff0ff; border:1px solid #2c4c6b; border-radius:4px; padding:3px 4px; font:inherit; }
    .gd-row input[type=range] { width:105px; min-width:0; accent-color:#63b8eb; }
    .gd-row input[type=color] { width:32px; height:21px; border:0; background:none; padding:0; cursor:pointer; }
    .gd-toggle { display:flex; align-items:center; gap:7px; color:#c1d5e1; cursor:pointer; }
    .gd-toggle input { accent-color:#4f9fdc; }
    .gd-hint { color:#7894a7; font-size:10px; margin-top:7px; }
    @media (max-width:700px) { body > #garden-dev { right:7px; bottom:7px; width:calc(100vw - 14px); max-height:68vh; } .gd-row { grid-template-columns:minmax(125px,1fr) 90px 60px; } .gd-row input[type=range] { width:90px; } }
  `;
  // Keep the dock's styles with the dock. Reopening the experience then
  // removes the old style instead of accumulating stale global CSS blocks.
  dock.appendChild(style);

  const head = document.createElement("div");
  head.className = "gd-head";
  head.innerHTML = `<span>⚙ Experience editor</span>`;
  const copy = document.createElement("button");
  copy.textContent = "Copy settings";
  copy.title = "Copy all current configuration values";
  copy.onclick = () => {
    const lines: string[] = [];
    const flat = (obj: Record<string, any>, prefix = "") => {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === "object" && !Array.isArray(v)) flat(v, prefix ? `${prefix}.${k}` : k);
        else lines.push(`${prefix ? `${prefix}.` : ""}${k}=${v}`);
      }
    };
    flat(CFG as any);
    navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
    copy.textContent = "Copied ✓";
    setTimeout(() => { copy.textContent = "Copy settings"; }, 1200);
  };
  head.appendChild(copy);
  const rebuildButton = document.createElement("button");
  rebuildButton.textContent = "Rebuild world";
  rebuildButton.title = "Recreate geometry using the current BUILD settings";
  rebuildButton.onclick = rebuild;
  head.appendChild(rebuildButton);
  const quality = document.createElement("select");
  quality.title = "Rendering quality profile; rebuilds geometry";
  quality.innerHTML = `<option value="auto">Auto quality</option><option value="desktop">Desktop quality</option><option value="tablet">Tablet quality</option><option value="mobile">Mobile quality</option>`;
  quality.value = QUALITY_PROFILE;
  quality.onchange = () => { setQualityProfile(quality.value as QualityProfile); rebuild(); };
  head.appendChild(quality);
  const close = document.createElement("button");
  close.textContent = "Hide";
  close.className = "gd-danger";
  close.title = "Hide the development dock";
  close.onclick = () => { dock.style.display = "none"; };
  head.appendChild(close);
  dock.appendChild(head);

  const tabBar = document.createElement("div");
  tabBar.className = "gd-tabs";
  dock.appendChild(tabBar);
  const panels = new Map<string, HTMLElement>();
  const tab = (id: string, title: string) => {
    const button = document.createElement("button");
    button.className = "gd-tab";
    button.textContent = title;
    button.title = `Show ${title} controls`;
    button.dataset.tab = id;
    tabBar.appendChild(button);
    const panel = document.createElement("div");
    panel.className = "gd-panel";
    panel.dataset.panel = id;
    panels.set(id, panel);
    dock.appendChild(panel);
    button.onclick = () => {
      tabBar.querySelectorAll(".gd-tab").forEach(x => x.classList.toggle("is-active", x === button));
      panels.forEach((p, k) => p.classList.toggle("is-active", k === id));
    };
    return panel;
  };
  const first = tab("world", "World");
  tabBar.querySelector(".gd-tab")?.classList.add("is-active");
  first.classList.add("is-active");
  const riverPanel = tab("river", "River");
  const terrainPanel = tab("terrain", "Terrain");
  const itemsPanel = tab("items", "Items");
  const cameraPanel = tab("camera", "Camera");
  const renderPanel = tab("render", "Rendering");
  const skyPanel = tab("sky", "Sky");
  const cloudsPanel = tab("clouds", "Clouds");

  const section = (panel: HTMLElement, title: string) => {
    const group = document.createElement("div");
    group.className = "gd-group";
    const heading = document.createElement("h4");
    heading.textContent = title;
    group.appendChild(heading);
    panel.appendChild(group);
    return group;
  };
  const row = (group: HTMLElement) => {
    const r = document.createElement("div");
    r.className = "gd-row";
    group.appendChild(r);
    return r;
  };
  const number = (group: HTMLElement, label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number, build: boolean, description: string) => {
    const r = row(group);
    const l = document.createElement("label");
    l.textContent = label;
    l.title = `${description}${build ? " Rebuild required." : " Applies live."}`;
    const range = document.createElement("input");
    range.type = "range"; range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(get());
    const input = document.createElement("input");
    input.type = "number"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(get());
    const bounded = (value: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
    const live = (raw: number) => {
      const value = bounded(raw);
      set(value);
      // Setters may normalize against another control (min/max pairs). Read the
      // actual value back so the slider and number field never become stale.
      const actual = get();
      range.value = String(actual);
      input.value = String(actual);
    };
    const commit = (raw: number) => { live(raw); if (build) rebuild(); };
    range.oninput = () => live(parseFloat(range.value));
    range.onchange = () => { if (build) rebuild(); };
    input.oninput = () => live(parseFloat(input.value));
    input.onchange = () => commit(parseFloat(input.value));
    r.append(l, range, input);
  };
  const color = (group: HTMLElement, label: string, get: () => string, set: (v: string) => void, build: boolean, description: string) => {
    const r = row(group);
    const l = document.createElement("label");
    l.textContent = label; l.title = `${description}${build ? " Rebuild required." : " Applies live."}`;
    const spacer = document.createElement("span");
    const input = document.createElement("input");
    input.type = "color"; input.value = get();
    input.oninput = () => set(input.value);
    input.onchange = () => { if (build) rebuild(); };
    r.append(l, spacer, input);
  };
  const select = (group: HTMLElement, label: string, get: () => string, set: (v: string) => void, options: Array<[string, string]>, description: string) => {
    const r = row(group);
    const l = document.createElement("label");
    l.textContent = label; l.title = `${description} Applies live.`;
    const input = document.createElement("select");
    input.style.width = "105px";
    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value; option.textContent = text; input.appendChild(option);
    }
    input.value = get();
    input.onchange = () => set(input.value);
    r.append(l, document.createElement("span"), input);
  };
  const toggle = (group: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void, description: string) => {
    const r = row(group);
    const l = document.createElement("label"); l.textContent = label; l.title = `${description} Rebuild required.`;
    const spacer = document.createElement("span");
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = get();
    input.onchange = () => { set(input.checked); rebuild(); };
    r.append(l, spacer, input);
  };

  const world = section(first, "Streaming layout");
  number(world, "terrain tile (m)", () => CFG.world.tileSize, v => CFG.world.tileSize = v, 1, 240, 1, true, "Width and depth of one streamed terrain tile.");
  number(world, "tile budget", () => CFG.world.activeTiles, v => CFG.world.activeTiles = v, 1, 49, 1, true, "Number of pooled terrain tiles. One is valid but shows only one tile.");

  const river = section(riverPanel, "River and pond generation");
  toggle(river, "water enabled", () => CFG.river.enabled, v => CFG.river.enabled = v, "Enable the unified tiled water field.");
  number(river, "water occurrence", () => CFG.river.occurrence, v => CFG.river.occurrence = v, 0, 1, 0.05, true, "Amount of water contour present. Zero disables water.");
  number(river, "feature scale (tiles)", () => CFG.river.featureScaleTiles, v => CFG.river.featureScaleTiles = v, 1, 30, 1, true, "Typical size of connected rivers and ponds in terrain tiles.");
  number(river, "field warp", () => CFG.river.warpTiles, v => CFG.river.warpTiles = v, 0, 4, 0.1, true, "Bends the water field so it does not form regular shapes.");
  number(river, "water contour", () => CFG.river.fieldLevel, v => CFG.river.fieldLevel = v, 0.05, 0.95, 0.01, true, "Scalar-field contour used as the water centerline.");
  number(river, "water width (m)", () => CFG.river.width, v => CFG.river.width = v, 1, 48, 1, true, "Flat water channel width.");
  number(river, "bank width (m)", () => CFG.river.bankWidth, v => CFG.river.bankWidth = v, 0, 50, 1, true, "Base width of the bank transition from water to meadow.");
  number(river, "height softness", () => CFG.river.heightSoftness, v => CFG.river.heightSoftness = v, 0, 2, 0.05, true, "Adds transition width as neighboring meadow height increases, preventing tall hills from forming cliffs beside water while keeping vegetation there.");
  number(river, "grass-water gap (m)", () => CFG.river.vegetationMargin, v => CFG.river.vegetationMargin = v, 0, 20, 0.5, true, "Extra distance beyond water banks where vegetation is removed.");
  number(river, "seed", () => CFG.river.seed, v => CFG.river.seed = v, 0, 999999, 1, true, "Deterministic tiled water-field seed.");

  const terrain = section(terrainPanel, "Elevation amplitudes");
  number(terrain, "rolling amplitude (m)", () => CFG.terrain.rolling, v => CFG.terrain.rolling = v, 0, 100, 1, true, "Broad terrain height variation. No artificial low maximum.");
  number(terrain, "hill amplitude (m)", () => CFG.terrain.hillSize, v => CFG.terrain.hillSize = v, 0, 100, 1, true, "Medium hill height variation. Values above 20 are valid.");
  number(terrain, "detail amplitude (m)", () => CFG.terrain.hillDetail, v => CFG.terrain.hillDetail = v, 0, 50, 0.5, true, "Small hill height variation.");
  number(terrain, "small bumps (m)", () => CFG.terrain.smallBumps, v => CFG.terrain.smallBumps = v, 0, 25, 0.25, true, "Small terrain bump amplitude.");
  number(terrain, "fine bumps (m)", () => CFG.terrain.fineBumps, v => CFG.terrain.fineBumps = v, 0, 12, 0.1, true, "Fine terrain bump amplitude.");

  const grass = section(itemsPanel, "Grass");
  number(grass, "grass per tile", () => CFG.grass.count, v => CFG.grass.count = v, 0, 20000, 100, true, "Number of grass instances generated for each streamed terrain tile.");
  number(grass, "blade height (m)", () => CFG.grass.bladeHeight, v => CFG.grass.bladeHeight = v, 0.2, 4, 0.1, true, "Base grass blade height.");
  number(grass, "blade width (m)", () => CFG.grass.bladeWidth, v => CFG.grass.bladeWidth = v, 0.1, 2.5, 0.05, true, "Grass billboard half-width.");
  number(grass, "minimum scale", () => CFG.grass.scaleMin, v => CFG.grass.scaleMin = v, 0, 3, 0.1, false, "Minimum random grass scale.");
  number(grass, "maximum scale", () => CFG.grass.scaleMax, v => CFG.grass.scaleMax = v, 0, 4, 0.1, false, "Maximum random grass scale.");
  number(grass, "wind strength", () => CFG.grass.windStrength, v => CFG.grass.windStrength = v, 0, 3, 0.05, false, "Global wind field strength.");
  number(grass, "wind speed", () => CFG.grass.windSpeed, v => CFG.grass.windSpeed = v, 0, 4, 0.05, false, "Global wind animation speed.");
  number(grass, "wind bend", () => CFG.grass.windBend, v => CFG.grass.windBend = v, 0, 4, 0.1, false, "How far grass bends under wind.");
  const trees = section(itemsPanel, "Trees");
  number(trees, "trees per tile", () => CFG.trees.count, v => CFG.trees.count = v, 0, 120, 1, true, "Number of tree instances generated per terrain tile.");
  number(trees, "tree height scale", () => CFG.trees.heightMul, v => CFG.trees.heightMul = v, 0, 3, 0.05, true, "Multiplier for tree height.");
  number(trees, "tree spread scale", () => CFG.trees.spreadMul, v => CFG.trees.spreadMul = v, 0, 3, 0.05, true, "Multiplier for tree canopy spread.");
  color(trees, "trunk color", () => CFG.trees.trunkColor, v => CFG.trees.trunkColor = v, true, "Tree trunk material color.");
  color(trees, "leaf color", () => CFG.trees.leafColor, v => CFG.trees.leafColor = v, true, "Tree leaf material color.");
  const flowers = section(itemsPanel, "Flowers");
  number(flowers, "flowers per tile", () => CFG.flowers.count, v => CFG.flowers.count = v, 0, 1500, 10, true, "Number of flower instances generated per tile.");
  number(flowers, "minimum flower scale", () => CFG.flowers.sizeMin, v => CFG.flowers.sizeMin = Math.min(v, CFG.flowers.sizeMax), 0, 3, 0.05, true, "Minimum random flower size; cannot exceed maximum.");
  number(flowers, "maximum flower scale", () => CFG.flowers.sizeMax, v => CFG.flowers.sizeMax = Math.max(v, CFG.flowers.sizeMin), 0, 3, 0.05, true, "Maximum random flower size; cannot be below minimum.");
  number(flowers, "flower height (m)", () => CFG.flowers.height, v => CFG.flowers.height = v, 0.1, 6, 0.05, true, "Total visible flower height from root to petal top. Individual flowers multiply this by their own scale.");

  const camera = section(cameraPanel, "Movement and view");
  number(camera, "movement speed (m/s)", () => CFG.camera.speed, v => CFG.camera.speed = v, 0, 40, 0.5, false, "Horizontal navigation speed in world metres per second.");
  number(camera, "field of view (°)", () => CFG.camera.fov, v => CFG.camera.fov = v, 45, 110, 1, false, "Actual perspective field of view used by the viewport tile selector.");
  number(camera, "camera height (m)", () => CFG.camera.eyeHeight, v => CFG.camera.eyeHeight = v, 0.5, 100, 0.5, false, "Camera height above terrain. High values greatly increase the visible ground footprint.");
  number(camera, "terrain aim distance (m)", () => CFG.camera.lookAhead, v => CFG.camera.lookAhead = v, 0, 120, 1, false, "Distance ahead used to aim over terrain; independent from viewport tile coverage.");
  number(camera, "base look-down (rad)", () => CFG.camera.pitch, v => CFG.camera.pitch = v, -1.4, -0.02, 0.02, false, "Base downward angle before terrain slope is added. More negative looks closer to the ground.");
  number(camera, "terrain angle follow", () => CFG.camera.terrainFollow, v => CFG.camera.terrainFollow = v, 0, 1.5, 0.05, false, "How strongly the camera follows the uphill/downhill angle. 0 ignores terrain angle; 1 follows it fully.");
  number(camera, "height follow rate", () => CFG.camera.lerpK, v => CFG.camera.lerpK = v, 0.1, 40, 0.5, false, "Rate at which camera height follows terrain changes.");

  const render = section(renderPanel, "Scene and post-processing");
  select(render, "fog model", () => CFG.scene.fogMode, v => CFG.scene.fogMode = v as "exp2" | "linear", [["exp2", "Exponential 2"], ["linear", "Linear / cinematic"]], "Choose whether fog grows exponentially or fades between explicit distances.");
  color(render, "fog color", () => CFG.scene.fogColor, v => CFG.scene.fogColor = v, false, "Fog and distant terrain color.");
  number(render, "fog density", () => CFG.scene.fogDensity, v => CFG.scene.fogDensity = v, 0, 0.05, 0.0005, false, "Exponential fog density; higher reduces visible distance.");
  number(render, "fog near (m)", () => CFG.scene.fogNear, v => { CFG.scene.fogNear = Math.min(v, CFG.scene.fogFar - 1); }, 0, 1000, 1, false, "Distance where linear fog begins.");
  number(render, "fog far (m)", () => CFG.scene.fogFar, v => { CFG.scene.fogFar = Math.max(v, CFG.scene.fogNear + 1); }, 1, 2000, 1, false, "Distance where linear fog reaches full strength.");
  number(render, "fog curve", () => CFG.scene.fogPower, v => CFG.scene.fogPower = v, 0.1, 4, 0.05, false, "Shape of the linear fog ramp. Below 1 arrives early; above 1 stays clear longer.");
  color(render, "key light color", () => CFG.scene.keyColor, v => CFG.scene.keyColor = v, false, "Color of the directional sunlight fill.");
  number(render, "key light", () => CFG.scene.keyIntensity, v => CFG.scene.keyIntensity = v, 0, 3, 0.05, false, "Directional light intensity.");
  color(render, "ambient sky", () => CFG.scene.ambientSkyColor, v => CFG.scene.ambientSkyColor = v, false, "Upper hemisphere fill color.");
  color(render, "ambient ground", () => CFG.scene.ambientGroundColor, v => CFG.scene.ambientGroundColor = v, false, "Lower hemisphere fill color.");
  number(render, "ambient light", () => CFG.scene.ambientIntensity, v => CFG.scene.ambientIntensity = v, 0, 3, 0.05, false, "Hemisphere fill intensity.");
  number(render, "exposure", () => CFG.scene.exposure, v => CFG.scene.exposure = v, 0.1, 3, 0.05, false, "Tone-mapping exposure.");
  number(render, "environment light", () => CFG.scene.envIntensity, v => CFG.scene.envIntensity = v, 0, 3, 0.05, false, "Image-based environment light strength.");
  number(render, "bloom strength", () => CFG.bloom.strength, v => CFG.bloom.strength = v, 0, 2, 0.05, false, "Bloom brightness.");
  number(render, "bloom radius", () => CFG.bloom.radius, v => CFG.bloom.radius = v, 0, 2, 0.05, false, "Bloom spread radius.");
  number(render, "bloom threshold", () => CFG.bloom.threshold, v => CFG.bloom.threshold = v, 0, 2, 0.05, false, "Brightness threshold where bloom begins.");
  const sky = section(skyPanel, "Sky colors");
  color(sky, "top color", () => CFG.sky.top, v => CFG.sky.top = v, false, "Top sky gradient color.");
  color(sky, "middle color", () => CFG.sky.mid, v => CFG.sky.mid = v, false, "Middle sky gradient color.");
  color(sky, "horizon color", () => CFG.sky.horizon, v => CFG.sky.horizon = v, false, "Horizon sky and fog color.");
  const clouds = section(cloudsPanel, "Cloud field");
  number(clouds, "cloud count", () => CFG.clouds.count, v => CFG.clouds.count = v, 0, 40, 1, true, "Number of cloud groups.");
  number(clouds, "cloud spread (m)", () => CFG.clouds.spread, v => CFG.clouds.spread = v, 20, 500, 5, true, "Horizontal cloud distribution around the camera.");
  number(clouds, "minimum altitude (m)", () => CFG.clouds.altMin, v => CFG.clouds.altMin = Math.min(v, CFG.clouds.altMax), 0, 180, 1, true, "Lowest cloud altitude; cannot exceed maximum.");
  number(clouds, "maximum altitude (m)", () => CFG.clouds.altMax, v => CFG.clouds.altMax = Math.max(v, CFG.clouds.altMin), 0, 180, 1, true, "Highest cloud altitude; cannot be below minimum.");
  number(clouds, "minimum opacity", () => CFG.clouds.opacityMin, v => CFG.clouds.opacityMin = Math.min(v, CFG.clouds.opacityMax), 0, 1, 0.05, true, "Minimum cloud opacity; cannot exceed maximum.");
  number(clouds, "maximum opacity", () => CFG.clouds.opacityMax, v => CFG.clouds.opacityMax = Math.max(v, CFG.clouds.opacityMin), 0, 1, 0.05, true, "Maximum cloud opacity; cannot be below minimum.");
  number(clouds, "drift speed", () => CFG.clouds.speedMul, v => CFG.clouds.speedMul = v, 0, 5, 0.1, false, "Cloud drift speed multiplier.");
  number(clouds, "fade distance (m)", () => CFG.clouds.fadeFar, v => CFG.clouds.fadeFar = v, 20, 500, 5, true, "Cloud fade box half-size around the camera.");

  const hint = document.createElement("div");
  hint.className = "gd-hint";
  hint.textContent = "Hover a label for help. BUILD controls recreate geometry; live controls apply immediately.";
  dock.appendChild(hint);
  return dock;
}
