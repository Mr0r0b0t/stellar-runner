(() => {
  // DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startOverlay = document.getElementById('startOverlay');
  const helpOverlay  = document.getElementById('helpOverlay');
  const startBtn = document.getElementById('startBtn');
  const helpBtn  = document.getElementById('helpBtn');
  const backBtn  = document.getElementById('backBtn');
  const playBtn  = document.getElementById('playBtn');
  const scoreChip= document.getElementById('scoreChip');
  const livesChip= document.getElementById('livesChip');
  const muteBtn  = document.getElementById('muteBtn');

  // ==== Colors for Canvas (explicit strings; no CSS var() in gradients) ====
  const SPACE_COLORS={ c1:'#0b1330', c2:'#091126', c3:'#070d1d' };
  const COLOR_STAR='#ffffff', COLOR_STAR_EDGE='#cfe6ff';
  const COLOR_SUN_CORE='#fff3a6', COLOR_SUN_CORONA='#ffda4a';

  // ==== Responsive canvas ====
  let W=0,H=0, starSprite=null, sunSprite=null, spiralCanvas=null;
  function makeOffscreen(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function buildStarSprite(r=16){
    const s=makeOffscreen(r*2+6,r*2+6), c=s.getContext('2d'); c.translate(s.width/2,s.height/2);
    const g=c.createRadialGradient(0,0,0,0,0,r*1.25); g.addColorStop(0,'rgba(255,255,255,.95)'); g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g; c.beginPath(); c.arc(0,0,r*1.25,0,Math.PI*2); c.fill();
    c.fillStyle=COLOR_STAR; c.strokeStyle=COLOR_STAR_EDGE; c.lineWidth=2;
    c.beginPath(); for(let i=0;i<8;i++){ const ang=i*Math.PI/4; const rad=i%2? r*0.5 : r; const px=Math.cos(ang)*rad, py=Math.sin(ang)*rad; i?c.lineTo(px,py):c.moveTo(px,py);} c.closePath(); c.fill(); c.stroke();
    return s;
  }
  function buildSunSprite(r=18){
    const s=makeOffscreen(r*2+18,r*2+18), c=s.getContext('2d'); c.translate(s.width/2,s.height/2);
    const corona=c.createRadialGradient(0,0,r*0.6,0,0,r*1.6); corona.addColorStop(0,'rgba(255,218,74,.55)'); corona.addColorStop(1,'rgba(255,218,74,0)');
    c.fillStyle=corona; c.beginPath(); c.arc(0,0,r*1.6,0,Math.PI*2); c.fill();
    const core=c.createRadialGradient(-r*0.2,-r*0.1,r*0.2,0,0,r); core.addColorStop(0,'#ffffff'); core.addColorStop(1,COLOR_SUN_CORE);
    c.fillStyle=core; c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.fill();
    c.strokeStyle=COLOR_SUN_CORONA; c.lineWidth=2; c.globalAlpha=0.9;
    for(let i=0;i<18;i++){ const a=(i/18)*Math.PI*2; const o=r*1.05, len=r*0.55; const x1=Math.cos(a)*o,y1=Math.sin(a)*o,x2=Math.cos(a)*(o+len),y2=Math.sin(a)*(o+len); c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();}
    return s;
  }
  function rebuildSpiralCanvas(){
    const size=Math.max(512, Math.ceil(Math.max(W,H)*1.4));
    spiralCanvas=makeOffscreen(size,size); const c=spiralCanvas.getContext('2d');
    c.clearRect(0,0,size,size); c.fillStyle='rgba(90,140,255,.25)'; c.globalAlpha=0.8;
    const arms=2, turns=3.0, step=140, cx=size/2, cy=size/2, baseR=size*0.12;
    for(let a=0;a<arms;a++) for(let i=0;i<turns*step;i++){
      const t=i/step*Math.PI*2, angle=t+a*Math.PI, r=baseR+i*2.0, x=cx+Math.cos(angle)*r, y=cy+Math.sin(angle)*r; c.fillRect(x,y,2,2);
    }
  }
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

  // ==== Physics & difficulty ====
  const GRAVITY=0.22, THRUST_ACCEL=1.15, DRAG=0.992, MAX_ASCENT=-6.0, MAX_DESCENT=6.0;
  function getDiff(score){
    const level = Math.floor(score/100);
    const name = score < 100 ? 'easy' : score < 250 ? 'medium' : score < 500 ? 'hard' : 'extreme';
    const tierBase = name==='easy'?3.0 : name==='medium'?3.9 : name==='hard'?4.9 : 5.7;
    const tierGap  = name==='easy'?[330,400] : name==='medium'?[270,330] : name==='hard'?[220,280] : [200,250];
    const tierWall = name==='easy'?[150,180] : name==='medium'?[130,160] : name==='hard'?[110,140] : [100,125];
    const speed   = tierBase; // base, we add 50pt boosts below
    const gapMin  = Math.max(160, tierGap[0] - level*10);
    const gapMax  = Math.max(gapMin+20, tierGap[1] - level*8);
    const wallMin = Math.max(80,  tierWall[0] - level*6);
    const wallMax = Math.max(wallMin+15, tierWall[1] - level*6);
    return { name, base:speed, gap:[gapMin,gapMax], wallGap:[wallMin,wallMax], level };
  }

  // NEW: smooth speed boost every 50 points (capped)
  function speedBoost(score){
    const steps50 = Math.floor(score/50);      // 0,1,2,3...
    return Math.min(8, steps50 * 0.45);        // each 50 adds +0.45 px/frame, cap +8
  }

  // ==== Audio (WebAudio; synth-only, autoplay-safe) ====
  let ac=null, audioReady=false, muted=false;
  let musicGain=null, masterGain=null, hatGain=null, bassStep=0, leadStep=0, tempo=112, scheduler=null;
  function initAudio(){ if(!ac){ const C=window.AudioContext||window.webkitAudioContext; ac=new C(); }
    if(ac.state==='suspended') ac.resume();
    masterGain=ac.createGain(); masterGain.gain.value=muted?0:1; masterGain.connect(ac.destination);
    musicGain =ac.createGain(); musicGain.gain.value = muted?0:0.08; musicGain.connect(masterGain);
    hatGain   =ac.createGain(); hatGain.gain.value   = muted?0:0.03; hatGain.connect(masterGain);
    audioReady=true;
  }
  function setMuted(m){ muted=m; if(masterGain) masterGain.gain.value=m?0:1; if(musicGain) musicGain.gain.value=m?0:0.08; if(hatGain) hatGain.gain.value=m?0:0.03; }
  function blip({freq=440,type='sine',dur=0.12,gain=0.08,delay=0}){ if(!ac) return; const t=ac.currentTime+delay; const o=ac.createOscillator(), g=ac.createGain(); o.type=type; o.frequency.setValueAtTime(freq,t); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.connect(g).connect(masterGain); o.start(t); o.stop(t+dur+0.02); }
  function brass(time,freq,len=0.28){ const o1=ac.createOscillator(), o2=ac.createOscillator(), g=ac.createGain(); o1.type='sawtooth'; o2.type='sawtooth'; o1.frequency.setValueAtTime(freq*0.997,time); o2.frequency.setValueAtTime(freq*1.003,time); g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.16,time+0.02); g.gain.exponentialRampToValueAtTime(0.0001,time+len); o1.connect(g); o2.connect(g); g.connect(musicGain); o1.start(time); o2.start(time); o1.stop(time+len+0.02); o2.stop(time+len+0.02); }
  function timp(time){ const o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.setValueAtTime(110,time); o.frequency.exponentialRampToValueAtTime(55,time+0.25); g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.2,time+0.01); g.gain.exponentialRampToValueAtTime(0.0001,time+0.38); o.connect(g).connect(musicGain); o.start(time); o.stop(time+0.4); }
  function hat(time){ const o=ac.createOscillator(), g=ac.createGain(); o.type='square'; o.frequency.setValueAtTime(6000,time); o.frequency.exponentialRampToValueAtTime(9000,time+0.02); g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.035,time+0.005); g.gain.exponentialRampToValueAtTime(0.0001,time+0.07); o.connect(g).connect(hatGain); o.start(time); o.stop(time+0.08); }
  function whoosh(){ if(!ac) return; const t=ac.currentTime; const o=ac.createOscillator(), g=ac.createGain(); o.type='triangle'; o.frequency.setValueAtTime(240,t); o.frequency.exponentialRampToValueAtTime(420,t+0.08); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.05,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.18); o.connect(g).connect(masterGain); o.start(t); o.stop(t+0.2); }
  const scale=[220,262,294,330,392,440,523];
  const leadP=[0,3,5,3,4,2,1,2];
  const bassP=[0,0,3,3,5,5,3,3];
  function startMusic(){ if(!ac) return; stopMusic(); let lookahead=0.25, scheduleAhead=0.6; let next=ac.currentTime+0.05;
    scheduler=setInterval(()=>{ const now=ac.currentTime; while(next<now+scheduleAhead){
      const d=getDiff(score); // tempo naturally increases with level; we keep it
      const step=60/(112 + Math.min(44, d.level*4))/2;
      if(((leadStep)%4)===0){ brass(next, scale[leadP[leadStep%leadP.length]]*2, 0.26); timp(next); }
      const lf=scale[leadP[leadStep%leadP.length]]; const lo=ac.createOscillator(), lg=ac.createGain(); lo.type='triangle'; lo.frequency.setValueAtTime(lf*2,next);
      lg.gain.setValueAtTime(0,next); lg.gain.linearRampToValueAtTime(0.07,next+0.02); lg.gain.exponentialRampToValueAtTime(0.0001,next+step*0.9);
      lo.connect(lg).connect(musicGain); lo.start(next); lo.stop(next+step);
      const bf=scale[bassP[bassStep%bassP.length]]; const bo=ac.createOscillator(), bg=ac.createGain(); bo.type='square'; bo.frequency.setValueAtTime(bf,next);
      bg.gain.setValueAtTime(0,next); bg.gain.linearRampToValueAtTime(0.065,next+0.01); bg.gain.exponentialRampToValueAtTime(0.0001,next+step);
      bo.connect(bg).connect(musicGain); bo.start(next); bo.stop(next+step);
      hat(next); leadStep++; bassStep++; next+=step;
    }}, lookahead*1000);
  }
  function stopMusic(){ if(scheduler){ clearInterval(scheduler); scheduler=null; } }
  const sfx={ thrust:()=>{ if(!audioReady||muted) return; whoosh(); },
    core:()=>{ if(!audioReady||muted) return; blip({freq:900,type:'sine',dur:0.07,gain:0.09}); blip({freq:1380,type:'triangle',dur:0.07,gain:0.08,delay:0.05}); },
    shield:()=>{ if(!audioReady||muted) return; blip({freq:520,type:'triangle',dur:0.12,gain:0.09}); blip({freq:900,type:'sine',dur:0.12,gain:0.09,delay:0.06}); blip({freq:1350,type:'sine',dur:0.14,gain:0.08,delay:0.12}); blip({freq:1750,type:'triangle',dur:0.16,gain:0.07,delay:0.18}); },
    hit:()=>{ if(!audioReady||muted) return; blip({freq:180,type:'sawtooth',dur:0.22,gain:0.12}); },
    over:()=>{ if(!audioReady||muted) return; blip({freq:340,type:'square',dur:0.35,gain:0.11}); blip({freq:230,type:'square',dur:0.4,gain:0.1,delay:0.22}); blip({freq:160,type:'square',dur:0.6,gain:0.09,delay:0.46}); } };

  // ==== Entities & background ====
  const player={x:160,y:0,w:44,h:72,vy:0,thrustHeld:false,runPhase:0,invuln:0};
  let stars=[], twinkles=[], nebulae=[], planets=[], setpieces=[];
  const gates=[], items=[], hazards=[];
  function rebuildParallax(){
    stars = Array.from({length: Math.floor((W*H)/16000)}, ()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+0.4}));
    twinkles = Array.from({length: Math.floor((W)/22)}, ()=>({x:Math.random()*W,y:Math.random()*H * 0.8,t:Math.random()*Math.PI*2}));
    nebulae = Array.from({length: 3}, ()=>({x:Math.random()*W,y:Math.random()*H*0.6,r: 220+Math.random()*180,h: Math.random()*0.35+0.2}));
    planets = [
      {name:'Mercury', r:10, col:'#b0a19b', ring:false, speed:0.12, y: H*0.2},
      {name:'Venus',   r:14, col:'#e0c16a', ring:false, speed:0.10, y: H*0.35},
      {name:'Earth',   r:16, col:'#5cc0ff', ring:false, speed:0.09,  y: H*0.5},
      {name:'Mars',    r:12, col:'#ff6b5a', ring:false, speed:0.08,  y: H*0.65},
      {name:'Jupiter', r:26, col:'#e7b58b', ring:false, speed:0.06,  y: H*0.25},
      {name:'Saturn',  r:22, col:'#e8d18a', ring:true,  speed:0.05,  y: H*0.55},
      {name:'Uranus',  r:18, col:'#99e6ff', ring:true,  speed:0.045, y: H*0.75},
      {name:'Neptune', r:18, col:'#6aa0ff', ring:false, speed:0.04,  y: H*0.4}
    ].map(p=>({...p, x: Math.random()*W + 100}));
    setpieces = []; for(let i=0;i<3;i++) spawnSetpiece(W + i*(W*0.7 + Math.random()*240));
  }
  function spawnSetpiece(x){ const type=Math.random()<0.5?'cluster':(Math.random()<0.5?'ring':'station'); const y=80+Math.random()*(H-160); const r=120+Math.random()*160; setpieces.push({type,x,y,r,alpha:0.18+Math.random()*0.12}); }

  // ==== State ====
  let running=false, gameOver=false, score=0, shields=0; const MAX_SHIELDS=3;
  let gateTimer=0, shieldCooldown=0, spiralRot=0;

  function reset(){ resize(); running=false; gameOver=false; score=0; shields=0; player.vy=0; player.y=H/2-player.h/2; player.invuln=0; gates.length=0; items.length=0; hazards.length=0; gateTimer=20; shieldCooldown=240; draw(); updateHUD(); }
  function updateHUD(){ scoreChip.textContent='Score: '+Math.floor(score); livesChip.textContent='Shields: '+shields; }
  function start(){ running=true; gameOver=false; if(audioReady) startMusic(); hide(startOverlay); hide(helpOverlay); }

  // ==== Spawning ====
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
    const r=g.itemType==='sun'?18:14; const x=g.x+g.w+46;
    const jitter=g.itemType==='sun'?4:10;
    const y=g.gapY+g.gapH/2 + (Math.random()*jitter*2 - jitter);
    items.push({type:g.itemType, x, y, r, wobble:Math.random()*Math.PI*2});
    g.itemSpawned=true;
  }
  function maxHazards(){ const after100 = Math.max(0, Math.floor((score-100)/50)+1); return Math.min(6, 2 + Math.floor(after100*0.6)); }

  // Meteors: only after 100 points, probability scales every 50
  function maybeSpawnHazard(){
    if(score < 100) return; // enforce start-after-100 rule
    const d=getDiff(score);
    const cap=maxHazards(); if(hazards.length>=cap) return;
    const increments = Math.floor((score-100)/50)+1;           // 1,2,3...
    const p = Math.min(0.12, 0.02 + increments*0.008);         // spawn chance scales
    if(Math.random()<p){
      const r=10+Math.random()*18; const poly=buildMeteoroidPoly(r);
      const y=30+Math.random()*(H-60); const vy=(Math.random()*0.8-0.4);
      const sp = 2 + increments*0.6;                            // horizontal base speed grows each 50
      hazards.push({x:W+30, y, r, vy, rot:Math.random()*Math.PI*2, poly, sp, trail:[]});
    }
  }

  // ==== Updates ====
  function updatePlayer(){
    if(player.thrustHeld){ player.vy -= THRUST_ACCEL; }
    player.vy += GRAVITY; player.vy *= DRAG;
    if(player.vy < MAX_ASCENT) player.vy = MAX_ASCENT;
    if(player.vy > MAX_DESCENT) player.vy = MAX_DESCENT;
    player.y += player.vy;
    if(player.y<6){ player.y=6; player.vy=Math.max(0,player.vy*0.2); }
    if(player.y+player.h>H-6){ player.y=H-6-player.h; player.vy=Math.min(0,player.vy*0.2); }
    player.runPhase += 0.20 + (getDiff(score).base*0.02);
    if(player.invuln>0) player.invuln--;
  }

  function worldSpeed(){ const d=getDiff(score); return d.base + speedBoost(score); }

  function updateGates(){
    const d=getDiff(score); gateTimer--;
    if(gateTimer<=0){ spawnGate(); gateTimer=Math.floor(d.wallGap[0]+Math.random()*(d.wallGap[1]-d.wallGap[0])); }
    const speed = worldSpeed();
    for(let i=gates.length-1;i>=0;i--){
      const g=gates[i]; g.x -= speed;
      if(!g.itemSpawned && g.x < W-40) maybeSpawnItemForGate(g);
      if(g.x + g.w < -20) gates.splice(i,1);
    }
    if(shieldCooldown>0) shieldCooldown--;
    maybeSpawnHazard();
  }

  function updateItems(){
    const speed = worldSpeed();
    for(let i=items.length-1;i>=0;i--){
      const c=items[i]; c.x -= speed; c.wobble += 0.1; c.y += Math.sin(c.wobble)*0.18;
      if(c.x < -40) items.splice(i,1);
    }
  }

  function updateHazards(){
    for(let i=hazards.length-1;i>=0;i--){
      const h=hazards[i];
      const speedX = worldSpeed()*0.6 + h.sp;   // base world scroll + meteor’s own speed growth
      h.x -= speedX; h.y += h.vy;
      if(h.y<12||h.y>H-12) h.vy*=-1;
      h.rot += 0.03;
      const t={x:h.x+Math.cos(h.rot)*h.r*0.6, y:h.y+Math.sin(h.rot)*h.r*0.6, a:0.5}; h.trail.push(t); if(h.trail.length>8) h.trail.shift();
      if(h.x<-50) hazards.splice(i,1);
    }
  }

  function updatePlanets(){
    const sp = worldSpeed()*0.4;
    planets.forEach(p=>{ p.x -= sp*p.speed; if(p.x < -p.r-50) { p.x = W + 200 + Math.random()*300; p.y = Math.max(80, Math.min(H-80, p.y + (Math.random()*120-60))); } });
    for(let i=setpieces.length-1;i>=0;i--){ const s=setpieces[i]; s.x -= (worldSpeed()*0.55 + 1.1); if(s.x < -s.r-200){ setpieces.splice(i,1); spawnSetpiece(W + 200 + Math.random()*200); } }
  }

  // ==== Collision ====
  function collide(){
    const pbox={x:player.x+6, y:player.y+6, w:player.w-12, h:player.h-12};
    // Gates
    for(const g of gates){
      if(pbox.x < g.x + g.w && pbox.x + pbox.w > g.x){
        const inGap = (pbox.y > g.gapY) && (pbox.y + pbox.h < g.gapY + g.gapH);
        if(!inGap){
          if(player.invuln>0) break;
          if(shields>0){
            shields--; player.invuln=90; sfx.hit();
            const target=g.gapY+g.gapH/2 - pbox.h/2; player.y += (target - player.y)*0.4; player.vy*=0.3; updateHUD(); break;
          }
          sfx.over(); stopMusic(); return endGame();
        }
      }
    }
    // Items
    for(let i=items.length-1;i>=0;i--){
      const it=items[i]; const dx=(pbox.x+pbox.w/2)-it.x, dy=(pbox.y+pbox.h/2)-it.y; const rr=(it.r+Math.min(pbox.w,pbox.h)/2);
      if(dx*dx+dy*dy<=rr*rr){
        if(it.type==='sun'){ if(shields<MAX_SHIELDS) shields++; sfx.shield(); } else { score+=10; sfx.core(); }
        items.splice(i,1); updateHUD();
      }
    }
    // Hazards
    for(const h of hazards){
      const dx=(pbox.x+pbox.w/2)-h.x, dy=(pbox.y+pbox.h/2)-h.y; const rr=(Math.min(pbox.w,pbox.h)/2 + h.r*0.8);
      if(dx*dx+dy*dy<=rr*rr){
        if(player.invuln>0) break;
        if(shields>0){ shields--; player.invuln=90; sfx.hit(); updateHUD(); break; }
        sfx.over(); stopMusic(); return endGame();
      }
    }
  }

  function endGame(){ gameOver=true; running=false; show(startOverlay); hide(helpOverlay); startBtn.textContent='Restart'; helpBtn.textContent='Help'; }

  // ==== Drawing ====
  function drawSky(){
    const grad=ctx.createLinearGradient(0,0,0,H); grad.addColorStop(0,SPACE_COLORS.c1); grad.addColorStop(.5,SPACE_COLORS.c2); grad.addColorStop(1,SPACE_COLORS.c3);
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    spiralRot += 0.0012; ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(spiralRot); const sc=spiralCanvas; if(sc){ const s=Math.max(W,H)*1.2; ctx.drawImage(sc,-s/2,-s/2,s,s);} ctx.restore();
    setpieces.forEach(sp=>{ ctx.save(); ctx.globalAlpha=sp.alpha; if(sp.type==='cluster'){ const g=ctx.createRadialGradient(sp.x,sp.y,10,sp.x,sp.y,sp.r); g.addColorStop(0,'rgba(90,160,255,.32)'); g.addColorStop(1,'rgba(90,160,255,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sp.x,sp.y,sp.r,0,Math.PI*2); ctx.fill(); } else if(sp.type==='ring'){ ctx.strokeStyle='rgba(160,220,255,.2)'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(sp.x,sp.y, sp.r*0.9, sp.r*0.5, 0.4, 0, Math.PI*2); ctx.stroke(); } else { ctx.fillStyle='rgba(180,200,255,.16)'; ctx.fillRect(sp.x-30, sp.y-6, 60, 12); ctx.fillRect(sp.x-6, sp.y-26, 12, 52); ctx.beginPath(); ctx.arc(sp.x, sp.y-26, 8, 0, Math.PI*2); ctx.fill(); } ctx.restore(); });
    nebulae.forEach(n=>{ const rgrad=ctx.createRadialGradient(n.x,n.y,10,n.x,n.y,n.r); rgrad.addColorStop(0,'rgba(75,212,255,'+n.h+')'); rgrad.addColorStop(1,'rgba(75,212,255,0)'); ctx.fillStyle=rgrad; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill(); n.x-=0.05; if(n.x<-n.r){ n.x=W+n.r; n.y=Math.random()*H*0.6; } });
    ctx.fillStyle='rgba(255,255,255,.9)'; const spd = worldSpeed();
    ctx.beginPath(); for(const s of stars){ ctx.moveTo(s.x+s.r,s.y); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); s.x-=spd*0.05; if(s.x<-2){ s.x=W+Math.random()*60; s.y=Math.random()*H; } } ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.8)'; for(const t of twinkles){ const a=(Math.sin(t.t)+1)/2; ctx.globalAlpha=0.3+0.7*a; ctx.fillRect(t.x,t.y,2,2); t.t+=0.07; if((t.x-=0.3)<-2) t.x=W+Math.random()*40; } ctx.globalAlpha=1;
    planets.forEach(pl=>{ ctx.save(); ctx.shadowColor=pl.col; ctx.shadowBlur=10; ctx.fillStyle=pl.col; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI*2); ctx.fill(); if(pl.ring){ ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(pl.x, pl.y, pl.r+8, pl.r*0.55, 0.3, 0, Math.PI*2); ctx.stroke(); } ctx.restore(); });
  }
  function roundRect(x,y,w,h,r,fill){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); if(fill) ctx.fill(); else ctx.stroke(); }
  function drawStarItem(x,y,r){ const time=performance.now()*0.004; const scale=1+Math.sin(time + x*0.01 + y*0.01)*0.05; const s=starSprite; if(!s) return; const w=s.width*scale, h=s.height*scale; ctx.save(); ctx.translate(x,y); ctx.rotate((performance.now()*0.0015)%(Math.PI*2)); ctx.drawImage(s,-w/2,-h/2,w,h); ctx.restore(); }
  function drawSunItem(x,y,r){ const s=sunSprite; if(!s) return; const pulse=1+Math.sin(performance.now()*0.003 + x*0.01)*0.06; const w=s.width*pulse, h=s.height*pulse; ctx.save(); ctx.translate(x,y); ctx.rotate((performance.now()*0.001)%(Math.PI*2)); ctx.drawImage(s,-w/2,-h/2,w,h); ctx.restore(); }
  function buildMeteoroidPoly(r){ const pts=[]; for(let i=0;i<9;i++){ const ang=(i/9)*Math.PI*2; const rad=r*(0.7+Math.random()*0.4); pts.push([Math.cos(ang)*rad, Math.sin(ang)*rad]); } return pts; }
  function drawMeteoroid(h){ if(h.trail&&h.trail.length){ for(let i=0;i<h.trail.length;i++){ const t=h.trail[i]; const a=(i+1)/h.trail.length*0.5; const g=ctx.createRadialGradient(t.x,t.y,0,t.x,t.y,10); g.addColorStop(0,'rgba(255,180,120,'+a+')'); g.addColorStop(1,'rgba(255,180,120,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(t.x,t.y,10,0,Math.PI*2); ctx.fill(); } } ctx.save(); ctx.translate(h.x,h.y); ctx.rotate(h.rot); ctx.fillStyle='#c7895a'; ctx.strokeStyle='#4c2c18'; ctx.lineWidth=2; ctx.beginPath(); h.poly.forEach(([px,py],i)=>{ i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }

  function drawAstronaut(px, py){
    ctx.save(); ctx.translate(px, py); const swing=Math.sin(player.runPhase)*10;
    ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(26,player.h-6,16,6,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle='#a9c7ff'; ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=1.5;
    ctx.save(); ctx.translate(12, 46); ctx.rotate(swing*0.03); roundRect(-3,0,9,26,4,true); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(28, 46); ctx.rotate(-swing*0.03); roundRect(-3,0,9,26,4,true); ctx.stroke(); ctx.restore();
    roundRect(12,14,22,30,8,true); ctx.strokeRect(12,14,22,30);
    ctx.beginPath(); ctx.arc(23,10,9,0,Math.PI*2); ctx.fillStyle='#cfe0ff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(23,10,7,5,0,0,Math.PI*2); ctx.fillStyle='rgba(20,40,70,.65)'; ctx.fill();
    ctx.save(); ctx.translate(2,20); ctx.rotate(swing*0.02); roundRect(0,0,8,16,4,true); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(24,20); ctx.rotate(-swing*0.02); roundRect(0,0,8,16,4,true); ctx.stroke(); ctx.restore();
    if(player.thrustHeld){ ctx.save(); ctx.globalAlpha=0.8; ctx.fillStyle='rgba(124,240,255,.9)'; ctx.beginPath(); ctx.ellipse(8,32,4,8,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }

  // ==== Loop & draw ====
  function draw(){
    drawSky();
    for(const g of gates){ const x=g.x, topH=g.gapY, botY=g.gapY+g.gapH; ctx.fillStyle='#141e3d'; ctx.fillRect(x,0,g.w,topH); ctx.fillRect(x,botY,g.w,H-botY); ctx.fillStyle='rgba(75,212,255,.5)'; ctx.fillRect(x-2, topH-3, g.w+4, 3); ctx.fillRect(x-2, botY, g.w+4, 3); }
    for(const it of items){ if(it.type==='sun'){ drawSunItem(it.x,it.y,it.r); } else { drawStarItem(it.x,it.y,it.r); } }
    for(const h of hazards){ drawMeteoroid(h); }
    ctx.save(); ctx.translate(player.x, player.y); if(player.invuln>0 && (Math.floor(player.invuln/5)%2===0)) ctx.globalAlpha=0.55; drawAstronaut(0,0); ctx.restore(); ctx.globalAlpha=1;
    if(gameOver){ ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#e9f4ff'; ctx.font='bold 22px system-ui, sans-serif'; const msg=`Mission Failed — Final Score: ${Math.floor(score)}`; const mw=ctx.measureText(msg).width; ctx.fillText(msg,(W-mw)/2, H/2); }
  }
  function loop(){ requestAnimationFrame(loop); if(!running||gameOver){ draw(); return; } updatePlayer(); updateGates(); updateItems(); updateHazards(); updatePlanets(); collide(); draw(); }

  // ==== UI helpers ====
  function userGesture(){ if(!audioReady){ initAudio(); } }
  function hide(el){ el.classList.add('hide'); el.setAttribute('aria-hidden','true'); }
  function show(el){ el.classList.remove('hide'); el.setAttribute('aria-hidden','false'); }

  // ==== Events (fixed restart logic) ====
  startBtn.addEventListener('click',()=>{
    userGesture();
    if(gameOver) reset();      // ensure proper restart
    start();
  });
  helpBtn.addEventListener('click',()=>{ hide(startOverlay); show(helpOverlay); });
  backBtn?.addEventListener('click',()=>{ hide(helpOverlay); show(startOverlay); });
  playBtn?.addEventListener('click',()=>{ userGesture(); if(gameOver) reset(); start(); });

  let thrustKeyDown=false;
  window.addEventListener('keydown',e=>{
    if(e.code==='Space'||e.code==='ArrowUp'){
      e.preventDefault();
      if(!running && !gameOver){ userGesture(); start(); sfx.thrust(); }
      else if(gameOver){ reset(); userGesture(); start(); sfx.thrust(); }
      if(!thrustKeyDown){ thrustKeyDown=true; sfx.thrust(); }
      player.thrustHeld=true;
    }
    if(e.code==='KeyM'){ setMuted(!muted); muteBtn.setAttribute('aria-pressed', String(muted)); muteBtn.textContent = muted?'🔇':'🔊'; }
  });
  window.addEventListener('keyup',e=>{ if(e.code==='Space'||e.code==='ArrowUp'){ player.thrustHeld=false; thrustKeyDown=false; } });

  // IMPORTANT: clicking the canvas NO LONGER restarts after game over
  canvas.addEventListener('pointerdown',()=>{
    if(!running && !gameOver){ userGesture(); start(); sfx.thrust(); }
    // if gameOver: do nothing; use Restart button or Space/↑
    else if(!gameOver){ player.thrustHeld=true; sfx.thrust(); }
  });
  window.addEventListener('pointerup',()=>{ player.thrustHeld=false; thrustKeyDown=false; });

  muteBtn.addEventListener('click',()=>{ setMuted(!muted); muteBtn.textContent = muted?'🔇':'🔊'; muteBtn.setAttribute('aria-pressed', String(muted)); });
  document.addEventListener('visibilitychange',()=>{ if(!ac) return; if(document.hidden){ stopMusic(); } else if(running && audioReady){ startMusic(); } });

  // ==== Smoke tests (keep lightweight) ====
  function assert(name, cond){ console[name.includes('FAIL')?'error':'log'](`[TEST] ${name}: ${cond?'PASS':'FAIL'}`); }
  (function runSmokeTests(){
    try{
      assert('getDiff easy(0)', getDiff(0).name==='easy');
      assert('speedBoost 0 -> 0', speedBoost(0)===0);
      assert('speedBoost 50 increases', speedBoost(50)>0);
      assert('meteors off <100', (function(){ let s=score; score=90; let before=hazards.length; for(let i=0;i<30;i++) maybeSpawnHazard(); let ok = hazards.length===before; score=s; hazards.length=0; return ok; })());
    }catch(e){ console.error('[TEST] Smoke tests error:', e); }
  })();

  // Boot
  resize(); reset(); loop();
})();
