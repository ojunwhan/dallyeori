import { DUCKS_NINE, RACE_ENGINE_PHYSICS } from './constants.js';
import { spend } from './services/hearts.js';

/**
 * dallyeori-v3.html 로직 동일 — iframe 없이 앱 페이지에서 실행
 * @param {HTMLElement} hostEl
 * @param {{
 *   onFinish?: (payload: object) => void,
 *   terrainKey?: string,
 *   getAppState?: () => object,
 *   serverRace?: { socket: import('socket.io-client').Socket, roomId: string, mySlot: 0|1, myDuckId?: string, oppDuckId?: string, myDuckName?: string, oppDuckName?: string, emitTap?: (foot: 'left'|'right') => void },
 * }} options
 * @returns {() => void} stop — 리스너·rAF 정리
 */
export function mountRaceV3Game(hostEl, options) {
  const onFinish = options && options.onFinish;
  const getAppState = options && typeof options.getAppState === 'function' ? options.getAppState : null;
  function normalizeTerrainKey(k) {
    const s = k && String(k);
    if (s === 'ice' || s === 'cliff' || s === 'iceCliff') return s;
    return 'normal';
  }
  const raceTerrainKey = normalizeTerrainKey(options && options.terrainKey);
  const serverRaceOpt = options && options.serverRace;
  const myServerSlot =
    serverRaceOpt && (serverRaceOpt.mySlot === 0 || serverRaceOpt.mySlot === 1)
      ? serverRaceOpt.mySlot
      : 0;
  function isServerRaceConnected() {
    return !!(serverRaceOpt && serverRaceOpt.socket);
  }
  function shadeHex(hex, f) {
    const m = /^#?([0-9a-fA-F]{6})$/i.exec(hex || '');
    if (!m) return '#888888';
    const n = parseInt(m[1], 16);
    let r = Math.round(((n >> 16) & 255) * f);
    let g = Math.round(((n >> 8) & 255) * f);
    let b = Math.round((n & 255) * f);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  function duckDefById(id) {
    const sid = (id && String(id)) || 'bori';
    return DUCKS_NINE.find((d) => d.id === sid) || DUCKS_NINE[0];
  }
  /** P/CPU 외형·레인 — 서버: 내 duckId / 상대 duckId, 로컬: P=아리·CPU=두리 스타일 */
  function duckVisualState(p) {
    const sid = !isServerRaceConnected()
      ? p.isCpu
        ? 'duri'
        : 'ari'
      : p === P
        ? serverRaceOpt.myDuckId || 'bori'
        : serverRaceOpt.oppDuckId || 'bori';
    const id = (sid && String(sid)) || 'bori';
    const def = duckDefById(id);
    const lane = !isServerRaceConnected()
      ? p.isCpu
        ? 0.72
        : 0.28
      : myServerSlot === 0
        ? p === P
          ? 0.28
          : 0.72
        : p === P
          ? 0.72
          : 0.28;
    let displayName = def.name;
    let glyph = displayName.charAt(0) || '?';
    if (!isServerRaceConnected()) {
      displayName = p.isCpu ? '두리' : '아리';
      glyph = p.isCpu ? 'D' : 'A';
    } else if (p === P) {
      displayName = serverRaceOpt.myDuckName || def.name;
      glyph = displayName.charAt(0) || '?';
    } else {
      displayName = serverRaceOpt.oppDuckName || def.name;
      glyph = displayName.charAt(0) || '?';
    }
    if (id === 'ari') {
      return {
        useSprites: true,
        duriDark: false,
        lane,
        displayName,
        glyph: 'A',
        neckBand: '#D32F2F',
      };
    }
    if (id === 'duri') {
      return {
        useSprites: false,
        duriDark: true,
        lane,
        displayName,
        glyph: 'D',
        neckBand: '#FF8F00',
      };
    }
    return {
      useSprites: false,
      duriDark: false,
      lane,
      displayName,
      glyph,
      neckBand: def.color,
      col: def.color,
      colDark: shadeHex(def.color, 0.52),
      colLight: shadeHex(def.color, 1.14),
      tailFill: shadeHex(def.color, 0.9),
    };
  }
  function hudLabelMe() {
    if (!isServerRaceConnected()) return '아리';
    return serverRaceOpt.myDuckName || duckDefById(serverRaceOpt.myDuckId || 'bori').name;
  }
  function hudLabelOpp() {
    if (!isServerRaceConnected()) return '두리';
    return serverRaceOpt.oppDuckName || duckDefById(serverRaceOpt.oppDuckId || 'bori').name;
  }
  function getTerrain() {
    const t = RACE_ENGINE_PHYSICS.TERRAIN[raceTerrainKey];
    return t || RACE_ENGINE_PHYSICS.TERRAIN.normal;
  }
  hostEl.style.cssText =
    'position:fixed;inset:0;z-index:200;touch-action:none;background:#222;overflow:hidden;';
  const C = document.createElement('canvas');
  C.setAttribute('aria-label', '달려오리 경주');
  C.style.touchAction = 'none';
  hostEl.replaceChildren(C);
  hostEl.tabIndex = -1;
  try {
    hostEl.focus({ preventScroll: true });
  } catch (e) {}
  const X = C.getContext('2d');

'use strict';
/** iframe이면 true — frameElement만 참조, 부모와는 BroadcastChannel로만 통신 */
const EMBED_APP=true;
let raceFinishPosted=false;
(function(){
  const el=document.getElementById('overlay');
  if(!el)return;
  el.style.cssText='position:fixed;inset:0;z-index:2;pointer-events:none;display:none';
})();

// ═══ DESIGN ═══
const W=360,H=640;
const TIME_LIMIT=13;
const CD_STEP_SEC=1,CD_START_VAL=2;
/** true면 [input]/[physics] 로그 (프로덕션은 false) */
const DEBUG_RACE_TAP=false;
const PH=RACE_ENGINE_PHYSICS;
/** dirA·스핀 상한 (rad, ≈±90°) */
const DIR_A_LIMIT=1.57;
/** 횡위치 1m ≈ 화면 px (절벽 느낌용) */
const LATERAL_PX_PER_M=28;
const REVIVE_HEART_COST=3;
/** CPU 탭 시 동일 엔진 보정 계수 */
const CPU_TAP_DV_MUL=0.92;
function moveTowardVal(current,target,maxStep){
  if(current===target)return target;
  const d=target-current;
  if(Math.abs(d)<=maxStep)return target;
  return current+Math.sign(d)*maxStep;
}
/** 하단 터치패드 — 약 1cm 지름·패드 사이 ~3cm (640≈세로 14cm 가정 시 논리 px) */
const TOUCH_PAD_R=23;
const TOUCH_PAD_EDGE_GAP=Math.round((H*3)/14);
/** HUD·결과·TIME UP 등 거리 표시 소수 자릿수 */
const DIST_FP=4;
function fmtDist(m){return (+m).toFixed(DIST_FP);}

// ═══ CAMERA ═══
const VY=H*0.48,TB=H*1.05,VHW=W*0.06;
const TL0=W*0.03,TR0=W*0.97;
const DUCK_Y=H*0.62,DUCK_SZ=W*0.24;

// ═══ SCALE ═══
let sc=1,ox=0,oy=0;
function resize(){
  const w=innerWidth,h=innerHeight;
  sc=Math.min(w/W,h/H);
  C.width=W*sc;C.height=H*sc;
  ox=(w-C.width)/2;oy=(h-C.height)/2;
  C.style.cssText=`position:absolute;left:${ox}px;top:${oy}px`;
}
resize();window.addEventListener('resize',resize);

// ═══ SPRITES ═══
const sprites={};
function loadSprite(n,s){const i=new Image();i.onload=()=>{sprites[n]=i};i.onerror=()=>{};i.src=s}
loadSprite('body', new URL('../assets/sprites/ari_body.png', import.meta.url).href);
loadSprite('head', new URL('../assets/sprites/ari_head.png', import.meta.url).href);
loadSprite('leg', new URL('../assets/sprites/ari_leg.png', import.meta.url).href);

// ═══ AUDIO ═══
let ac=null;
function ensureAudio(){
  if(!ac)try{ac=new(AudioContext||webkitAudioContext)}catch(e){}
  if(ac&&ac.state==='suspended')ac.resume();
}
function playSlap(){
  if(!ac)return;const t=ac.currentTime;
  const o=ac.createOscillator(),g=ac.createGain();
  o.type='triangle';
  o.frequency.setValueAtTime(100+Math.random()*60,t);
  o.frequency.exponentialRampToValueAtTime(50,t+.07);
  g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);
  o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.09);
}

