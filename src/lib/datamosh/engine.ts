const PALETTE = [
  "#ffffff",
  "#3566ff",
  "#ffcf00",
  "#192aff",
  "#d62036",
  "#282142",
  "#ec4978",
  "#ff9900",
  "#14101f",
  "#00dd33",
  "#00ef82",
] as const;

const COLS = 10;
const POWER = 3;
const TILES = 30;

const CYCLE = 0.5;
const STAGGER = 0.1;
const STRETCH = 8.5;
const BLEED = 0.1;
const COL_PHASE = -0.4;

const SPRING_K = 5;

const SPRING_NORM = 1 - Math.exp(-SPRING_K);

function springStep(p: number) {
  const half = (t: number) =>
    (1 - Math.exp(-SPRING_K * t)) / SPRING_NORM;

  return p < 0.5
    ? 0.5 * half(p * 2)
    : 1 - 0.5 * half((1 - p) * 2);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t =
      (t +
        Math.imul(t ^ (t >>> 7), 61 | t)) ^
      t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDifferent(
  from: number,
  avoid: number[]
) {
  for (let i = 1; i <= PALETTE.length; i++) {
    const c = (from + i) % PALETTE.length;

    if (!avoid.includes(c)) {
      return c;
    }
  }

  return from;
}


export class Datamosh {
  readonly ok = true;

  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private w = 0;
  private h = 0;
  private dpr = 1;

  private edges: number[] = [];
  private strip: number[] = [];

  private raf = 0;
  private running = false;

  private lastT = 0;
  private elapsed = 0;

  private ro?: ResizeObserver;

  constructor(
    host: HTMLElement,
    seed = 1
  ) {
    this.host = host;

    this.canvas =
      document.createElement("canvas");

    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";

    host.appendChild(this.canvas);

    const ctx =
      this.canvas.getContext(
        "2d",
        { alpha: false }
      );

    if (!ctx) {
      throw new Error(
        "Canvas unavailable"
      );
    }

    this.ctx = ctx;

    this.ctx.imageSmoothingEnabled = false;

    this.buildColours(seed);

    this.measure();

    this.ro = new ResizeObserver(() => {
      this.measure();

      if (!this.running) {
        this.draw();
      }
    });

    this.ro.observe(host);
  }


  private buildColours(seed:number) {
    const rand = mulberry32(seed);

    const white = 0;
    const darks = [8,5];

    const hues = [
      1,2,3,4,6,7,9,10
    ];

    const strip:number[] = [];

    let lastHue = -1;

    for(let i=0;i<61;i++){

      let next:number;

      const r = rand();

      if(r < 0.26){
        next = white;
      }
      else if(r < 0.42){
        next =
          darks[
            Math.floor(
              rand()*darks.length
            )
          ];
      }
      else{

        let h =
          hues[
            Math.floor(
              rand()*hues.length
            )
          ];

        if(h===lastHue){
          h =
            hues[
              (hues.indexOf(h)+1)
              % hues.length
            ];
        }

        lastHue=h;
        next=h;
      }

      if(
        strip.length &&
        strip[strip.length-1]===next
      ){
        next =
          pickDifferent(
            next,
            [next]
          );
      }

      strip.push(next);
    }

    this.strip=strip;
  }


  private measure(){

    const rect =
      this.host.getBoundingClientRect();

    this.dpr =
      Math.min(
        2,
        window.devicePixelRatio || 1
      );

    this.w =
      Math.max(
        1,
        Math.round(
          rect.width*this.dpr
        )
      );

    this.h =
      Math.max(
        1,
        Math.round(
          rect.height*this.dpr
        )
      );


    this.canvas.width=this.w;
    this.canvas.height=this.h;


    this.edges=[];

    for(
      let i=0;
      i<=COLS;
      i++
    ){
      this.edges.push(
        Math.round(
          this.w *
          Math.pow(
            i/COLS,
            POWER
          )
        )
      );
    }
  }


  private tileEdge(k:number){

    const u =
      k/TILES;

    if(u<0)
      return u*0.05;

    if(u>1)
      return 1+(u-1)*0.05;


    const a =
      Math.pow(
        u,
        STRETCH
      );

    return (
      a /
      (
        a +
        Math.pow(
          1-u,
          STRETCH
        )
      )
    );
  }


  private draw(){

    const ctx=this.ctx;

    ctx.clearRect(
      0,
      0,
      this.w,
      this.h
    );


    for(
      let col=0;
      col<COLS;
      col++
    ){

      const x0=this.edges[col];

      const width =
        this.edges[col+1]-x0;


      const delay =
        (COLS-1-col)*STAGGER;


      const raw =
        Math.max(
          0,
          (this.elapsed-delay)
          /CYCLE
        );


      const linear =
        raw + col*COL_PHASE;


      const step =
        Math.floor(linear);


      const frac =
        linear-step;


      const flow =
        step+springStep(frac);


      const base =
        -Math.floor(flow);


      for(
        let n=TILES+2;
        n>=-2;
        n--
      ){

        const id =
          base+n;


        const top =
          Math.round(
            this.tileEdge(
              id+flow
            )*
            this.h
          );


        const bottom =
          Math.round(
            this.tileEdge(
              id+flow+1
            )*
            this.h
          )
          +
          Math.round(
            BLEED*this.h
          );


        if(
          bottom<=top
        )
          continue;


        const y =
          Math.max(
            0,
            top
          );


        const height =
          Math.min(
            this.h,
            bottom
          )-y;


        if(height<=0)
          continue;


        const index =
          (
            id-col+
            this.strip.length
          )
          %
          this.strip.length;


        ctx.fillStyle =
          PALETTE[
            this.strip[index]
          ];


        ctx.fillRect(
          x0,
          y,
          width,
          height
        );
      }
    }
  }


  private tick =
    (time:number)=>{

      if(!this.running)
        return;


      const dt =
        this.lastT
        ?
        Math.min(
          0.05,
          (time-this.lastT)/1000
        )
        :
        0;


      this.lastT=time;
      this.elapsed+=dt;

      this.draw();

      this.raf =
        requestAnimationFrame(
          this.tick
        );
    };


  start(){

    if(this.running)
      return;

    this.running=true;
    this.lastT=0;

    this.raf =
      requestAnimationFrame(
        this.tick
      );
  }


  stop(){

    this.running=false;

    cancelAnimationFrame(
      this.raf
    );
  }


  renderStill(){

    this.elapsed =
      CYCLE*0.45 +
      COLS*STAGGER;

    this.draw();
  }


  destroy(){

    this.stop();

    this.ro?.disconnect();

    this.canvas.remove();
  }
}