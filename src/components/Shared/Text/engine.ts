import {
  paletteFor,
  randomSwatchAvoiding,
  type Swatch,
} from "./palette";
import { measureWord, BASELINE_Y, type WordMetrics } from "./measure";

const SVGNS = "http://www.w3.org/2000/svg";

type Options = {
  text?: string;
  fontSize?: number;
  colorVariation?: number; // 0..1
};

export type DesignTilesOptions = Options;

const FLY_STAGGER = 130;
const FLY_MS = 760;
const SHUFFLE_MIN = 1300;
const SHUFFLE_MAX = 3200;
const COLOR_MS = 520;
const RISE = 14; // px shift up on reveal

const PAD_Y = 6;
const PAD_X = 2;

const BAND_ASCENT = 82;
const BAND_DESCENT = 26;

type Tile = {
  outer: HTMLSpanElement;
  svg: SVGSVGElement;
  rects: SVGRectElement[];
  textEl: SVGTextElement;
  word: string;
  swatch: Swatch;
  nextShuffle: number;
};

export class DesignTiles {
  private host: HTMLElement;
  private root: HTMLDivElement;
  private bar: HTMLDivElement;
  private tiles: Tile[] = [];
  private fontFamily = "sans-serif";

  private raf = 0;
  private running = false;
  private disposed = false;
  private revealed = false;
  private now = 0;

  private words: string[];
  private fontSize: number;
  private palette: Swatch[];
  private used: Swatch[] = [];

