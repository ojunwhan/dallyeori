import { DUCKS_NINE, RACE_ENGINE_PHYSICS } from './constants.js';
import { spend } from './services/hearts.js';
import { createRace3DRenderer } from './race3DRenderer.js';

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
  function duckDefById(id) {
    const sid = (id && String(id)) || 'bori';
    return DUCKS_NINE.find((d) => d.id === sid) || DUCKS_NINE[0];
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
  hostEl.replaceChildren();
  hostEl.tabIndex = -1;
  try {
    hostEl.focus({ preventScroll: true });
  } catch (e) {}
  const renderer3D = createRace3DRenderer(hostEl, {
    terrainKey: raceTerrainKey,
    myDuckId: serverRaceOpt?.myDuckId || 'duri',
    oppDuckId: serverRaceOpt?.oppDuckId || 'tori',
  });
  const hudEl = document.createElement('div');
  hudEl.id = 'race-hud';
  hudEl.style.cssText =
    'position:fixed;top:10px;left:50%;transform:translateX(-50%);color:#fff;font-family:system-ui;font-size:16px;background:rgba(0,0,0,0.5);padding:8px 20px;border-radius:16px;z-index:10;text-align:center;pointer-events:none;';
  hostEl.appendChild(hudEl);
  function resize() {
    renderer3D.resize();
  }
  resize();
  window.addEventListener('resize', resize);

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
const TIME_LIMIT=13;
const CD_STEP_SEC=1,CD_START_VAL=2;
/** true면 [input]/[physics] 로그 (프로덕션은 false) */
const DEBUG_RACE_TAP=false;
const PH=RACE_ENGINE_PHYSICS;
/** dirA·스핀 상한 (rad, ≈±90°) */
const DIR_A_LIMIT=1.57;
const REVIVE_HEART_COST=3;
/** CPU 탭 시 동일 엔진 보정 계수 */
const CPU_TAP_DV_MUL=0.92;
function moveTowardVal(current,target,maxStep){
  if(current===target)return target;
  const d=target-current;
  if(Math.abs(d)<=maxStep)return target;
  return current+Math.sign(d)*maxStep;
}

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
let playerSquash=false;
let oppSquash=false;

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
  forcedMovingTimer:0,
  /** 서버 raceTick 기준 목표 거리 (상대 오리 보간용) */
  serverTargetDist:0
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
  oppSquash=true;
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
    playerSquash=true;
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
  playerSquash=true;
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
function makeFinishPayload(){
  let result='draw';
  if(winner==='YOU')result='win';
  else if(winner==='CPU')result='lose';
  if(serverFinishPayload){
    const p=serverFinishPayload;
    return{
      type:'raceFinish',
      result: p.result,
      time: p.time,
      myDistance: p.myDistance,
      oppDistance: p.oppDistance,
      taps: p.taps,
      ...(p.hearts&&typeof p.hearts==='object'?{hearts:p.hearts}:{}),
    };
  }
  return{
    type:'raceFinish',
    result,
    time: TIME_LIMIT,
    myDistance: P.dist,
    oppDistance: CPU.dist,
    taps: P.taps,
  };
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
    ...(r.hearts&&typeof r.hearts==='object'?{hearts:r.hearts}:{}),
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
  /** 내 오리: dist는 서버 권위 70% (로컬 updDuck 예측 30% 잔류) */
  const bmDist=0.7;
  const bmVel=0.48;
  P.dist=lerp(P.dist,wireNum(me.dist,P.dist),bmDist);
  P.v=lerp(P.v,wireNum(me.v,P.v),bmVel);
  P.spd=lerp(P.spd,wireNum(me.spd!=null?me.spd:me.v,P.spd),bmVel);
  P.lateral=lerp(P.lateral,wireNum(me.lateral,P.lateral),bmVel);
  P.dirA=lerp(P.dirA,wireNum(me.dirA,P.dirA),bmVel);
  P.spinAngle=lerp(P.spinAngle,wireNum(me.spinAngle,P.spinAngle),bmVel);
  P.stumble=me.isStumbling?1:0;
  if(me.isFallen&&!fallPaused){playerFallAnim=1;showFallOverlay();}
  /** 상대 오리: 거리는 목표만 갱신 후 dt 기반 부드럽게 추종 (~0.2/프레임@60Hz) */
  CPU.serverTargetDist=wireNum(opp.dist,CPU.serverTargetDist);
  const oppDistAlpha=Math.min(1,12*dt);
  CPU.dist=lerp(CPU.dist,CPU.serverTargetDist,oppDistAlpha);
  const bmOpp=Math.min(1,9*dt);
  CPU.v=lerp(CPU.v,wireNum(opp.v,CPU.v),bmOpp);
  CPU.spd=lerp(CPU.spd,wireNum(opp.spd!=null?opp.spd:opp.v,CPU.spd),bmOpp);
  CPU.lateral=lerp(CPU.lateral,wireNum(opp.lateral,CPU.lateral),bmOpp);
  CPU.dirA=lerp(CPU.dirA,wireNum(opp.dirA,CPU.dirA),bmOpp);
  CPU.spinAngle=lerp(CPU.spinAngle,wireNum(opp.spinAngle,CPU.spinAngle),bmOpp);
  CPU.stumble=opp.isStumbling?1:0;
  CPU.lastTapRaceT=raceT;
  _blendLogCounter+=1;
  if(_blendLogCounter%30===1){
    console.log('[blend] 상대(CPU) dist:',CPU.dist,'서버 opp.dist:',opp.dist,'내 P.dist:',P.dist,'opp.spd:',opp.spd);
  }
}

// ═══ HELPERS ═══
function lerp(a,b,t){return a+(b-a)*t}

// ═══ UPDATE ═══
function update(dt){
  padGlowL=Math.max(0,padGlowL-dt*7);
  padGlowR=Math.max(0,padGlowR-dt*7);
  if(state==='countdown'){
    cdT+=dt;
    updAnim(P,dt);
    updAnim(CPU,dt);
    const srvCd=serverRaceOpt&&serverRaceOpt.socket;
    if(!srvCd&&cdT>=CD_STEP_SEC){
      cdT=0;
      cdVal--;
      if(cdVal<0)state='racing';
    }
    return;
  }
  if(state==='racing'){
    const srv=serverRaceOpt&&serverRaceOpt.socket;
    if(srv){
      if(!fallPaused){
        if(serverRaceSnap&&typeof serverRaceSnap.raceT==='number'&&Number.isFinite(serverRaceSnap.raceT)){
          raceT=serverRaceSnap.raceT;
        }
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
        oppSquash=true;
      }
      updDuck(CPU,dt);
      flowAcc+=((P.v+CPU.v)/2)*55*dt;
    }
  }
  if(state==='ending'){
    endT+=dt;
    updAnim(P,dt);updAnim(CPU,dt);
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

// ═══ 3D sync + HTML HUD ═══
let _r3PrevState = '';
function syncRace3D() {
  if (state === 'ready' && _r3PrevState !== 'ready') {
    renderer3D.setCountdown(null);
  }
  if (state === 'countdown') {
    if (cdVal >= 1 && cdVal <= 3) renderer3D.setCountdown(cdVal);
    else if (cdVal === 0) renderer3D.setCountdown(0);
  } else if (_r3PrevState === 'countdown') {
    renderer3D.setCountdown(null);
  }
  if (state === 'racing' && _r3PrevState !== 'racing') {
    renderer3D.setRacing();
  }
  if (state === 'ending' && _r3PrevState !== 'ending') {
    const myWin = winner === 'YOU';
    const oppWin = winner === 'CPU';
    renderer3D.setEnding(
      {
        winner: myWin ? 'win' : oppWin ? 'lose' : 'draw',
        myDist: P.dist,
        oppDist: CPU.dist,
      },
      {
        onRematch: () => cleanupAndFinish(),
        onViewRecord: () => cleanupAndFinish(),
      },
    );
  }
  _r3PrevState = state;

  renderer3D.updatePlayer({
    dist: P.dist,
    lateral: P.lateral || 0,
    dirA: P.dirA || 0,
    v: P.spd || P.v || 0,
    lastFoot: P.lastFoot,
    squash: playerSquash,
  });
  playerSquash = false;
  renderer3D.updateOpponent({
    dist: CPU.dist,
    lateral: CPU.lateral || 0,
    dirA: CPU.dirA || 0,
    v: CPU.spd || CPU.v || 0,
    lastFoot: CPU.lastFoot,
    squash: oppSquash,
  });
  oppSquash = false;

  const rem = Math.max(0, TIME_LIMIT - raceT);
  if (state === 'racing' || state === 'ending' || state === 'result') {
    hudEl.innerHTML = `<div style="font-size:24px;font-weight:bold">${rem.toFixed(1)}초</div><div style="font-size:13px">나: ${P.dist.toFixed(1)}m | 상대: ${CPU.dist.toFixed(1)}m</div>`;
  } else {
    hudEl.innerHTML = '';
  }
}

// ═══ LOOP ═══
let rafId=0;
let lt=0;
function loop(t){
  const dt=Math.min((t-lt)/1000,.05);lt=t;
  update(dt);
  syncRace3D();
  rafId=requestAnimationFrame(loop);
}
rafId=requestAnimationFrame(loop);

/** @type {{ sock: import('socket.io-client').Socket, onCountdown: (d: object) => void, onRaceStart: () => void, onTick: (p: object) => void, onRace: (r: object) => void, onPeerTap: (d: object) => void } | null} */
let srvHandlers=null;
if(serverRaceOpt&&serverRaceOpt.socket){
  const sock=serverRaceOpt.socket;
  const onCountdown=(d)=>{
    ensureAudio();
    state='countdown';
    const c=d&&typeof d.count==='number'?d.count:3;
    cdVal=Math.max(0,Math.min(3,c));
    cdT=0;
  };
  const onRaceStart=()=>{
    state='racing';
    raceT=0;
    serverRaceSnap=null;
    _raceTickLogCounter=0;
    _blendLogCounter=0;
    console.log('[race] race-start — HUD 내 오리:',hudLabelMe(),'mySlot:',myServerSlot);
  };
  const onTick=(p)=>{
    serverRaceSnap=p;
    if(p&&typeof p.raceT==='number'&&Number.isFinite(p.raceT))raceT=p.raceT;
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
  sock.on('countdown',onCountdown);
  sock.on('race-start',onRaceStart);
  sock.on('raceGo',onRaceStart);
  sock.on('raceTick',onTick);
  sock.on('peerTap',onPeerTap);
  sock.on('raceResult',onServerRaceResult);
  const onRaceAborted=(p)=>{if(typeof onFinish==='function'){try{onFinish({type:'raceAborted',...(p&&typeof p==='object'?/** @type {object} */(p):{})});}catch(e){console.error(e);}}};
  sock.on('raceAborted',onRaceAborted);
  srvHandlers={sock,onCountdown,onRaceStart,onTick,onRace:onServerRaceResult,onPeerTap,onRaceAborted};
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
      srvHandlers.sock.off('countdown',srvHandlers.onCountdown);
      srvHandlers.sock.off('race-start',srvHandlers.onRaceStart);
      srvHandlers.sock.off('raceGo',srvHandlers.onRaceStart);
      srvHandlers.sock.off('raceTick',srvHandlers.onTick);
      srvHandlers.sock.off('peerTap',srvHandlers.onPeerTap);
      srvHandlers.sock.off('raceResult',srvHandlers.onRace);
      srvHandlers.sock.off('raceAborted',srvHandlers.onRaceAborted);
      srvHandlers=null;
    }
    cancelAnimationFrame(rafId);
    rafId = 0;
    removeFallOverlay();
    window.removeEventListener('resize', resize);
    hostEl.removeEventListener('pointerdown', racePointerDown, { capture: true });
    hostEl.removeEventListener('keydown', raceKeyDown);
    renderer3D.dispose();
    hudEl.remove();
    hostEl.remove();
  }

  function cleanupAndFinish(overridePayload) {
    if (raceFinishPosted) return;
    raceFinishPosted = true;
    const pl =
      overridePayload != null && typeof overridePayload === 'object'
        ? overridePayload
        : makeFinishPayload();
    serverFinishPayload = null;
    renderer3D.dispose();
    if (typeof onFinish === 'function') {
      try {
        onFinish(pl);
      } catch (e) {
        console.error(e);
      }
    }
    stop();
  }

  return stop;
}