// ═══ STATE ═══
let state='ready',cdVal=CD_START_VAL,cdT=0,raceT=0,winner=null,endT=0,flowAcc=0;
let padGlowL=0,padGlowR=0;
let fallPaused=false;
let fallOverlayEl=null;
let playerFallAnim=0;
let slipFxUntil=0;
let serverRaceSnap=null;
let serverFinishPayload=null;
let _raceTickLogCounter=0;
let _blendLogCounter=0;

// ═══ PLAYERS ═══
function mk(cpu){return{
  dist:0,v:0,spd:0,taps:0,lastFoot:null,isCpu:cpu,
  lateral:0,spinAngle:0,stumble:0,lastTapRaceT:0,
  // Walk cycle: each tap advances target by PI
  wc:0,wcTgt:0,
  // Animation outputs
  tilt:0,by:0,scX:1,scY:1,hLag:0,tLag:0,lean:0,
  // Leg angles (radians, positive = back/showing sole)
  leftLegA:0,rightLegA:0,
  leftLegTarget:0,rightLegTarget:0,
  // Direction (rad)
  dirA:0,
  // CPU
  tapT:0,tapI:.18,cpuM:.85+Math.random()*.3,
  bodySw:0,bodySwTgt:0,
  /** 서버 peerTap 직후 풀 애니 (초) */
  forcedMovingTimer:0
}}
let P=mk(false),CPU=mk(true);

function removeFallOverlay(){
  if(fallOverlayEl){
    fallOverlayEl.remove();
    fallOverlayEl=null;
  }
}
function reviveFromFall(){
  removeFallOverlay();
  fallPaused=false;
  P.lateral=0;P.v=0;P.spd=0;P.dirA*=0.35;P.spinAngle=0;playerFallAnim=0;P.stumble=0;
}
function showFallOverlay(){
  if(fallOverlayEl||state!=='racing')return;
  fallPaused=true;
  const ov=document.createElement('div');
  ov.style.cssText='position:absolute;inset:0;z-index:400;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.75);color:#fff;padding:20px;font-family:system-ui,sans-serif;touch-action:manipulation;';
  const title=document.createElement('div');
  title.style.cssText='font-size:20px;font-weight:700;margin-bottom:14px;text-align:center';
  title.textContent='추락! 부활하시겠습니까?';
  ov.appendChild(title);
  const row=document.createElement('div');
  row.style.cssText='display:flex;flex-direction:column;gap:10px;width:min(280px,90vw);';
  const b1=document.createElement('button');
  b1.type='button';
  b1.textContent='하트 3개로 부활';
  b1.style.cssText='padding:12px;border-radius:8px;border:1px solid #888;background:#2a2a2a;color:#fff;font:inherit;cursor:pointer';
  const b2=document.createElement('button');
  b2.type='button';
  b2.textContent='광고 보고 부활';
  b2.style.cssText=b1.style.cssText;
  const b3=document.createElement('button');
  b3.type='button';
  b3.textContent='기권';
  b3.style.cssText=b1.style.cssText;
  b1.addEventListener('click',()=>{
    const appSt=getAppState?getAppState():null;
    if(!appSt||!spend(appSt,REVIVE_HEART_COST,'벼랑 부활'))window.alert('하트가 부족해요.');
    else reviveFromFall();
  });
  b2.addEventListener('click',()=>{
    b2.disabled=true;
    window.setTimeout(()=>reviveFromFall(),2000);
  });
  b3.addEventListener('click',()=>{
    removeFallOverlay();
    fallPaused=false;
    winner='CPU';
    state='ending';
    endT=0;
    P.v=0;CPU.v=0;P.spd=0;CPU.spd=0;
  });
  row.appendChild(b1);row.appendChild(b2);row.appendChild(b3);
  ov.appendChild(row);
  hostEl.appendChild(ov);
  fallOverlayEl=ov;
}

// ═══ INPUT ═══
function bumpPadGlow(foot){
  if(foot==='L')padGlowL=1;else padGlowR=1;
}

/**
 * 서버 peerTap 전용 — 상대 오리(CPU) 시각만 (거리/속도 불변).
 * 다리·몸통·wc 스텝 값은 로컬 tap()과 동일 (race 카운트다운 제외).
 * @param {'left'|'right'} foot
 */
function applyPeerTapVisual(foot){
  if(state!=='racing')return;
  if(!isServerRaceConnected())return;
  const f=foot==='left'?'L':'R';
  CPU.lastFoot=f;
  CPU.wcTgt+=Math.PI;
  const legHi=0.63;
  const legLo=-0.27;
  if(f==='L'){
    CPU.leftLegTarget=legHi;
    CPU.rightLegTarget=legLo;
  }else{
    CPU.rightLegTarget=legHi;
    CPU.leftLegTarget=legLo;
  }
  playSlap();
  const bodySw=0.68*0.7;
  CPU.bodySwTgt=f==='L'?bodySw:-bodySw;
  CPU.forcedMovingTimer=0.3;
}
function tap(foot){
  if(state==='countdown'){
    const p=P;
    p.lastFoot=foot;
    p.wcTgt+=Math.PI;
    if(foot==='L'){
      p.leftLegTarget=0.7;
      p.rightLegTarget=-0.3;
    }else{
      p.rightLegTarget=0.7;
      p.leftLegTarget=-0.3;
    }
    playSlap();
    if(navigator.vibrate)navigator.vibrate(15);
    bumpPadGlow(foot);
    P.bodySwTgt=foot==='L'?0.68:-0.68;
    return;
  }
  if(state!=='racing')return;
  if(fallPaused)return;
  const p=P;
  if(isServerRaceConnected()){
    console.log('[race] 탭 적용 대상: mySlot:',myServerSlot,'로컬=P(내), 서버 ducks['+myServerSlot+']와 동기화');
  }
  console.log('[input] tap() foot:',foot,'P.dist:',p.dist.toFixed(1));
  const terr=getTerrain();
  const sameFoot=p.lastFoot===foot;
  let imp=PH.TAP_FORCE/PH.DUCK_MASS*terr.friction;
  if(p.stumble)imp*=0.45;
  if(sameFoot){
    if(foot==='L')p.dirA-=PH.SAME_FOOT_ANGLE;
    else p.dirA+=PH.SAME_FOOT_ANGLE;
    if(terr.slipOnSameFoot){
      p.spinAngle+=terr.spinRate||0.35;
      slipFxUntil=raceT+0.25;
    }
    p.v+=imp*0.38;
  }else{
    p.v+=imp;
    const r=PH.ANGLE_RECOVERY;
    if(p.dirA>r)p.dirA-=r;
    else if(p.dirA<-r)p.dirA+=r;
    else p.dirA=0;
    if(terr.spinRecovery!=null){
      p.spinAngle=moveTowardVal(p.spinAngle,0,terr.spinRecovery);
    }
  }
  p.v=Math.max(0,Math.min(PH.MAX_SPEED,p.v));
  p.spd=p.v;
  p.dirA=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,p.dirA));
  p.spinAngle=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,p.spinAngle));
  p.lastFoot=foot;p.taps++;
  p.wcTgt+=Math.PI;
  if(DEBUG_RACE_TAP){
    const dProg=0;
    console.log('[input] tap',foot,sameFoot?'same':'alt');
    console.log('[physics] tap → v:',+p.v.toFixed(2),'dist:',+p.dist.toFixed(2));
  }
  if(foot==='L'){
    p.leftLegTarget=0.7;
    p.rightLegTarget=-0.3;
  }else{
    p.rightLegTarget=0.7;
    p.leftLegTarget=-0.3;
  }
  playSlap();
  if(navigator.vibrate)navigator.vibrate(15);
  bumpPadGlow(foot);
  P.bodySwTgt=foot==='L'?0.68:-0.68;
  if(serverRaceOpt&&typeof serverRaceOpt.emitTap==='function'){
    const tapFoot=foot==='L'?'left':'right';
    console.log('[race] sendTap',tapFoot);
    serverRaceOpt.emitTap(tapFoot);
  }
}