  private ro?: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(host: HTMLElement, options: Options = {}) {
    this.host = host;
    this.words = (options.text ?? "design is how it works")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    this.fontSize = options.fontSize ?? 72;
    this.palette = paletteFor(options.colorVariation ?? 1);

    const root = document.createElement("div");
    Object.assign(root.style, {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-global, Quicksand, \"Trebuchet MS\", sans-serif)",
      userSelect: "none",
      width: "max-content",
      height: `${BAND_ASCENT + BAND_DESCENT}px`,
    });
    root.setAttribute("aria-label", this.words.join(" "));

    this.fontFamily =
      getComputedStyle(root).fontFamily || "Quicksand, sans-serif";

    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex",
      alignItems: "stretch",
      lineHeight: "0",
      width: "max-content",
    });

    this.words.forEach((word, i) => {
      let sw: Swatch;
      if (i < this.palette.length) {
        sw = this.palette[i];
      } else {
        sw = randomSwatchAvoiding(this.used);
      }
      this.used.push(sw);

      const outer = document.createElement("span");
      Object.assign(outer.style, {
        display: "inline-flex",
        alignItems: "stretch",
        transform: `translateY(${RISE}px)`,
        opacity: "0",
        transition: `transform ${FLY_MS}ms cubic-bezier(.16,1,.3,1), opacity ${Math.round(
          FLY_MS * 0.8
        )}ms ease`,
        willChange: "transform",
      });

      const svg = document.createElementNS(SVGNS, "svg");
      Object.assign(svg.style, {
        display: "block",
        height: "clamp(1.6rem, 4vw, 2.9rem)",
        clipPath: "inset(0 100% 0 0)",
        transition: `clip-path ${FLY_MS}ms cubic-bezier(.16,1,.3,1)`,
      });

      const gBg = document.createElementNS(SVGNS, "g");
      const textEl = document.createElementNS(SVGNS, "text");
      textEl.setAttribute("font-family", this.fontFamily);
      textEl.setAttribute("font-weight", "500");
      textEl.setAttribute("font-size", String(this.fontSize));
      textEl.setAttribute("dominant-baseline", "alphabetic");
      textEl.style.fill = sw.fg;
      textEl.style.transition = `fill ${COLOR_MS}ms ease`;
      textEl.textContent = word;

      svg.appendChild(gBg);
      svg.appendChild(textEl);
      outer.appendChild(svg);
      bar.appendChild(outer);

      this.tiles.push({
        outer,
        svg,
        rects: [],
        textEl,
        word,
        swatch: sw,
        nextShuffle: 0,
      });
    });

    root.appendChild(bar);
    host.appendChild(root);
    this.root = root;
    this.bar = bar;

    this.layout();
    this.bindEvents();
  }

  private layout() {
    const metrics = this.tiles.map((tile) => measureWord(tile.word, this.fontFamily, "500", this.fontSize));
    const valid = metrics.filter((m): m is WordMetrics => !!m);
    // Use one shared vertical band for every word. This preserves a common
    // baseline/alignment while the band itself still fits the requested font.
    const bandTop = valid.length ? Math.min(...valid.flatMap((m) => m.glyphs.map((g) => g.top))) - PAD_Y : 0;
    const bandBottom = valid.length ? Math.max(...valid.flatMap((m) => m.glyphs.map((g) => g.bottom))) + PAD_Y : this.fontSize;
    const height = Math.max(1, bandBottom - bandTop);

    this.tiles.forEach((tile, i) => {
      for (const r of tile.rects) r.remove();
      tile.rects = [];
      const m = metrics[i];
      if (m) this.buildRects(tile, m, bandTop, bandBottom);
      else this.buildFallback(tile, bandTop, height);
    });
    this.root.style.height = `${height}px`;
    this.bar.style.height = `${height}px`;
    this.fitToHost();
  }

  /**
   * Preserve the requested font size when there is room, but scale the whole
   * word mark down when its containing block is narrower than the text.
   * This is preferable to a component-level media query because each
   * instance can have a different amount of available space.
   */
  private fitToHost() {
    const availableWidth = this.host.clientWidth;
    const contentWidth = this.bar.scrollWidth;
    if (!availableWidth || !contentWidth) return;

    const scale = Math.min(1, availableWidth / contentWidth);
    this.root.style.transformOrigin = "center center";
    this.root.style.transform = `scale(${scale})`;
    this.root.style.height = `${this.bar.offsetHeight * scale}px`;
  }

  private buildRects(tile: Tile, m: WordMetrics, bandTop: number, bandBottom: number) {
    const gBg = tile.svg.firstChild as SVGGElement;
    const bandH = Math.max(1, bandBottom - bandTop);

    for (let i = 0; i < m.glyphs.length; i++) {
      const g = m.glyphs[i];
      if (g.ch === " ") continue;

      const next = m.glyphs[i + 1];
      const right = next ? next.x : g.x + g.w;
      const left = g.x - (i === 0 ? PAD_X : 0);
      const width = right - left + PAD_X;

      // One block per letter: width AND height auto-sized to that letter's
      // ink, clamped within the band so the bar stays level.
      const top = Math.max(bandTop, g.top - PAD_Y);
      const bottom = Math.min(bandBottom, g.bottom + PAD_Y);
      const rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", String(left));
      rect.setAttribute("y", String(top));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(bottom - top));
      rect.style.fill = tile.swatch.bg;
      rect.style.transition = `fill ${COLOR_MS}ms ease`;

      gBg.appendChild(rect);
      tile.rects.push(rect);
    }

    tile.textEl.setAttribute("x", "0");
    tile.textEl.setAttribute("y", String(BASELINE_Y));
    const vbX = -PAD_X;
    const vbW = m.width + PAD_X * 2;
    tile.svg.setAttribute("viewBox", `${vbX} ${bandTop} ${vbW} ${bandH}`);
    tile.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    tile.svg.removeAttribute("width");
    // SVG viewBox units are based on the requested font size. Do not let the
    // host's responsive height scale the SVG (that was making fontSize appear
    // to be ignored). One viewBox unit is one CSS pixel here.
    tile.svg.style.width = `${vbW}px`;
    tile.svg.style.height = `${bandH}px`;
  }

  private buildFallback(tile: Tile, bandTop = 0, bandH = this.fontSize) {
    const gBg = tile.svg.firstChild as SVGGElement;
    const rect = document.createElementNS(SVGNS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", "100");
    rect.setAttribute("height", "100");
    rect.style.fill = tile.swatch.bg;
    gBg.appendChild(rect);
    tile.rects.push(rect);
    tile.svg.setAttribute("viewBox", `0 ${bandTop} 100 ${bandH}`);
    tile.svg.style.width = "100px";
    tile.svg.style.height = `${bandH}px`;
  }

  private bindEvents() {
    this.tiles.forEach((tile) => {
      const onEnter = () => this.recolor(tile);
      tile.svg.addEventListener("pointerenter", onEnter);
      // Mobile browsers do not reliably dispatch pointerenter for this kind
      // of SVG content. Keep the same color-flow interaction on touch.
      tile.svg.addEventListener("pointerdown", onEnter);
      this.cleanup.push(() => {
        tile.svg.removeEventListener("pointerenter", onEnter);
        tile.svg.removeEventListener("pointerdown", onEnter);
      });
    });

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.host);
  }

  private recolor(tile: Tile) {
    const used = this.tiles
      .filter((t) => t !== tile)
      .map((t) => t.swatch);
    const free = this.palette.filter((s) => !used.includes(s));
    const pool = free.length > 0 ? free : this.palette;
    const sw = pool[(Math.random() * pool.length) | 0];
    tile.swatch = sw;
    for (const r of tile.rects) r.style.fill = sw.bg;
    tile.textEl.style.fill = sw.fg;
  }

  refreshFont() {
    this.fontFamily = getComputedStyle(this.root).fontFamily || this.fontFamily;
    for (const tile of this.tiles)
      tile.textEl.setAttribute("font-family", this.fontFamily);
    this.layout();
  }

  private reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.tiles.forEach((tile, i) => {
      const delay = i * FLY_STAGGER;
      const t = window.setTimeout(() => {
        tile.outer.style.transform = "translateY(0)";
        tile.outer.style.opacity = "1";
        tile.svg.style.clipPath = "inset(0 0% 0 0)";
      }, delay);
      this.cleanup.push(() => window.clearTimeout(t));
    });
    const assembledAt = this.tiles.length * FLY_STAGGER + FLY_MS;
    this.tiles.forEach((tile) => {
      tile.nextShuffle =
        performance.now() +
        assembledAt +
        SHUFFLE_MIN +
        Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
    });
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.reveal();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = () => {
    if (!this.running) return;
    this.now = performance.now();
    for (const tile of this.tiles) {
      if (tile.nextShuffle === 0) continue;
      if (this.now >= tile.nextShuffle) {
        this.recolor(tile);
        tile.nextShuffle =
          this.now + SHUFFLE_MIN + Math.random() * (SHUFFLE_MAX - SHUFFLE_MIN);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  renderStill() {
    this.revealed = true;
    this.tiles.forEach((tile) => {
      tile.outer.style.transition = "none";
      tile.outer.style.transform = "translateY(0)";
      tile.outer.style.opacity = "1";
      tile.svg.style.transition = "none";
      tile.svg.style.clipPath = "inset(0 0% 0 0)";
    });
  }

  destroy() {
    this.disposed = true;
    this.stop();
    this.ro?.disconnect();
    this.cleanup.forEach((fn) => fn());
    this.root.parentNode?.removeChild(this.root);
    void this.bar;
  }
}
