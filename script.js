/* Stellar Runner – Milky Way Drift
 * v1.0 with Play/Pause, crash/blast animations, mobile controls,
 * AND "godmode" cheat:
 *   - Desktop: type  g o d m o d e
 *   - Mobile:  double-tap Pause quickly
 */
(function(){
  // DOM
  const canvas=document.getElementById('game');
  const ctx=canvas.getContext('2d');
  const startOverlay=document.getElementById('startOverlay');
  const helpOverlay=document.getElementById('helpOverlay');
  const startBtn=document.getElementById('startBtn');
  const helpBtn=document.getElementById('helpBtn');
  const backBtn=document.getElementById('backBtn');
  const playBtn=document.getElementById('playBtn');
  const scoreChip=document.getElementById('scoreChip');
  const livesChip=document.getElementById('livesChip');
  const muteBtn=document.getElementById('muteBtn');
  const pauseBtn=document.getElementById('pauseBtn');
  const toast=document.getElementById('toast');

  // Colors
  const SPACE_COLORS={ c1:'#0b1330', c2:'#091126', c3:'#070d1d' };
  const COLOR_STAR='#ffffff', COLOR_STAR_EDGE='#cfe6ff';
  const COLOR_SUN_CORE='#fff3a6', COLOR_SUN_CORONA='#ffda4a';

  // Sprites
  let starSprite=null, sunSprite=null, spiralCanvas=null;

  // Canvas size
  let W=0,H=0;
  function makeOffscreen(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

  // Simple star icon
  function buildStarSprite(r=16){
    const s=makeOffscreen(r*2+6,r*2+6), c=s.getContext('2d'); c.translate(s.width/2,s.height/2);
    const g=c.createRadialGradient(0,0,0,0,0,r*1.25); g.addColorStop(0,'rgba(255,255,255,.95)'); g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g; c.beginPath(); c.arc(0,0,r*1.25,0,Math.PI*2); c.fill();
    c.fillStyle=COLOR_STAR; c.strokeStyle=COLOR_STAR_EDGE; c.lineWidth=2;
    c.beginPath(); for(let i=0;i<8;i++){ const ang=i*Math.PI/4; const rad=i%2? r*0.5 : r; const px=Math.cos(ang)*rad, py=Math.sin(ang)*rad; i?c.lineTo(px,py):c.moveTo(px,py);} c.closePath(); c.fill(); c.stroke();
    return s;
  }

  // Sun icon (shield)
  function buildSunSprite(r=18){
    const s=makeOffscreen(r*2+18,r*2+18), c=s.getContext('2d'); c.translate(s.width/2,s.height/2);
    const corona=c.createRadialGradient(0,0,r*0.6,0,0,r*1.6); corona.addColorStop(0,'rgba(255,218,74,.55)'); corona.addColorStop(1,'rgba(255,218,74,0)');
    c.fillStyle=corona; c.beginPath(); c.arc(0,0,r*1.6,0,Math.PI*2); c.fill();
    const core=c.createRadialGradient(-r*0.2,-r*0.1,r*0.2,0,0,r); core.addColorStop(0,'#ffffff'); core.addColorStop(1,COLOR_SUN_CORE);
    c.fillStyle=core; c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.fill();
    c.strokeStyle=COLOR_SUN_CORONA; c.lineWidth=2; c.globalAlpha=0.9;
    for(let i=0;i<18;i++){ const a=(i/18)*Math.PI*2; const o=r*1.05, len=r*0.55; const x1=Math.cos(a)*o,y1=Math.sin(a)*o,x2=Math.cos(a)*(o+len),y2=Math.sin(a)*(o+len); c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();}
    c.globalAlpha=1; return s;
  }

  // Spiral background texture
  function rebuildSpiralCanvas(){
    const size=Math.max(512, Math.ceil(Math.max(W,H)*1.4));
    spiralCanvas=makeOffscreen(size,size);
    const c=spiralCanvas.getContext('2d');
    c.clearRect(0,0,size,size); c.fillStyle='rgba(90,140,255,.25)'; c.globalAlpha=0.8;
    const arms=2, turns=3.0, step=140, cx=size/2, cy=size/2, baseR=size*0.12;
    for(let a=0;a<arms;a++) for(let i=0;i<turns*step;i++){ const t=i/step*Math.PI*2, angle=t+a*Math.PI, r=baseR+i*2.0, x=cx+Math.cos(angle)*r, y=cy+Math.sin(angle)*r; c.fillRect(x,y,2,2); }
  }

  // Resize
  function resize(){
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
    const cssW=window.innerWidth, cssH=window.innerHeight;
    canvas.style.width=cssW+'px'; canvas.style.height=cssH+'px';
    canvas.width=Math.floor(cssW*dpr); canvas.height=Math.floor(cssH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    W=cssW; H=cssH; rebuildParallax();
    starSprite=buildStarSprite(14); sunSprite=buildSunSprite(18); rebuildSpiralCanvas();
  }
  window.addEventListener('resize', resize);

  // Flight dynamics (stable hold to rise, release to fall)
  const ASCENT_VY=-7.8, DESCENT_VY=7.6, VY_RESP_HOLD=0.2, VY_RESP_RELEASE=0.14, EDGE_DAMPING=0.28;

  // Difficulty params
  function getDiff(score){
    const level=Math.floor(score/100);
    const name = score<100?'easy':score<250?'medium':score<500?'hard':'extreme';
    const tierBase = name==='easy'?3.0:name==='medium'?3.9:name==='hard'?4.9:5.7;
    const tierGap  = name==='easy'?[330,400]:name==='medium'?[270,330]:name==='hard'?[220,280]:[200,250];
    const tierWall = name==='easy'?[150,180]:name==='medium'?[130,160]:name==='hard'?[110,140]:[100,125];
    const gapMin=Math.max(160,tierGap[0]-level*10), gapMax=Math.max(gapMin+20,tierGap[1]-level*8);
    const wallMin=Math.max(80,tierWall[0]-level*6), wallMax=Math.max(wallMin+15,tierWall[1]-level*6);
    return {name,base:tierBase,gap:[gapMin,gapMax],wallGap:[wallMin,wallMax],level};
  }
  function speedBoost(score){ const steps50=Math.floor(score/50); return Math.min(8, steps50*0.45); }
  function worldSpeed(){ const d=getDiff(score); return d.base + speedBoost(score); }

  // Audio (WebAudio; light, synthesized)
  let ac=null, audioReady=false, muted=false, musicGain=null, masterGain=null, hatGain=null, bassStep=0, leadStep=0, scheduler=null;
  function initAudio(){ if(!ac){ const C=window.AudioContext||window.webkitAudioContext; ac=new C(); } if(ac.state==='suspended') ac.resume();
    masterGain=ac.createGain(); masterGain.gain.value=muted?0:1; masterGain.connect(ac.destination);
    musicGain=ac.createGain(); musicGain.gain.value=muted?0:0.08; musicGain.connect(masterGain);
    hatGain=ac.createGain(); hatGain.gain.value=muted?0:0.03; hatGain.connect(masterGain);
    audioReady=true;
  }
  function setMuted(m){ muted=m; if(masterGain) masterGain.gain.value=m?0:1; if(musicGain) musicGain.gain.value=m?0:0.08; if(hatGain) hatGain.gain.value=m?0:0.03; }
  function blip({freq=440,type='sine',dur=0.12,gain=0.08,delay=0}){ if(!ac) return; const t=ac.currentTime+delay; const o=ac.createOscillator(), g=ac.createGain(); o.type=type; o.frequency.setValueAtTime(freq,t); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.connect(g).connect(masterGain); o.start(t); o.stop(t+dur+0.02); }
  function noiseBurst({dur=0.35,gain=0.2,lp=1800,hp=120,pitchDown=0}={}){ if(!ac) return; const sr=ac.sampleRate,len=Math.floor(sr*dur),buf=ac.createBuffer(1,len,sr),data=buf.getChannelData(0); for(let i=0;i<len;i++) data[i]=Math.random()*2-1;
    const src=ac.createBufferSource(); src.buffer=buf; if(pitchDown>0){ src.playbackRate.setValueAtTime(1,ac.currentTime); src.playbackRate.exponentialRampToValueAtTime(0.4,ac.currentTime+pitchDown); }
    const g=ac.createGain(); g.gain.setValueAtTime(gain,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur);
    const hpf=ac.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=hp;
    const lpf=ac.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=lp;
    src.connect(hpf).connect(lpf).connect(g).connect(masterGain); src.start(); src.stop(ac.currentTime+dur+0.02);
  }
  function brass(t,f,len=0.28){ const o1=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain(); o1.type='sawtooth';o2.type='sawtooth';o1.frequency.setValueAtTime(f*0.997,t);o2.frequency.setValueAtTime(f*1.003,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.16,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+len);o1.connect(g);o2.connect(g);g.connect(musicGain);o1.start(t);o2.start(t);o1.stop(t+len+0.02);o2.stop(t+len+0.02);} 
  function timp(t){ const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(55,t+0.25);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.2,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+0.38);o.connect(g).connect(musicGain);o.start(t);o.stop(t+0.4);} 
  function hat(t){ const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.setValueAtTime(6000,t);o.frequency.exponentialRampToValueAtTime(9000,t+0.02);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.035,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+0.07);o.connect(g).connect(hatGain);o.start(t);o.stop(t+0.08);} 
  function whoosh(){ if(!ac) return; const t=ac.currentTime; const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(260,t);o.frequency.exponentialRampToValueAtTime(520,t+0.08);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.06,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);o.connect(g).connect(masterGain);o.start(t);o.stop(t+0.24);} 
  const scale=[220,262,294,330,392,440,523], leadP=[0,3,5,3,4,2,1,2], bassP=[0,0,3,3,5,5,3,3];
  function startMusic(){ if(!ac) return; stopMusic(); let lookahead=0.25, ahead=0.6, next=ac.currentTime+0.05;
    scheduler=setInterval(()=>{ const now=ac.currentTime; while(next<now+ahead){ const d=getDiff(score), tempo=112+Math.min(44,d.level*4), step=60/tempo/2;
      if(((leadStep)%4)===0){ brass(next, scale[leadP[leadStep%leadP.length]]*2, 0.26); timp(next); }
      const lf=scale[leadP[leadStep%leadP.length]], lo=ac.createOscillator(), lg=ac.createGain(); lo.type='triangle'; lo.frequency.setValueAtTime(lf*2,next); lg.gain.setValueAtTime(0,next); lg.gain.linearRampToValueAtTime(0.07,next+0.02); lg.gain.exponentialRampToValueAtTime(0.0001,next+step*0.9); lo.connect(lg).connect(musicGain); lo.start(next); lo.stop(next+step);
      const bf=scale[bassP[bassStep%bassP.length]], bo=ac.createOscillator(), bg=ac.createGain(); bo.type='square'; bo.frequency.setValueAtTime(bf,next); bg.gain.setValueAtTime(0,next); bg.gain.linearRampToValueAtTime(0.065,next+0.01); bg.gain.exponentialRampToValueAtTime(0.0001,next+step); bo.connect(bg).connect(musicGain); bo.start(next); bo.stop(next+step);
      hat(next); leadStep++; bassStep++; next+=step; }}, lookahead*1000);
  }
  function stopMusic(){ if(scheduler){ clearInterval(scheduler); scheduler=null; } }

  const sfx={ thrust:()=>{ if(!audioReady||muted) return; whoosh(); },
    core:()=>{ if(!audioReady||muted) return; blip({freq:900,type:'sine',dur:0.07,gain:0.09}); blip({freq:1380,type:'triangle',dur:0.07,gain:0.08,delay:0.05}); },
    shield:()=>{ if(!audioReady||muted) return; blip({freq:520,type:'triangle',dur:0.12,gain:0.09}); blip({freq:900,type:'sine',dur:0.12,gain:0.09,delay:0.06}); blip({freq:1350,type:'sine',dur:0.14,gain:0.08,delay:0.12}); blip({freq:1750,type:'triangle',dur:0.16,gain:0.07,delay:0.18}); },
    hit:()=>{ if(!audioReady||muted) return; noiseBurst({dur:0.25,gain:0.22,lp:1600,hp:150,pitchDown:0.18}); },
    crash:()=>{ if(!audioReady||muted) return; noiseBurst({dur:0.45,gain:0.28,lp:1200,hp:90,pitchDown:0.28}); },
    boom:()=>{ if(!audioReady||muted) return; noiseBurst({dur:0.55,gain:0.32,lp:2200,hp:120,pitchDown:0.35}); },
    over:()=>{ if(!audioReady||muted) return; blip({freq:340,type:'square',dur:0.35,gain:0.11}); blip({freq:230,type:'square',dur:0.4,gain:0.1,delay:0.22}); blip({freq:160,type:'square',dur:0.6,gain:0.09,delay:0.46}); }
  };

  // Game state
  const player={x:160,y:0,w:84,h:48,vy:0,thrustHeld:false,tilt:0,invuln:0, state:'alive', stateTimer:0};
  let stars=[], twinkles=[], nebulae=[], planets=[], setpieces=[];
  const gates=[], items=[], hazards=[], particles=[];
  let shakeMag=0, shakeX=0, shakeY=0, flashA=0;

  function rebuildParallax(){
    stars = Array.from({length: Math.floor((W*H)/16000)}, ()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+0.4}));
    twinkles = Array.from({length: Math.floor((W)/22)}, ()=>({x:Math.random()*W,y:Math.random()*H*0.8,t:Math.random()*Math.PI*2}));
    nebulae = Array.from({length: 3}, ()=>({x:Math.random()*W,y:Math.random()*H*0.6,r:220+Math.random()*180,h:Math.random()*0.35+0.2}));
    planets = [
      {r:10, col:'#b0a19b', ring:false, speed:0.12, y: H*0.2},
      {r:14, col:'#e0c16a', ring:false, speed:0.10, y: H*0.35},
      {r:16, col:'#5cc0ff', ring:false, speed:0.09, y: H*0.5},
      {r:12, col:'#ff6b5a', ring:false, speed:0.08, y: H*0.65},
      {r:26, col:'#e7b58b', ring:false, speed:0.06, y: H*0.25},
      {r:22, col:'#e8d18a', ring:true,  speed:0.05, y: H*0.55},
      {r:18, col:'#99e6ff', ring:true,  speed:0.045,y: H*0.75},
      {r:18, col:'#6aa0ff', ring:false, speed:0.04, y: H*0.4}
    ].map(p=>({...p, x: Math.random()*W + 100}));
    setpieces = []; for(let i=0;i<3;i++) spawnSetpiece(W + i*(W*0.7 + Math.random()*240));
  }
  function spawnSetpiece(x){ const type=Math.random()<0.5?'cluster':(Math.random()<0.5?'ring':'station'); const y=80+Math.random()*(H-160); const r=120+Math.random()*160; setpieces.push({type,x,y,r,alpha:0.18+Math.random()*0.12}); }

  let running=false, gameOver=false, paused=false, score=0, shields=0; const MAX_SHIELDS=3;
  let gateTimer=0, shieldCooldown=0, spiralRot=0, hazardClock=0;

  function reset(){
    resize(); running=false; paused=false; gameOver=false; score=0; shields=0;
    player.vy=0; player.y=H/2-player.h/2; player.invuln=0; player.state='alive'; player.stateTimer=0;
    gates.length=0; items.length=0; hazards.length=0; particles.length=0;
    gateTimer=20; shieldCooldown=240; flashA=0; shakeMag=0; hazardClock=0;
    draw(); updateHUD(); updatePauseUI();
  }
  function updateHUD(){
    scoreChip.textContent='Score: '+Math.floor(score);
    livesChip.textContent='Shields: '+(unlimitedShields ? '∞' : shields);
  }
  function start(){ running=true; paused=false; gameOver=false; if(audioReady) startMusic(); hide(startOverlay); hide(helpOverlay); updatePauseUI(); }
  function togglePause(){ if(!running||gameOver) return; paused=!paused; if(paused) stopMusic(); else if(audioReady) startMusic(); updatePauseUI(); }
  function updatePauseUI(){ pauseBtn.textContent = paused ? '▶️ Resume' : '⏸ Pause'; pauseBtn.setAttribute('aria-pressed', String(paused)); }

  // Spawns & updates
  function spawnGate(){
    const d=getDiff(score);
    const gapH=Math.floor(d.gap[0]+Math.random()*(d.gap[1]-d.gap[0]));
    const margin=50; const gapY=Math.floor(margin+Math.random()*(H - margin*2 - gapH));
    const w=Math.max(60,Math.min(90,W*0.07));
    let itemType='star';
    if(shieldCooldown<=0 && Math.random()<0.16 && shields<MAX_SHIELDS){ itemType='sun'; shieldCooldown=420; }
    gates.push({x:W+10, gapY, gapH, w, itemType, itemSpawned:false});
  }
  function maybeSpawnItemForGate(g){
    if(g.itemSpawned||!g.itemType) return;
    const r=g.itemType==='sun'?18:14, x=g.x+g.w+46, jitter=g.itemType==='sun'?4:10;
    const y=g.gapY+g.gapH/2 + (Math.random()*jitter*2 - jitter);
    items.push({type:g.itemType, x, y, r, wobble:Math.random()*Math.PI*2});
    g.itemSpawned=true