function isNonPrimaryMouseButton(e){
  return e.pointerType==='mouse'&&e.button!==0;
}

function racePointerDown(e){
  e.preventDefault();
  console.log('[input] pointerdown, state:',state,'clientX:',e.clientX,'button:',e.button,'pointerType:',e.pointerType);
  if(state==='ready'&&!EMBED_APP){startCD();return}
  if(state==='result'&&!EMBED_APP){reset();return}
  if(state==='countdown'){
    if(isNonPrimaryMouseButton(e)){console.log('[input] countdown: 마우스 보조 버튼, 무시');return}
    const foot=(e.clientX<window.innerWidth/2)?'L':'R';
    console.log('[input] countdown 제자리, tap 직전 foot:',foot);
    tap(foot);
    console.log('[input] countdown 제자리 tap 완료');
    return;
  }
  if(state!=='racing'){console.log('[input] state가 racing이 아님, 무시');return}
  if(isNonPrimaryMouseButton(e)){console.log('[input] 마우스 button 0 아님, 무시 button:',e.button);return}
  const foot=(e.clientX<window.innerWidth/2)?'L':'R';
  console.log('[input] tap 호출 직전, foot:',foot);
  tap(foot);
  console.log('[input] tap 호출 완료, P.dist:',P.dist.toFixed(1));
};hostEl.addEventListener('pointerdown',racePointerDown,{passive:false,capture:true});function raceKeyDown(e){
  if(state==='result'){if(EMBED_APP)return;reset();return}
  if(state==='ready'){startCD();return}
  if(e.key==='ArrowLeft')tap('L');if(e.key==='ArrowRight')tap('R');
}
hostEl.addEventListener('keydown',raceKeyDown);

function startCD(){ensureAudio();state='countdown';cdVal=CD_START_VAL;cdT=0}
/** iframe(embed)에서는 호출 무시 */
function reset(){
  if(EMBED_APP)return;
  raceFinishPosted=false;P=mk(false);CPU=mk(true);raceT=0;winner=null;endT=0;flowAcc=0;state='ready';
  padGlowL=0;padGlowR=0;
  fallPaused=false;playerFallAnim=0;slipFxUntil=0;removeFallOverlay();
}
function postRaceFinishToParent(){if(raceFinishPosted)return;
  raceFinishPosted=true;
  let result='draw';
  if(winner==='YOU')result='win';
  else if(winner==='CPU')result='lose';
  const pl=serverFinishPayload?{
    type:'raceFinish',
    result: serverFinishPayload.result,
    time: serverFinishPayload.time,
    myDistance: serverFinishPayload.myDistance,
    oppDistance: serverFinishPayload.oppDistance,
    taps: serverFinishPayload.taps
  }:{
    type:'raceFinish',
    result,
    time:TIME_LIMIT,
    myDistance:P.dist,
    oppDistance:CPU.dist,
    taps:P.taps
  };
  serverFinishPayload=null;
  if(typeof onFinish==='function'){try{onFinish(pl);}catch(e){console.error(e);}}
}

function onServerRaceResult(r){
  if(raceFinishPosted)return;
  if(state!=='racing'&&state!=='countdown')return;
  const ms=myServerSlot;
  let res='lose';
  if(r.winnerSlot===-1)res='draw';
  else if(r.winnerSlot===ms)res='win';
  serverFinishPayload={
    result: res,
    time: r.raceTime,
    myDistance: r.distances[ms],
    oppDistance: r.distances[1-ms],
    taps: r.taps[ms],
  };
  if(r.winnerSlot===-1)winner='DRAW';
  else winner=r.winnerSlot===ms?'YOU':'CPU';
  P.dist=r.distances[ms];
  CPU.dist=r.distances[1-ms];
  P.spd=0;CPU.spd=0;P.v=0;CPU.v=0;
  state='ending';
  endT=0;
  removeFallOverlay();
  fallPaused=false;
}

function wireNum(x,fallback){
  const n=Number(x);
  return Number.isFinite(n)?n:fallback;
}
function blendServerDucks(dt){
  if(!serverRaceOpt||!serverRaceOpt.socket||!serverRaceSnap)return;
  const pl=serverRaceSnap.players;
  if(!pl||pl.length<2)return;
  const me=pl[myServerSlot];
  const opp=pl[1-myServerSlot];
  if(!me||!opp)return;
  const bm=0.3;
  P.dist=lerp(P.dist,wireNum(me.dist,P.dist),bm);
  P.v=lerp(P.v,wireNum(me.v,P.v),bm);
  P.spd=lerp(P.spd,wireNum(me.spd!=null?me.spd:me.v,P.spd),bm);
  P.lateral=lerp(P.lateral,wireNum(me.lateral,P.lateral),bm);
  P.dirA=lerp(P.dirA,wireNum(me.dirA,P.dirA),bm);
  P.spinAngle=lerp(P.spinAngle,wireNum(me.spinAngle,P.spinAngle),bm);
  P.stumble=me.isStumbling?1:0;
  if(me.isFallen&&!fallPaused){playerFallAnim=1;showFallOverlay();}
  const srvOppDist=wireNum(opp.dist,CPU.dist);
  const srvOppV=wireNum(opp.v,CPU.v);
  CPU.dist=srvOppDist;
  CPU.v=srvOppV;
  CPU.spd=wireNum(opp.spd!=null?opp.spd:opp.v,CPU.spd);
  CPU.lateral=wireNum(opp.lateral,CPU.lateral);
  CPU.dirA=wireNum(opp.dirA,CPU.dirA);
  CPU.spinAngle=wireNum(opp.spinAngle,CPU.spinAngle);
  CPU.stumble=opp.isStumbling?1:0;
  CPU.lastTapRaceT=raceT;
  _blendLogCounter+=1;
  if(_blendLogCounter%30===1){
    console.log('[blend] 상대(CPU) dist:',CPU.dist,'서버 opp.dist:',opp.dist,'내 P.dist:',P.dist,'opp.spd:',opp.spd);
  }
}

// ═══ HELPERS ═══
function trackX(t,f){
  const l=(W/2-VHW)*(1-t)+TL0*t, r=(W/2+VHW)*(1-t)+TR0*t;
  return l+f*(r-l);
}
function lerp(a,b,t){return a+(b-a)*t}

// ═══ UPDATE ═══
function update(dt){
  padGlowL=Math.max(0,padGlowL-dt*7);
  padGlowR=Math.max(0,padGlowR-dt*7);
  if(state==='countdown'){
    cdT+=dt;
    updAnim(P,dt);
    updAnim(CPU,dt);
    if(cdT>=CD_STEP_SEC){
      cdT=0;
      const srvCd=serverRaceOpt&&serverRaceOpt.socket;
      if(srvCd){
        if(cdVal>0)cdVal--;
      }else{
        cdVal--;
        if(cdVal<0)state='racing';
      }
    }
    return;
  }
  if(state==='racing'){
    const srv=serverRaceOpt&&serverRaceOpt.socket;
    if(srv){
      if(!fallPaused){
        if(serverRaceSnap)raceT=serverRaceSnap.raceT;
        else raceT+=dt;
      }
      if(!fallPaused){
        updDuck(P,dt);
        blendServerDucks(dt);
        flowAcc+=((P.v+CPU.v)/2)*55*dt;
        updAnim(CPU,dt);
      }
    }else if(!fallPaused){
      raceT+=dt;
    }
    if(!srv&&raceT>=TIME_LIMIT){
      raceT=TIME_LIMIT;
      const eps=1e-5;
      if(P.dist>CPU.dist+eps)winner='YOU';
      else if(P.dist<CPU.dist-eps)winner='CPU';
      else winner='DRAW';
      P.spd=0;CPU.spd=0;P.v=0;CPU.v=0;
      state='ending';
      endT=0;
      removeFallOverlay();
      fallPaused=false;
    }else if(!srv&&!fallPaused){
      updDuck(P,dt);
      CPU.tapT+=dt;
      if(CPU.tapT>=CPU.tapI){
        CPU.tapT=0;CPU.tapI=.13+Math.random()*.07;
        const terr=getTerrain();
        const slip=Math.random()<.08;
        const imp=PH.TAP_FORCE/PH.DUCK_MASS*terr.friction*CPU_TAP_DV_MUL*CPU.cpuM;
        if(slip){
          if(CPU.lastFoot==='L')CPU.dirA-=PH.SAME_FOOT_ANGLE*0.7;
          else CPU.dirA+=PH.SAME_FOOT_ANGLE*0.7;
          if(terr.slipOnSameFoot)CPU.spinAngle+=(terr.spinRate||0.35)*0.6;
          CPU.v+=imp*0.4;
        }else{
          CPU.v+=imp;
          const r=PH.ANGLE_RECOVERY;
          if(CPU.dirA>r)CPU.dirA-=r;
          else if(CPU.dirA<-r)CPU.dirA+=r;
          else CPU.dirA=0;
          if(terr.spinRecovery!=null)CPU.spinAngle=moveTowardVal(CPU.spinAngle,0,terr.spinRecovery);
        }
        CPU.v=Math.max(0,Math.min(PH.MAX_SPEED,CPU.v));
        CPU.spd=CPU.v;
        CPU.dirA=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,CPU.dirA));
        CPU.lastTapRaceT=raceT;
        CPU.wcTgt+=Math.PI;
        const f=CPU.lastFoot==='L'?'R':'L';
        CPU.lastFoot=f;
        CPU.bodySwTgt=f==='L'?0.68:-0.68;
        if(f==='L'){CPU.leftLegTarget=.7;CPU.rightLegTarget=-.3}
        else{CPU.rightLegTarget=.7;CPU.leftLegTarget=-.3}
      }
      updDuck(CPU,dt);
      flowAcc+=((P.v+CPU.v)/2)*55*dt;
    }
  }
  if(state==='ending'){
    endT+=dt;
    updAnim(P,dt);updAnim(CPU,dt);
    if(endT>2.5){
      state='result';
      postRaceFinishToParent();
    }
  }
}

