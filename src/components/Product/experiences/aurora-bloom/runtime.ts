import type { ExperienceRuntime } from '../experience-config';

type Particle = { x:number; y:number; vx:number; vy:number; seed:number; size:number; hue:number };

export function createExperience(host: HTMLElement): ExperienceRuntime {
  host.innerHTML = `<div class="aurora-bloom" style="position:relative;width:100%;height:100%;min-height:120px;overflow:hidden;background:#05030d"><canvas style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none"></canvas></div>`;
  const root = host.firstElementChild as HTMLElement;
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Aurora Bloom could not create a canvas context');

  const particles: Particle[] = [];
  const pointer = { x:.5, y:.5, active:false, down:false };
  let width=1, height=1, ratio=1, raf=0, previous=0, destroyed=false;
  const random = (seed:number) => { const v=Math.sin(seed*127.1+311.7)*43758.5453; return v-Math.floor(v); };

  function resize() {
    const box=root.getBoundingClientRect(); width=Math.max(1,box.width); height=Math.max(1,box.height);
    ratio=Math.min(devicePixelRatio||1,2); canvas.width=Math.floor(width*ratio); canvas.height=Math.floor(height*ratio); ctx!.setTransform(ratio,0,0,ratio,0,0);
    particles.length=0; const count=Math.min(520,Math.max(180,Math.floor(width*height/3300)));
    for(let i=0;i<count;i++){const a=random(i+1)*Math.PI*2,r=Math.sqrt(random(i+21))*.62;particles.push({x:.5+Math.cos(a)*r*width/Math.max(width,height),y:.5+Math.sin(a)*r*height/Math.max(width,height),vx:0,vy:0,seed:random(i+71)*100,size:.45+random(i+101)*1.7,hue:175+random(i+151)*95});}
  }
  function move(e:PointerEvent){const b=canvas.getBoundingClientRect();pointer.x=(e.clientX-b.left)/Math.max(1,b.width);pointer.y=(e.clientY-b.top)/Math.max(1,b.height);pointer.active=true;}
  function frame(now:number){
    if(destroyed)return; const dt=Math.min((now-previous)/1000||.016,.05); previous=now; const time=now*.001, aspect=width/Math.max(1,height);
    for(const p of particles){const dx=p.x-.5,dy=p.y-.5,r=Math.sqrt(dx*dx+dy*dy)||.001,a=Math.atan2(dy,dx),flow=Math.sin(time*.34+p.seed*1.7+r*8)*.00018,swirl=.00022+r*.00072;p.vx+=(-Math.sin(a)*swirl+Math.cos(a)*flow)*aspect;p.vy+=(Math.cos(a)*swirl+Math.sin(a)*flow)/aspect;if(pointer.active){const px=p.x-pointer.x,py=p.y-pointer.y,d=Math.sqrt(px*px+py*py)||.001,reach=pointer.down?.18:.13;if(d<reach){const force=(1-d/reach)**2*(pointer.down?-.0025:.0016);p.vx+=px/d*force;p.vy+=py/d*force;}}p.vx*=Math.pow(.91,dt*60);p.vy*=Math.pow(.91,dt*60);p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;if(p.x<-.12)p.x=1.12;if(p.x>1.12)p.x=-.12;if(p.y<-.12)p.y=1.12;if(p.y>1.12)p.y=-.12;}
    const bg=ctx!.createRadialGradient(width*.5,height*.48,0,width*.5,height*.5,Math.max(width,height)*.78);bg.addColorStop(0,'#1a153d');bg.addColorStop(.42,'#0b1025');bg.addColorStop(1,'#04050d');ctx!.fillStyle=bg;ctx!.fillRect(0,0,width,height);ctx!.globalCompositeOperation='lighter';
    for(let i=0;i<particles.length;i++){const a=particles[i];for(let j=i+1;j<particles.length;j++){const b=particles[j],dx=(a.x-b.x)*width,dy=(a.y-b.y)*height,d=Math.sqrt(dx*dx+dy*dy);if(d>72)continue;ctx!.strokeStyle=`hsla(${(a.hue+b.hue)*.5},85%,72%,${(1-d/72)*.1})`;ctx!.lineWidth=.45;ctx!.beginPath();ctx!.moveTo(a.x*width,a.y*height);ctx!.lineTo(b.x*width,b.y*height);ctx!.stroke();}}
    for(const p of particles){const x=p.x*width,y=p.y*height,pulse=.82+Math.sin(time*1.8+p.seed)*.18,r=(7+p.size*5)*pulse,g=ctx!.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`hsla(${p.hue},100%,88%,.65)`);g.addColorStop(.16,`hsla(${p.hue},100%,70%,.2)`);g.addColorStop(1,`hsla(${p.hue},100%,60%,0)`);ctx!.fillStyle=g;ctx!.beginPath();ctx!.arc(x,y,r,0,Math.PI*2);ctx!.fill();ctx!.fillStyle=`hsla(${p.hue},100%,88%,${.46+p.size*.18})`;ctx!.beginPath();ctx!.arc(x,y,p.size*pulse,0,Math.PI*2);ctx!.fill();}
    ctx!.globalCompositeOperation='source-over';raf=requestAnimationFrame(frame);
  }
  const down=(e:PointerEvent)=>{pointer.down=true;move(e);canvas.setPointerCapture(e.pointerId)}; const up=()=>{pointer.down=false}; const leave=()=>{pointer.active=false;pointer.down=false};
  resize(); const observer=new ResizeObserver(resize);observer.observe(root);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointerleave',leave);previous=performance.now();raf=requestAnimationFrame(frame);
  return { destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointerleave',leave);host.replaceChildren();} };
}