function checkCliffFall(p){
  if(p.isCpu)return;
  if(serverRaceOpt&&serverRaceOpt.socket)return;
  const terr=getTerrain();
  if(terr.fallThreshold==null||!Number.isFinite(terr.fallThreshold))return;
  if(Math.abs(p.lateral)>terr.fallThreshold){
    playerFallAnim=1;
    showFallOverlay();
  }
}
function updDuck(p,dt){
  const terr=getTerrain();
  if(state!=='racing'){
    p.spd=p.v;
    updAnim(p,dt);
    return;
  }
  if(fallPaused&&!p.isCpu){
    p.spd=p.v;
    updAnim(p,dt);
    return;
  }
  const spinRec=terr.spinRecovery!=null?terr.spinRecovery:0.06;
  p.spinAngle=moveTowardVal(p.spinAngle,0,spinRec*dt*8);
  const effA=p.dirA+0.45*p.spinAngle*Math.sin(raceT*3);
  const prevV=p.v;
  const dt60=60*dt;
  p.v*=Math.pow(terr.slideDecay,dt60);
  const drag=PH.AIR_RESISTANCE*Math.abs(p.v)*p.v*dt;
  if(p.v>0)p.v=Math.max(0,p.v-drag);
  if(p.isCpu&&terr.fallThreshold!=null&&Number.isFinite(terr.fallThreshold)){
    const cap=terr.fallThreshold*0.92;
    p.lateral=Math.max(-cap,Math.min(cap,p.lateral));
  }
  if(p.stumble){
    p.v=Math.max(0,p.v-PH.STUMBLE_DECEL_PER_S*dt);
    if(p.v<0.18)p.stumble=0;
  }else if(!p.isCpu){
    const gap=raceT-p.lastTapRaceT;
    if(prevV>PH.STUMBLE_THRESHOLD&&gap>PH.STUMBLE_GAP)p.stumble=1;
  }
  p.v=Math.max(0,Math.min(PH.MAX_SPEED,p.v));
  const fwd=p.v*Math.cos(effA)*dt;
  const lat=p.v*Math.sin(effA)*dt;
  p.dist+=fwd;
  p.lateral+=lat;
  p.spd=p.v;
  checkCliffFall(p);
  if(playerFallAnim>0&&!p.isCpu){
    playerFallAnim=Math.min(2.2,playerFallAnim+dt*2.5);
  }else if(!p.isCpu){
    playerFallAnim=Math.max(0,playerFallAnim-dt*2);
  }
  updAnim(p,dt);
}

function updAnim(p,dt){
  const inRace=state==='racing';
  const inCd=state==='countdown';
  const inStep=inCd||inRace;

  // 카운트다운 중 CPU: 탭 없음 → 완전 정지 (자동 흔들림 없음)
  if(inCd&&p.isCpu){
    p.wc=0;p.wcTgt=0;
    p.tilt=0;p.bodySw=0;p.bodySwTgt=0;p.by=0;
    p.scX+=(1-p.scX)*Math.min(1,14*dt);p.scY+=(1-p.scY)*Math.min(1,14*dt);
    p.lean*=Math.pow(1e-6,dt/0.25);
    p.leftLegTarget=0;p.rightLegTarget=0;
    p.leftLegA+=(0-p.leftLegA)*Math.min(1,16*dt);
    p.rightLegA+=(0-p.rightLegA)*Math.min(1,16*dt);
    p.hLag*=Math.pow(1e-6,dt/0.12);p.tLag*=Math.pow(1e-6,dt/0.12);
    p.dirA*=.96;
    return;
  }

  if(p.wc<p.wcTgt){p.wc+=40*dt;if(p.wc>p.wcTgt)p.wc=p.wcTgt}
  if(inRace&&isServerRaceConnected()&&p===CPU&&p.spd>0.05){
    p.wcTgt+=p.spd*18*dt;
  }
  const sin=Math.sin(p.wc),absSin=Math.abs(sin);

  let striding=false;
  const strideAsHuman=isServerRaceConnected()||!p.isCpu;
  if(inStep&&strideAsHuman){
    striding=
      p.wc<p.wcTgt-0.04||
      Math.abs(p.leftLegA-p.leftLegTarget)>0.08||
      Math.abs(p.rightLegA-p.rightLegTarget)>0.08;
    if(!striding){
      let settle=Math.min(1,dt*16*0.85);
      if(isServerRaceConnected()&&p===CPU){
        const legAmp=Math.abs(p.leftLegTarget)+Math.abs(p.rightLegTarget);
        if(legAmp>0.35||Math.abs(p.bodySwTgt)>0.35){
          settle*=0.22*0.85;
        }
      }
      p.leftLegTarget*=1-settle;
      p.rightLegTarget*=1-settle;
      p.bodySwTgt*=1-settle;
    }
  }

  let effSpdForAnim=p.spd;
  if(inRace&&isServerRaceConnected()&&p===CPU&&serverRaceSnap){
    const pl=serverRaceSnap.players;
    const opp=pl&&pl[1-myServerSlot];
    if(opp){
      const w=wireNum(opp.spd!=null?opp.spd:opp.v,p.spd);
      effSpdForAnim=Math.max(p.spd,w);
    }
  }
  let moving=effSpdForAnim>0.08?1:effSpdForAnim/0.08;
  if(inRace&&isServerRaceConnected()&&p===CPU){
    if(
      striding||
      Math.abs(p.bodySwTgt)>0.05||
      Math.abs(p.leftLegTarget)>0.07||
      Math.abs(p.rightLegTarget)>0.07
    ){
      moving=Math.max(moving,1);
    }
  }

  if(p.isCpu&&p.forcedMovingTimer>0){
    p.forcedMovingTimer=Math.max(0,p.forcedMovingTimer-dt);
    moving=1;
  }

  p.bodySw+=(p.bodySwTgt-p.bodySw)*Math.min(1,34*dt);
  p.tilt=sin*0.44*moving+p.bodySw;

  p.by=-absSin*13*moving;
  const sq=0.12*moving;
  p.scX=1+(1-absSin)*sq;p.scY=1-(1-absSin)*sq;
  const leanSpd=isServerRaceConnected()&&p===CPU?effSpdForAnim:p.spd;
  const tgtLean=Math.min(leanSpd/4,.3);
  p.lean+=(tgtLean-p.lean)*.08;
  p.scX*=(1+p.lean*.08);p.scY*=(1-p.lean*.1);
  p.hLag+=(p.tilt-p.hLag)*12*dt;
  p.tLag+=(p.tilt-p.tLag)*6*dt;

  const legSpeed=18;
  p.leftLegA+=(p.leftLegTarget-p.leftLegA)*legSpeed*dt;
  p.rightLegA+=(p.rightLegTarget-p.rightLegA)*legSpeed*dt;

  if(p.spd<.06&&!inStep){
    p.tilt*=.9;p.by*=.9;p.scX+=(1-p.scX)*.1;p.scY+=(1-p.scY)*.1;
    p.hLag*=.9;p.tLag*=.9;p.lean*=.9;p.dirA*=.95;
    p.leftLegTarget*=.85;p.rightLegTarget*=.85;
    p.bodySw*=.88;p.bodySwTgt*=0.92;
  }
}

// ═══ DRAW ═══
function draw(){
  X.clearRect(0,0,W,H);
  drawSky();drawGrass();drawTrack();
  // Ducks
  [P,CPU].sort((a,b)=>a.dist-b.dist).forEach(d=>drawDuck(d));
  drawHUD();
  if(state==='countdown')drawCD();
  if(state==='ready'&&!EMBED_APP)drawReady();
  if(state==='ending')drawTimeUp();
  if(state==='result')drawResult();
  drawTouchPads();
}

// ═══ SKY ═══
function drawSky(){
  // Bright vivid sky like reference
  const g=X.createLinearGradient(0,0,0,VY);
  g.addColorStop(0,'#3B8FD9');g.addColorStop(.4,'#5AABEE');
  g.addColorStop(.8,'#8ECDF5');g.addColorStop(1,'#C5E8C0');
  X.fillStyle=g;X.fillRect(0,0,W,VY+5);
  
  // Big fluffy clouds
  X.fillStyle='#fff';
  [[50,VY*.18,30,1],[170,VY*.28,24,.9],[280,VY*.15,22,.85],[100,VY*.4,18,.8]].forEach(([cx,cy,r,a])=>{
    X.globalAlpha=a;
    const x=((cx+flowAcc*0.3)%(W+100))-50;
    X.beginPath();
    X.arc(x,cy,r,0,Math.PI*2);
    X.arc(x+r*.9,cy-r*.2,r*.75,0,Math.PI*2);
    X.arc(x-r*.5,cy+r*.15,r*.6,0,Math.PI*2);
    X.arc(x+r*.4,cy+r*.25,r*.55,0,Math.PI*2);
    X.arc(x+r*1.4,cy+r*.1,r*.5,0,Math.PI*2);
    X.fill();
  });
  X.globalAlpha=1;
  
  // Trees at horizon (lush green like reference)
  for(let layer=0;layer<2;layer++){
    X.fillStyle=layer===0?'#2B7A25':'#3D9635';
    const count=layer===0?22:16;
    for(let i=0;i<count;i++){
      const x=((i*(W/(count-1))+flowAcc*(layer===0?0.5:0.8))%W);
      const sz=layer===0?8+Math.sin(i*1.7)*3:5+Math.sin(i*2.3)*2;
      const y0=VY-sz*(layer===0?.15:.05);
      X.beginPath();X.arc(x,y0,sz,Math.PI,0);X.fill();
    }
  }
  // Flags between trees
  for(let i=0;i<8;i++){
    const x=((20+i*(W-40)/7+flowAcc*0.6)%W);
    const colors=['#D32F2F','#1565C0','#F9A825','#2E7D32'];
    X.strokeStyle='#795548';X.lineWidth=1.5;
    X.beginPath();X.moveTo(x,VY-2);X.lineTo(x,VY-16);X.stroke();
    X.fillStyle=colors[i%4];
    X.beginPath();X.moveTo(x,VY-16);X.lineTo(x+7,VY-13);X.lineTo(x,VY-10);X.fill();
  }
}

// ═══ GRASS ═══
function drawGrass(){
  // Bright green like reference
  const g=X.createLinearGradient(0,VY,0,TB+40);
  g.addColorStop(0,'#5EC44A');g.addColorStop(.5,'#4DB83E');g.addColorStop(1,'#40A833');
  X.fillStyle=g;X.fillRect(0,VY,W,H-VY);
  
  // Grass highlights
  for(let i=0;i<30;i++){
    const gy=VY+5+((i*41)%(TB-VY+30));
    const depthG=(gy-VY)/Math.max(1e-6,TB-VY);
    const gx=((i*53+flowAcc*2+flowAcc*depthG*1.5)%W);
    X.fillStyle='rgba(120,220,80,.35)';
    X.beginPath();X.arc(gx,gy,1.5+Math.sin(i)*.5,0,Math.PI*2);X.fill();
  }
  
  // Colorful wildflowers (like reference)
  const fColors=['#FF5252','#FFD740','#FF4081','#E040FB','#FF6E40','#7C4DFF','#40C4FF'];
  for(let i=0;i<35;i++){
    const fy=VY+8+((i*43)%(TB-VY+20));
    const depthF=(fy-VY)/Math.max(1e-6,TB-VY);
    const fx=((i*67+flowAcc*2+flowAcc*depthF*1.2)%(W*.4));
    const side=i%2===0?1:-1;
    const bx=side>0?W-fx-3:fx+3;
    // Only draw on grass (not on track)
    const tAtY=(fy-VY)/(TB-VY);
    const tl=trackX(tAtY>1?1:tAtY<0?0:tAtY,0);
    const tr=trackX(tAtY>1?1:tAtY<0?0:tAtY,1);
    if(bx>tl-5&&bx<tr+5)continue;
    X.fillStyle=fColors[i%7];
    const sz=2+Math.sin(i*1.3)*.8;
    X.beginPath();X.arc(bx,fy,sz,0,Math.PI*2);X.fill();
    // White center
    X.fillStyle='rgba(255,255,255,.6)';
    X.beginPath();X.arc(bx,fy,sz*.4,0,Math.PI*2);X.fill();
  }

  // ── 트랙 양옆 말뚝 (속도감 핵심) ──
  if(raceTerrainKey==='normal'||!raceTerrainKey){
    for(let i=0;i<12;i++){
      const phase=((i*8-flowAcc*1.8)%96+96)%96;
      const t=phase/96;
      if(t<0.03||t>0.97) continue;
      const y=VY+(TB-VY)*t;
      const scale=0.3+0.7*t;
      const postH=Math.max(4,18*scale);
      const postW=Math.max(1.5,3*scale);
      const lx=trackX(t,0)-postW*2;
      X.fillStyle=`rgba(140,100,60,${0.3+0.6*t})`;
      X.fillRect(lx-postW/2,y-postH,postW,postH);
      const rx=trackX(t,1)+postW*2;
      X.fillRect(rx-postW/2,y-postH,postW,postH);
    }
  }
}

// ═══ TRACK ═══
function drawTrack(){
  const terr=getTerrain();
  const isIce=raceTerrainKey==='ice'||raceTerrainKey==='iceCliff';
  const isCliff=raceTerrainKey==='cliff'||raceTerrainKey==='iceCliff';
  const th=terr.fallThreshold;
  const edgeDanger=th!=null&&Number.isFinite(th)&&Math.abs(P.lateral)>th*0.72;
  if(isCliff){
    X.fillStyle='#1a120d';
    X.beginPath();
    X.moveTo(0,VY);X.lineTo(W/2-VHW-18,VY);X.lineTo(TL0-40,TB);X.lineTo(0,TB);X.closePath();
    X.fill();
    X.beginPath();
    X.moveTo(W,VY);X.lineTo(W/2+VHW+18,VY);X.lineTo(TR0+40,TB);X.lineTo(W,TB);X.closePath();
    X.fill();
  }
  const tg=X.createLinearGradient(0,VY,0,TB);
  if(isIce){
    tg.addColorStop(0,'#A8D8EA');tg.addColorStop(.5,'#7EC8E3');tg.addColorStop(1,'#5BA3C6');
  }else{
    tg.addColorStop(0,'#D4BE98');tg.addColorStop(.5,'#C8B088');tg.addColorStop(1,'#BCA478');
  }
  X.fillStyle=tg;
  X.beginPath();
  X.moveTo(W/2-VHW,VY);X.lineTo(TL0,TB);X.lineTo(TR0,TB);X.lineTo(W/2+VHW,VY);
  X.closePath();X.fill();
  
  for(let i=0;i<18;i++){
    const phase=((i*4.5-flowAcc*2.5)%81+81)%81;
    const t=phase/81;if(t<.02||t>.98)continue;
    const y=VY+(TB-VY)*t;
    const lx=trackX(t,.01),rx=trackX(t,.99);
    const h=Math.max(1.5,(TB-VY)/20*t);
    X.fillStyle=isIce
      ?(i%2===0?'rgba(255,255,255,.28)':'rgba(180,230,255,.12)')
      :(i%2===0?'rgba(210,185,145,.45)':'rgba(180,155,110,.25)');
    X.fillRect(lx,y,rx-lx,h);
  }
  
  const edgeCol=edgeDanger?'rgba(255,60,60,.95)':'rgba(255,255,255,.7)';
  X.strokeStyle=edgeCol;X.lineWidth=edgeDanger?3:2;
  X.beginPath();X.moveTo(W/2-VHW,VY);X.lineTo(TL0,TB);X.stroke();
  X.beginPath();X.moveTo(W/2+VHW,VY);X.lineTo(TR0,TB);X.stroke();
  
  // Center dashed line
  X.strokeStyle='rgba(255,255,255,.6)';X.lineWidth=2.5;
  X.setLineDash([10,15]);X.lineDashOffset=-(flowAcc*3);
  X.beginPath();X.moveTo(W/2,VY);X.lineTo(W/2,TB);X.stroke();
  X.setLineDash([]);
  
  // Start line (near bottom)
  const startRel=0-((P.dist+CPU.dist)/2);
  if(startRel>-5&&startRel<40){
    const t2=1-Math.max(0,startRel)/40;
    if(t2>.05&&t2<.95){
      const sy=VY+(TB-VY)*t2;
      const sl=trackX(t2,.05),sr=trackX(t2,.95);
      X.strokeStyle=`rgba(255,255,255,${.5+.3*t2})`;X.lineWidth=3*t2;
      X.beginPath();X.moveTo(sl,sy);X.lineTo(sr,sy);X.stroke();
    }
  }
  
  // Distance markers (10m 간격, 스크롤)
  const avgD=(P.dist+CPU.dist)/2;
  const mStart=Math.max(10,Math.floor(avgD/10)*10-30);
  for(let m=mStart;m<=mStart+80;m+=10){
    if(m<10)continue;
    const rel=m-avgD;if(rel<1||rel>40)continue;
    const t=1-rel/40;
    const y=VY+(TB-VY)*t;
    X.fillStyle=`rgba(255,255,255,${.2+.4*t})`;
    X.font=`bold ${6+8*t}px sans-serif`;X.textAlign='center';
    X.fillText(`${m}m`,W/2,y-2);
  }

  // ── 스피드 라인 (빠를 때만) ──
  const avgV=(P.v+CPU.v)/2;
  if(avgV>2){
    const intensity=Math.min(1,(avgV-2)/6);
    X.strokeStyle=`rgba(255,255,255,${intensity*0.15})`;
    X.lineWidth=1;
    for(let i=0;i<8;i++){
      const sy=VY+(TB-VY)*(0.1+Math.random()*0.8);
      const side=i%2===0?-1:1;
      const sx=W/2+side*(W/2+10);
      const ex=W/2+side*VHW;
      X.beginPath();X.moveTo(sx,sy);X.lineTo(ex,VY+(sy-VY)*0.3);X.stroke();
    }
  }

  // ── 먼지 (트랙 바닥 근처) ──
  if(avgV>1.5&&(raceTerrainKey==='normal'||!raceTerrainKey)){
    const dustCount=Math.min(10,Math.floor(avgV*2));
    for(let i=0;i<dustCount;i++){
      const dx=TL0+Math.random()*(TR0-TL0);
      const dy=TB-Math.random()*30;
      const r=1+Math.random()*2.5;
      X.fillStyle=`rgba(200,180,140,${0.1+Math.random()*0.15})`;
      X.beginPath();X.arc(dx,dy,r,0,Math.PI*2);X.fill();
    }
  }
}

// ═══ DUCK ═══
function drawDuck(p){
  const st=duckVisualState(p);
  const avgD=(P.dist+CPU.dist)/2;
  const relD=p.dist-avgD;
  let screenY=DUCK_Y+p.by-(relD*3.5);
  const lane=st.lane;
  const tV=Math.min(1,Math.max(0,(TB-screenY)/(TB-VY)));
  const latScale=isServerRaceConnected()?1:(p.isCpu?0.22:1);
  const screenX=trackX(tV,lane)+p.lateral*LATERAL_PX_PER_M*latScale;
  if(p===P)screenY+=playerFallAnim*40;
  const bs=DUCK_SZ;
  const dirShift=Math.sin(p.dirA)*bs*1.2;
  const dirView=.12+0.88*Math.cos(Math.abs(p.dirA+p.spinAngle*0.2));
  const dirYaw=p.dirA*0.68+p.spinAngle*0.55;
  const legSprite=st.useSprites;
  
  X.save();
  X.translate(screenX+dirShift,screenY);
  const terr=getTerrain();
  if(terr.slipOnSameFoot&&slipFxUntil>raceT&&p===P&&state==='racing'){
    X.strokeStyle='rgba(255,255,255,.45)';
    X.lineWidth=2;
    for(let k=0;k<3;k++){
      X.beginPath();
      X.moveTo(-20-k*8,bs*.5);X.lineTo(-32-k*12,bs*.65);X.stroke();
    }
  }
  X.rotate(dirYaw);
  X.rotate(p.tilt);
  X.scale(p.scX,p.scY);
  
  // ═══ SHADOW ═══
  X.fillStyle='rgba(0,0,0,.12)';
  X.beginPath();X.ellipse(0,bs*.44,bs*.38,bs*.06,0,0,Math.PI*2);X.fill();
  
  // ═══ LEGS (behind body = drawn first, but we want BACK leg behind, FRONT leg in front) ═══
  // Determine which leg is "back" (showing sole) vs "front"
  const leftBack=p.leftLegA>p.rightLegA;
  
  // Draw back leg first (behind body)
  if(leftBack){
    drawLeg(p,-bs*.15*dirView,bs*.22,bs,p.leftLegA,legSprite,dirView);
  }else{
    drawLeg(p,bs*.15*dirView,bs*.22,bs,p.rightLegA,legSprite,dirView);
  }
  
  // ═══ BODY ═══
  if(sprites.body&&st.useSprites){
    const bw=bs*1.05*dirView,bh=bs*.95;
    X.drawImage(sprites.body,-bw/2,-bh/2+bs*.08,bw,bh);
  }else if(st.duriDark){
    const col='#2C2C2C';
    const dk='#1A1A1A';
    const bg=X.createRadialGradient(0,bs*.02,bs*.08,0,bs*.05,bs*.43);
    bg.addColorStop(0,col);bg.addColorStop(1,dk);
    X.fillStyle=bg;
    X.beginPath();X.ellipse(0,bs*.05,bs*.42*dirView,bs*.4,0,0,Math.PI*2);X.fill();
    X.fillStyle=dk;
    X.beginPath();X.ellipse(-bs*.36*dirView,bs*.02,bs*.08,bs*.18,.1,0,Math.PI*2);X.fill();
    X.beginPath();X.ellipse(bs*.36*dirView,bs*.02,bs*.08,bs*.18,-.1,0,Math.PI*2);X.fill();
  }else{
    const col=st.colLight||'#F5F5F0';
    const mid=st.col||'#F5F5F0';
    const dk=st.colDark||'#E0DDD5';
    const bg=X.createRadialGradient(0,bs*.02,bs*.08,0,bs*.05,bs*.43);
    bg.addColorStop(0,col);bg.addColorStop(0.5,mid);bg.addColorStop(1,dk);
    X.fillStyle=bg;
    X.beginPath();X.ellipse(0,bs*.05,bs*.42*dirView,bs*.4,0,0,Math.PI*2);X.fill();
    X.fillStyle=dk;
    X.beginPath();X.ellipse(-bs*.36*dirView,bs*.02,bs*.08,bs*.18,.1,0,Math.PI*2);X.fill();
    X.beginPath();X.ellipse(bs*.36*dirView,bs*.02,bs*.08,bs*.18,-.1,0,Math.PI*2);X.fill();
  }
  
  // ═══ FRONT LEG (in front of body) ═══
  if(leftBack){
    drawLeg(p,bs*.15*dirView,bs*.22,bs,p.rightLegA,legSprite,dirView);
  }else{
    drawLeg(p,-bs*.15*dirView,bs*.22,bs,p.leftLegA,legSprite,dirView);
  }
  
  // ═══ TAIL ═══
  X.save();X.rotate(-p.tLag*.5);
  const tailY=-bs*.33-p.lean*bs*.07;
  X.fillStyle=st.duriDark?'#3A3A3A':(st.tailFill||'#FFFDE7');
  X.beginPath();
  X.moveTo(-bs*.04,tailY);
  X.quadraticCurveTo(0,tailY-bs*.2,bs*.05,tailY-bs*.13);
  X.quadraticCurveTo(bs*.02,tailY-bs*.05,bs*.03,tailY);
  X.closePath();X.fill();
  X.restore();
  
  // ═══ HEAD ═══
  X.save();
  const hx=p.hLag*bs*.14;
  const hy=-bs*.47-p.lean*bs*.05;
  const hr=bs*.19*(1-p.lean*.1);
  X.translate(hx,0);
  if(sprites.head&&st.useSprites){
    const hw=hr*2.8,hh=hr*2.8;
    X.drawImage(sprites.head,-hw/2,hy-hh/2,hw,hh);
  }else if(st.duriDark){
    X.fillStyle='#2C2C2C';
    X.beginPath();X.arc(0,hy,hr,0,Math.PI*2);X.fill();
    X.fillStyle='#1A1A1A';
    X.beginPath();
    X.moveTo(-2,hy-hr);X.quadraticCurveTo(1,hy-hr-10,4,hy-hr-3);
    X.quadraticCurveTo(2,hy-hr+1,0,hy-hr);X.fill();
  }else{
    X.fillStyle=st.colLight||'#F5F5F0';
    X.beginPath();X.arc(0,hy,hr,0,Math.PI*2);X.fill();
    X.fillStyle=st.colDark||'#E0DDD5';
    X.beginPath();
    X.moveTo(-2,hy-hr);X.quadraticCurveTo(1,hy-hr-10,4,hy-hr-3);
    X.quadraticCurveTo(2,hy-hr+1,0,hy-hr);X.fill();
  }
  X.restore();
  
  // ═══ NECK BAND ═══
  X.fillStyle=st.neckBand;
  X.fillRect(-bs*.12,-bs*.25,bs*.24,bs*.05);
  X.fillStyle='#fff';X.font=`bold ${bs*.035}px sans-serif`;X.textAlign='center';
  X.fillText(st.glyph,0,-bs*.225);
  
  // ═══ LABEL ═══
  X.fillStyle='rgba(255,255,255,.85)';
  X.font=`bold ${bs*.13}px sans-serif`;X.textAlign='center';
  X.fillText(st.displayName,0,-bs*.68);
  
  X.restore();
}

// ═══ DRAW LEG ═══
function drawLeg(p,lx,ly,bs,angle,useAriLegSprites,dirView){
  X.save();
  X.translate(lx,ly); // hip joint position
  X.rotate(angle);     // swing around hip
  
  const legLen=bs*.35;
  const footW=bs*.16;
  const footH=bs*.08;
  
  if(sprites.leg&&useAriLegSprites){
    // Use sprite: top = hip, bottom = foot
    const sw=bs*.22*dirView,sh=bs*.42;
    // Scale based on angle: back leg appears bigger (closer), front leg smaller
    const depthScale=1+angle*.15;
    X.scale(depthScale,depthScale);
    X.drawImage(sprites.leg,-sw/2,0,sw,sh);
    X.scale(1/depthScale,1/depthScale);
  }else{
    // Code-drawn leg
    const legCol='#E8600A';
    const footCol='#E8600A';
    
    // Leg bone
    X.strokeStyle=legCol;X.lineWidth=bs*.055;X.lineCap='round';
    X.beginPath();X.moveTo(0,0);X.lineTo(0,legLen);X.stroke();
    
    // Foot (webbed)
    X.fillStyle=footCol;
    X.beginPath();
    X.ellipse(0,legLen+footH*.3,footW,footH,0,0,Math.PI);
    X.fill();
    
    // Web lines
    X.strokeStyle='#C04808';X.lineWidth=1;
    X.beginPath();
    X.moveTo(-footW*.6,legLen+footH*.3);X.lineTo(0,legLen+footH*1.2);
    X.moveTo(0,legLen+footH*.3);X.lineTo(0,legLen+footH*1.2);
    X.moveTo(footW*.6,legLen+footH*.3);X.lineTo(0,legLen+footH*1.2);
    X.stroke();
    
    // Sole highlight when leg is back (showing sole)
    if(angle>0.2){
      const soleAlpha=Math.min(1,(angle-.2)*2);
      X.fillStyle=`rgba(255,200,100,${soleAlpha*.3})`;
      X.beginPath();
      X.ellipse(0,legLen+footH*.5,footW*.8,footH*.7,0,0,Math.PI*2);
      X.fill();
    }
  }
  X.restore();
}

// ═══ HUD ═══
function drawHUD(){
  X.fillStyle='rgba(0,0,0,.58)';X.fillRect(0,0,W,72);
  const rem=Math.max(0,TIME_LIMIT-raceT);
  if(state==='racing'||state==='ending'||state==='result'){
    const pulse=rem<=3&&state==='racing'?Math.sin(raceT*12)*.5+.5:0;
    X.fillStyle=rem<=3&&state==='racing'?`rgba(255,${Math.round(200+pulse*55)},100,.98)`:'#fff';
    X.font='bold 38px sans-serif';X.textAlign='center';X.textBaseline='middle';
    X.fillText(rem.toFixed(1),W/2,22);
    X.textBaseline='alphabetic';
    X.fillStyle='rgba(255,255,255,.45)';X.font='10px sans-serif';
    X.fillText('남은 시간 (초)',W/2,38);
  }
  X.fillStyle='#9cf';X.font='10px sans-serif';X.textAlign='left';
  X.fillText(getTerrain().name,10,44);
  X.fillStyle='#FFD700';X.font='bold 12px sans-serif';
  X.fillText(`${hudLabelMe()} ${fmtDist(P.dist)}m`,10,56);
  X.fillStyle='rgba(255,255,255,.45)';X.font='10px sans-serif';
  X.fillText(`${P.taps} tap`,10,68);
  X.fillStyle='#ccc';X.font='bold 12px sans-serif';X.textAlign='right';
  X.fillText(`${hudLabelOpp()} ${fmtDist(CPU.dist)}m`,W-10,56);
  const bx=10,bw=W-20,by2=62,bh=4;
  X.fillStyle='rgba(255,255,255,.12)';X.beginPath();X.roundRect(bx,by2,bw,bh,2);X.fill();
  X.fillStyle='rgba(79,195,247,.85)';X.beginPath();X.roundRect(bx,by2,bw*Math.min(1,raceT/TIME_LIMIT),bh,2);X.fill();
}

function drawTimeUp(){
  X.fillStyle='rgba(0,0,0,.45)';X.fillRect(0,0,W,H);
  X.fillStyle='#FFEB3B';X.font='bold 56px sans-serif';X.textAlign='center';X.textBaseline='middle';
  X.shadowColor='rgba(0,0,0,.5)';X.shadowBlur=12;
  X.fillText('TIME UP!',W/2,H*.4);
  X.shadowBlur=0;X.textBaseline='alphabetic';
  X.fillStyle='rgba(255,255,255,.75)';X.font='bold 18px sans-serif';
  X.fillText('거리로 승부!',W/2,H*.48);
  X.fillStyle='rgba(255,255,255,.6)';X.font='bold 14px sans-serif';
  X.fillText(`${hudLabelMe()} ${fmtDist(P.dist)}m  ·  ${hudLabelOpp()} ${fmtDist(CPU.dist)}m`,W/2,H*.56);
}

// ═══ TOUCH PADS (원형, 화면 최하단 · 오버레이보다 위) ═══
function drawTouchPads(){
  if(state==='result'||state==='ending')return;
  const r=TOUCH_PAD_R;
  const g=TOUCH_PAD_EDGE_GAP;
  const padY=H-36;
  const cxL=W/2-r-g/2;
  const cxR=W/2+r+g/2;
  function one(cx,k,label){
    X.save();
    const t=Math.min(1,Math.max(0,k));
    const rg=X.createRadialGradient(cx-r*.35,padY-r*.35,r*.15,cx,padY,r*1.15);
    if(t<0.05){
      rg.addColorStop(0,'rgba(200,225,255,0.35)');
      rg.addColorStop(0.55,'rgba(70,130,210,0.5)');
      rg.addColorStop(1,'rgba(30,70,130,0.65)');
    }else{
      rg.addColorStop(0,`rgba(255,255,255,${0.55+0.35*t})`);
      rg.addColorStop(0.45,`rgba(180,230,255,${0.75+0.2*t})`);
      rg.addColorStop(1,`rgba(100,180,240,${0.7+0.25*t})`);
    }
    X.fillStyle=rg;
    X.beginPath();
    X.arc(cx,padY,r,0,Math.PI*2);
    X.fill();
    X.strokeStyle=`rgba(255,255,255,${0.45+0.45*t})`;
    X.lineWidth=2;
    X.stroke();
    X.fillStyle=`rgba(255,255,255,${0.85+0.15*t})`;
    X.font='bold 12px sans-serif';
    X.textAlign='center';
    X.textBaseline='middle';
    X.shadowColor='rgba(0,0,0,0.35)';
    X.shadowBlur=4;
    X.fillText(label,cx,padY);
    X.shadowBlur=0;
    X.textBaseline='alphabetic';
    X.restore();
  }
  one(cxL,padGlowL,'왼');
  one(cxR,padGlowR,'오');
}

// ═══ COUNTDOWN ═══
function drawCD(){
  X.fillStyle='rgba(0,0,0,.35)';X.fillRect(0,0,W,H);
  const txt=cdVal>0?String(cdVal):'GO!';
  const shk=cdVal<=0?Math.sin(cdT*40)*4*(1-cdT*2):0;
  X.save();X.translate(shk,0);
  X.fillStyle='rgba(0,0,0,.25)';
  X.font=`bold ${cdVal>0?80:60}px sans-serif`;X.textAlign='center';X.textBaseline='middle';
  X.fillText(txt,W/2+2,H*.36+2);
  X.fillStyle=cdVal>0?'#fff':'#FFD700';
  X.fillText(txt,W/2,H*.36);
  X.textBaseline='alphabetic';X.restore();
}

// ═══ READY ═══
function drawReady(){
  X.fillStyle='rgba(0,0,0,.4)';X.fillRect(0,0,W,H);
  X.fillStyle='#FFD700';X.font='bold 32px sans-serif';X.textAlign='center';
  X.fillText('🦆 달려오리',W/2,H*.30);
  X.fillStyle='#ddd';X.font='12px sans-serif';
  X.fillText(`${TIME_LIMIT}초 동안 더 멀리! (결승선 없음)`,W/2,H*.37);
  X.fillText('왼발 / 오른발 번갈아 탭!',W/2,H*.41);
  X.fillStyle='#aaa';X.font='11px sans-serif';
  X.fillText('같은 발 연속 = 방향 틀어짐!',W/2,H*.45);
  X.fillText('PC: ← →',W/2,H*.49);
  const p=.85+Math.sin(Date.now()/350)*.15;
  X.globalAlpha=p;X.fillStyle='#FFB300';
  X.beginPath();X.roundRect(W/2-80,H*.53,160,48,24);X.fill();
  X.fillStyle='#333';X.font='bold 20px sans-serif';X.fillText('START 🏁',W/2,H*.53+31);
  X.globalAlpha=1;
}

// ═══ RESULT ═══
function drawResult(){
  X.fillStyle='rgba(0,0,0,.55)';X.fillRect(0,0,W,H);
  const line=`${hudLabelMe()} ${fmtDist(P.dist)}m vs ${hudLabelOpp()} ${fmtDist(CPU.dist)}m`;
  let head,headCol;
  if(winner==='YOU'){head='🏆 승리! 🏆';headCol='#FFD700'}
  else if(winner==='CPU'){head='😢 패배...';headCol='#FF6B6B'}
  else{head='무승부';headCol='#B0BEC5'}
  X.fillStyle=headCol;X.font='bold 30px sans-serif';X.textAlign='center';
  X.fillText(head,W/2,H*.30);
  X.fillStyle='#fff';X.font='bold 17px sans-serif';
  X.fillText(line,W/2,H*.40);
  X.fillStyle='rgba(255,255,255,.75)';X.font='14px sans-serif';
  X.fillText(`${TIME_LIMIT.toFixed(1)}초 종료 · ${P.taps} taps`,W/2,H*.47);
  X.fillStyle='rgba(255,255,255,.5)';X.font='12px sans-serif';
  X.fillText(EMBED_APP?'':'탭하면 다시 시작',W/2,H*.55);
}

// ═══ LOOP ═══
let rafId=0;
let lt=0;
function loop(t){
  const dt=Math.min((t-lt)/1000,.05);lt=t;
  X.save();X.scale(sc,sc);update(dt);draw();X.restore();
  rafId=requestAnimationFrame(loop);
}
rafId=requestAnimationFrame(loop);

/** @type {{ sock: import('socket.io-client').Socket, onPre: (d: object) => void, onGo: () => void, onTick: (p: object) => void, onRace: (r: object) => void, onPeerTap: (d: object) => void } | null} */
let srvHandlers=null;
if(serverRaceOpt&&serverRaceOpt.socket){
  const sock=serverRaceOpt.socket;
  const onPre=(d)=>{
    ensureAudio();
    state='countdown';
    const deadline=d&&d.deadline?Number(d.deadline):0;
    if(deadline>Date.now()){
      cdVal=Math.max(1,Math.ceil((deadline-Date.now())/1000));
    }else{
      cdVal=Math.max(1,Math.min(10,Number(d&&d.seconds)||4));
    }
    cdT=0;
  };
  const onGo=()=>{
    state='racing';
    raceT=0;
    serverRaceSnap=null;
    _raceTickLogCounter=0;
    _blendLogCounter=0;
    console.log('[race] raceGo — HUD 내 오리:',hudLabelMe(),'mySlot:',myServerSlot,'(서버 ducks['+myServerSlot+'] = 내 거리 P.dist)');
  };
  const onTick=(p)=>{
    serverRaceSnap=p;
    _raceTickLogCounter+=1;
    if(_raceTickLogCounter%30===1){
      console.log('[race] raceTick received',p);
    }
  };
  const onPeerTap=(d)=>{
    if(!d||typeof d!=='object')return;
    const slot=d.slot;
    const foot=d.foot;
    if(slot!==0&&slot!==1)return;
    if(slot===myServerSlot)return;
    if(foot!=='left'&&foot!=='right')return;
    applyPeerTapVisual(foot);
    console.log('[raceV3] peerTap applied', foot, 'forcedMovingTimer=', CPU.forcedMovingTimer);
  };
  sock.on('preRaceCountdown',onPre);
  sock.on('raceGo',onGo);
  sock.on('raceTick',onTick);
  sock.on('peerTap',onPeerTap);
  sock.on('raceResult',onServerRaceResult);
  srvHandlers={sock,onPre,onGo,onTick,onRace:onServerRaceResult,onPeerTap};
  console.log('[race] serverRace active', { roomId: serverRaceOpt.roomId, mySlot: serverRaceOpt.mySlot, socketConnected: sock.connected });
}

if(EMBED_APP&&!serverRaceOpt){
  let embedStartDone=false;
  function embedAutostart(){
    if(embedStartDone)return;
    embedStartDone=true;
    console.log('[embed] startCD 호출');
    ensureAudio();
    startCD();
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',embedAutostart,{once:true});
  }else if(document.readyState==='complete'){
    requestAnimationFrame(embedAutostart);
  }else{
    window.addEventListener('load',embedAutostart,{once:true});
  }
}


  function stop() {
    if(srvHandlers){
      srvHandlers.sock.off('preRaceCountdown',srvHandlers.onPre);
      srvHandlers.sock.off('raceGo',srvHandlers.onGo);
      srvHandlers.sock.off('raceTick',srvHandlers.onTick);
      srvHandlers.sock.off('peerTap',srvHandlers.onPeerTap);
      srvHandlers.sock.off('raceResult',srvHandlers.onRace);
      srvHandlers=null;
    }
    cancelAnimationFrame(rafId);
    rafId = 0;
    removeFallOverlay();
    window.removeEventListener('resize', resize);
    hostEl.removeEventListener('pointerdown', racePointerDown, { capture: true });
    hostEl.removeEventListener('keydown', raceKeyDown);
    hostEl.remove();
  }
  return stop;
}
