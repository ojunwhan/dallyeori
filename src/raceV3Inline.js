import { DUCKS_NINE, RACE_ENGINE_PHYSICS, TAP_STRIDE_M } from './constants.js';
import { spend } from './services/hearts.js';
import { showAppToast } from './services/toast.js';
import {
  emitRaceJoin,
  ensureSocket,
  getGameSocket,
  getJwtUid,
  getRaceJoinPayloadUid,
  isGuestQrFlowActive,
  normalizeRaceSlot,
} from './services/socket.js';
import { createRace3DRenderer } from './race3DRenderer.js';

/**
 * dallyeori-v3.html 로직 동일 — iframe 없이 앱 페이지에서 실행
 * @param {HTMLElement} hostEl
 * @param {{
 *   onFinish?: (payload: object) => void,
 *   terrainKey?: string,
 *   getAppState?: () => object,
 *   serverRace?: { socket: import('socket.io-client').Socket, roomId: string, mySlot: 0|1, myUid?: string, myDuckId?: string, oppDuckId?: string, myDuckName?: string, oppDuckName?: string, oppUid?: string, myProfile?: Record<string, unknown>, emitTap?: (foot: 'left'|'right') => void },
 *   embedMode?: boolean,
 * }} options
 * @returns {() => void} stop — 리스너·rAF 정리
 */
export function mountRaceV3Game(hostEl, options) {
  pendingRematchFromPeer = null;
  openRematchInviteFromPeer = null;
  _wireOppLastFoot = null;
  const onFinish = options && options.onFinish;
  const getAppState = options && typeof options.getAppState === 'function' ? options.getAppState : null;
  function normalizeTerrainKey(k) {
    const s = k && String(k);
    if (s === 'ice' || s === 'cliff' || s === 'iceCliff') return s;
    return 'normal';
  }
  const raceTerrainKey = normalizeTerrainKey(options && options.terrainKey);
  const serverRaceOpt = options && options.serverRace;
  const myServerSlotNorm = serverRaceOpt ? normalizeRaceSlot(serverRaceOpt.mySlot) : null;
  const myServerSlot = myServerSlotNorm != null ? myServerSlotNorm : 0;
  /** matchFound 시점 pr.socket 과 전역 gameSocket 불일치 시 죽은 소켓에만 countdown 이 붙는 문제 방지 */
  function getRaceIoSocket() {
    const g = getGameSocket();
    if (g) return g;
    return serverRaceOpt?.socket ?? null;
  }
  /** iframe 임베드일 때만 true — 메인 앱은 false(기본). true로 두면 ready/reset 탭·키가 막혀 폰에서 무반응처럼 보일 수 있음 */
  const EMBED_APP = Boolean(options && options.embedMode);
  function isServerRaceConnected() {
    return !!(serverRaceOpt && getRaceIoSocket()?.connected);
  }
  /** 한판더 대기 중 matchFound 리스너·타이머 정리 */
  const rematchListenCtx = { matchFoundFn: /** @type {(() => void) | null} */ (null), waitTid: 0 };
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
    'position:fixed;inset:0;z-index:200;touch-action:manipulation;background:#222;overflow:hidden;-webkit-touch-callout:none;';
  hostEl.replaceChildren();
  hostEl.tabIndex = -1;
  try {
    hostEl.focus({ preventScroll: true });
  } catch (e) {}
  let renderer3D;
  try {
    renderer3D = createRace3DRenderer(hostEl, {
      terrainKey: raceTerrainKey,
      myDuckId: serverRaceOpt?.myDuckId || 'duri',
      oppDuckId: serverRaceOpt?.oppDuckId || 'tori',
      myServerSlot,
    });
  } catch (err) {
    console.error('[race] 3D/WebGL 초기화 실패', err);
    const fail = document.createElement('div');
    fail.setAttribute('role', 'alert');
    fail.style.cssText =
      'position:absolute;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;' +
      'padding:24px;color:#fff;background:linear-gradient(180deg,#1a1a1a,#0d0d0d);text-align:center;' +
      'font-size:16px;line-height:1.5;box-sizing:border-box;';
    fail.innerHTML =
      '<div><strong>경기 화면을 불러오지 못했어요.</strong><br/>새로고침 하거나, 절전 모드를 끄고 다시 시도해 주세요.<br/>' +
      '<span style="opacity:.7;font-size:13px;margin-top:12px;display:block">(서버 로그보다 브라우저/기기 WebGL 문제인 경우가 많습니다)</span></div>';
    hostEl.appendChild(fail);
    return () => {
      fail.remove();
    };
  }
  const hudEl = document.createElement('div');
  hudEl.id = 'race-hud';
  hudEl.style.cssText =
    'position:fixed;top:10px;left:50%;transform:translateX(-50%);color:#fff;font-family:ui-monospace,monospace,system-ui;font-size:15px;background:rgba(0,0,0,0.5);padding:8px 20px;border-radius:16px;z-index:10;text-align:center;pointer-events:none;font-variant-numeric:tabular-nums;';
  hostEl.appendChild(hudEl);

  const DUCK_FOOTPRINT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 56" width="54" height="42" aria-hidden="true">' +
    '<g fill="rgba(255,176,72,0.95)" stroke="rgba(160,82,30,0.9)" stroke-width="1.3">' +
    '<ellipse cx="36" cy="40" rx="15" ry="10"/>' +
    '<ellipse cx="23" cy="22" rx="8" ry="15" transform="rotate(-22 23 22)"/>' +
    '<ellipse cx="37" cy="15" rx="8" ry="16"/>' +
    '<ellipse cx="51" cy="22" rx="8" ry="15" transform="rotate(22 51 22)"/>' +
    '</g></svg>';
  const tapPadsWrap = document.createElement('div');
  tapPadsWrap.className = 'race-tap-pads';
  tapPadsWrap.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:24;display:flex;flex-direction:row;' +
    'align-items:flex-end;justify-content:center;gap:1.5cm;pointer-events:none;box-sizing:border-box;' +
    'padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));touch-action:manipulation;';
  function makeTapPad(footLR) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tapPad = footLR;
    btn.setAttribute('aria-label', footLR === 'L' ? '왼발 탭' : '오른발 탭');
    btn.style.cssText =
      'pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
      'appearance:none;border:none;margin:0;cursor:pointer;padding:12px 20px;border-radius:22px;' +
      'background:rgba(28,28,32,0.58);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'box-shadow:0 4px 22px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;' +
      'min-width:min(32vw,132px);min-height:58px;outline-offset:2px;transition:filter .08s ease;';
    btn.innerHTML = DUCK_FOOTPRINT_SVG;
    return btn;
  }
  const leftTapPadBtn = makeTapPad('L');
  const rightTapPadBtn = makeTapPad('R');
  tapPadsWrap.appendChild(leftTapPadBtn);
  tapPadsWrap.appendChild(rightTapPadBtn);
  hostEl.appendChild(tapPadsWrap);
  /** PC는 (pointer: fine) 이라 패드가 숨겨지고 화면 절반 탭만 쓰는데, 그때 window.innerWidth 기준이면 넓은 창·레터박스에서 발이 뒤집혀 느껴짐 → 항상 패드 표시 + 아래 footFromPointerClientX 로 보조 */
  function updateTapPadsVisibility() {
    tapPadsWrap.style.display = 'flex';
  }
  function footFromPointerClientX(clientX) {
    const r = hostEl.getBoundingClientRect();
    if (!(r.width > 0)) return clientX < window.innerWidth * 0.5 ? 'L' : 'R';
    const mid = r.left + r.width * 0.5;
    return clientX < mid ? 'L' : 'R';
  }
  function resize() {
    renderer3D.resize();
    updateTapPadsVisibility();
  }
  resize();
  requestAnimationFrame(() => {
    try {
      renderer3D.resize();
    } catch (_) {
      /* ignore */
    }
  });
  window.addEventListener('resize', resize);

'use strict';
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
/** 안드로이드 등. iOS Safari 는 대부분 미지원 */
function hapticLight(ms){
  try{
    if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function')navigator.vibrate(ms);
  }catch(e){/* ignore */}
}
/**
 * 방송 정각 알림 느낌 — 3·2·1 짧은 이중 똑딱, GO 는 약간 긴 상승 톤
 * @param {number} cd 3|2|1|0
 */
function playStationCountdownBeep(cd){
  ensureAudio();
  if(!ac)return;
  const t0=ac.currentTime;
  const g=ac.createGain();
  g.connect(ac.destination);
  g.gain.setValueAtTime(0.0001,t0);
  if(cd===0){
    g.gain.exponentialRampToValueAtTime(0.28,t0+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+0.42);
    const freqs=[523.25,659.25,783.99];
    for(let i=0;i<3;i++){
      const o=ac.createOscillator();
      o.type='sine';
      o.frequency.setValueAtTime(freqs[i],t0+i*0.07);
      o.connect(g);
      o.start(t0+i*0.07);
      o.stop(t0+i*0.07+0.11);
    }
    hapticLight(14);
    return;
  }
  g.gain.exponentialRampToValueAtTime(0.26,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.22);
  const a=1046.5;
  const b=1318.5;
  for(let i=0;i<2;i++){
    const o=ac.createOscillator();
    o.type='sine';
    o.frequency.setValueAtTime(i===0?a:b,t0+i*0.052);
    o.connect(g);
    o.start(t0+i*0.052);
    o.stop(t0+i*0.052+0.048);
  }
  hapticLight(6);
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
/**
 * 레이스 탭 — 합성 클릭음 + vibrate (파일 없음). 모바일은 첫 ensure 후 resume.
 * @param {'good'|'same'|'stumble'} kind
 */
function playTapFeedback(kind){
  ensureAudio();
  if(ac&&ac.state==='suspended')void ac.resume();
  if(!ac)return;
  const t0=ac.currentTime;
  const g=ac.createGain();
  g.connect(ac.destination);
  g.gain.setValueAtTime(0.0001,t0);
  let f0,f1,dur,peak;
  if(kind==='good'){
    f0=1550+Math.random()*120;
    f1=Math.max(80,f0*0.92);
    dur=0.038;
    peak=0.2;
  }else if(kind==='same'){
    f0=520+Math.random()*80;
    f1=Math.max(60,f0*0.85);
    dur=0.048;
    peak=0.18;
  }else{
    f0=280+Math.random()*60;
    f1=Math.max(50,f0*0.78);
    dur=0.056;
    peak=0.22;
  }
  g.gain.exponentialRampToValueAtTime(peak,t0+0.004);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  const o=ac.createOscillator();
  o.type='sine';
  o.frequency.setValueAtTime(f0,t0);
  o.frequency.exponentialRampToValueAtTime(f1,t0+dur*0.88);
  o.connect(g);
  o.start(t0);
  o.stop(t0+dur+0.012);
  if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'){
    if(kind==='good')navigator.vibrate(15);
    else if(kind==='same')navigator.vibrate(30);
    else navigator.vibrate([20,10,20]);
  }
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
/** 서버 카운트다운 기준 시각(ms) — 이벤트 유실 시에도 로컬에서 숫자·GO 진행 */
let serverCdStartAt=/** @type {number|null} */(null);
let _cdGoRecoverAcc=0;
/** 서버 레이스 이벤트 수신 시각 — connected 만으로 재연결 UI 판단 시 PC 오탐 방지 */
let lastServerRaceIoAt=0;
function touchServerRaceIo(){lastServerRaceIoAt=Date.now();}
/** 마지막 raceTick 수신 — 스냅만 남고 틱이 끊기면 dist 가 0m 에 고정되는 PC 버그 방지 */
let lastRaceTickRecvAt=0;
function isServerRaceTickFresh(){
  return !!(
    serverRaceSnap &&
    lastRaceTickRecvAt>0 &&
    Date.now()-lastRaceTickRecvAt<1250
  );
}
let _raceTickLogCounter=0;
let _blendLogCounter=0;
let playerSquash=false;
let oppSquash=false;
/** 온라인 ready 에서 requestRaceSync 스팸 방지 */
let lastReadyRaceSyncAt=0;
/** receiveRematch 가 raceResult(엔딩)보다 먼저 오면 state===racing 이라 무시되던 문제 보정 */
let pendingRematchFromPeer = /** @type {{ senderUid: string, senderName: string } | null} */ (null);
/** mountRaceV3Game(serverRace) 에서 할당 — 엔딩 진입 시 pendingRematchFromPeer 플러시 */
let openRematchInviteFromPeer = /** @type {((senderUid: string, senderName: string) => void) | null} */ (null);
/** raceTick 상대 lastFoot 직전값 — 탭 스냅샷으로 다리 보조 */
let _wireOppLastFoot = /** @type {'L'|'R'|null} */ (null);

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

function tryRaceResyncFromReady(){
  if(!serverRaceOpt?.roomId)return;
  const now=Date.now();
  if(now-lastReadyRaceSyncAt<380)return;
  lastReadyRaceSyncAt=now;
  try{
    const ru=getRaceJoinPayloadUid()||(typeof serverRaceOpt.myUid==='string'?serverRaceOpt.myUid:'');
    if(isGuestQrFlowActive()){
      const sk=getRaceIoSocket();
      if(!sk?.connected)return;
      emitRaceJoin(serverRaceOpt.roomId,myServerSlot,sk,ru);
      sk.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
      return;
    }
    if(!ensureSocket()?.connected)return;
    emitRaceJoin(serverRaceOpt.roomId,myServerSlot,null,ru);
    getGameSocket()?.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
  }catch(e){
    console.warn('[race] ready requestRaceSync',e);
  }
}

/** 온라인 준비(ready) — 카운트다운과 같은 제자리 탭 연출, 상태는 ready 유지 */
function tapReadyWarmupJog(foot){
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
  hapticLight(10);
  bumpPadGlow(foot);
  P.bodySwTgt=foot==='L'?0.68:-0.68;
  playerSquash=true;
}

/**
 * 서버 peerTap 전용 — 상대 오리(CPU) 시각만 (거리/속도 불변).
 * 다리·몸통·wc 스텝 값은 로컬 tap()과 동일 (race 카운트다운 제외).
 * @param {'left'|'right'} foot
 * @param {{ silent?: boolean }} [opt] silent=true 이면 효과음 없음(raceTick 권위 lastFoot 보조)
 */
function applyPeerTapVisual(foot, opt){
  if(state!=='racing')return;
  if(!isServerRaceConnected())return;
  !opt?.silent && playSlap();
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
    hapticLight(10);
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
  let stride=TAP_STRIDE_M;
  if(p.stumble)stride*=0.45;
  if(sameFoot){
    if(foot==='L')p.dirA-=PH.SAME_FOOT_ANGLE;
    else p.dirA+=PH.SAME_FOOT_ANGLE;
    if(terr.slipOnSameFoot){
      p.spinAngle+=terr.spinRate||0.35;
      slipFxUntil=raceT+0.25;
    }
    stride*=0.38;
  }else{
    const r=PH.ANGLE_RECOVERY;
    if(p.dirA>r)p.dirA-=r;
    else if(p.dirA<-r)p.dirA+=r;
    else p.dirA=0;
    if(terr.spinRecovery!=null){
      p.spinAngle=moveTowardVal(p.spinAngle,0,terr.spinRecovery);
    }
  }
  p.dirA=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,p.dirA));
  p.spinAngle=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,p.spinAngle));
  const ca=Math.cos(p.dirA);
  const sa=Math.sin(p.dirA);
  if(!(isServerRaceConnected()&&isServerRaceTickFresh())){
    p.dist+=stride*ca;
    p.lateral+=stride*sa;
  }
  p.v=Math.min(PH.MAX_SPEED,stride*8);
  p.spd=p.v;
  p.lastFoot=foot;
  p.taps++;
  p.lastTapRaceT=raceT;
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
  playTapFeedback(p.stumble?'stumble':sameFoot?'same':'good');
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

/** 모바일 하단 오리발 패드 — 전체 화면 좌우 절반 대신 명시적 발 구역 */
function handleTapPadPointerDown(e, foot) {
  e.preventDefault();
  e.stopPropagation();
  if (state === 'ready') {
    ensureAudio();
    if (!EMBED_APP) {
      if (serverRaceOpt) {
        tryRaceResyncFromReady();
        tapReadyWarmupJog(foot);
        return;
      }
      startCD();
      return;
    }
    return;
  }
  if (state === 'result' && !EMBED_APP) {
    reset();
    return;
  }
  if (state === 'ending') return;
  if (state === 'countdown') {
    if (isNonPrimaryMouseButton(e)) return;
    tap(foot);
    return;
  }
  if (state !== 'racing') return;
  if (isNonPrimaryMouseButton(e)) return;
  if (fallPaused) return;
  tap(foot);
}

function racePointerDown(e){
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('[data-tap-pad]')) return;
  console.log('[input] pointerdown, state:',state,'clientX:',e.clientX,'button:',e.button,'pointerType:',e.pointerType);
  if(state==='ready'&&!EMBED_APP){
    e.preventDefault();
    if(serverRaceOpt){
      tryRaceResyncFromReady();
      tapReadyWarmupJog(footFromPointerClientX(e.clientX));
      return;
    }
    startCD();
    return;
  }
  if(state==='result'&&!EMBED_APP){e.preventDefault();reset();return}
  if(state==='ending'){
    const canvas=typeof renderer3D.getCanvas==='function'?renderer3D.getCanvas():null;
    if(canvas&&(e.target===canvas||(canvas.contains&&canvas.contains(/** @type {Node} */(e.target))))){
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('[input] state가 racing이 아님, 무시');
    return;
  }
  if(state==='countdown'){
    e.preventDefault();
    if(isNonPrimaryMouseButton(e)){console.log('[input] countdown: 마우스 보조 버튼, 무시');return}
    const foot = footFromPointerClientX(e.clientX);
    console.log('[input] countdown 제자리, tap 직전 foot:',foot);
    tap(foot);
    console.log('[input] countdown 제자리 tap 완료');
    return;
  }
  if(state!=='racing'){console.log('[input] state가 racing이 아님, 무시');return}
  e.preventDefault();
  if(isNonPrimaryMouseButton(e)){console.log('[input] 마우스 button 0 아님, 무시 button:',e.button);return}
  const foot = footFromPointerClientX(e.clientX);
  console.log('[input] tap 호출 직전, foot:',foot);
  tap(foot);
  console.log('[input] tap 호출 완료, P.dist:',P.dist.toFixed(1));
}
hostEl.addEventListener('pointerdown', racePointerDown, { passive: false, capture: true });
leftTapPadBtn.addEventListener('pointerdown', (e) => handleTapPadPointerDown(e, 'L'), { passive: false });
rightTapPadBtn.addEventListener('pointerdown', (e) => handleTapPadPointerDown(e, 'R'), { passive: false });

function raceKeyDown(e){
  if(state==='result'){if(EMBED_APP)return;reset();return}
  if(state==='ready'&&!EMBED_APP){
    if(serverRaceOpt){
      if(e.key==='ArrowLeft'){tryRaceResyncFromReady();tapReadyWarmupJog('L');return;}
      if(e.key==='ArrowRight'){tryRaceResyncFromReady();tapReadyWarmupJog('R');return;}
      startCD();
      return;
    }
    startCD();
    return;
  }
  if(e.key==='ArrowLeft')tap('L');if(e.key==='ArrowRight')tap('R');
}
hostEl.addEventListener('keydown',raceKeyDown);

function startCD(){
  ensureAudio();
  /** 온라인: 로컬 countdown 진입 금지 — 서버 이벤트·sync 로만 진행. 탭은 동기화 요청만 */
  if(serverRaceOpt){
    tryRaceResyncFromReady();
    return;
  }
  state='countdown';
  cdVal=CD_START_VAL;
  cdT=0;
}
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
  if(!r||typeof r!=='object')return;
  if(!Array.isArray(r.distances)||r.distances.length<2)return;
  touchServerRaceIo();
  const ws=r.winnerSlot;
  if(ws!==-1&&ws!==0&&ws!==1)return;
  const rt=Number(r.raceTime);
  /**
   * 카운트다운 중에는 스테일/오염된 raceResult(0초·0m 무승부)만 오면 PC가 즉시 DRAW 로 끝나는 버그가 있었음.
   * 서버가 실제로 레이스를 돌린 뒤 온 결과만 수용(raceTime 하한).
   */
  if(state==='countdown'){
    if(!Number.isFinite(rt)||rt<0.75){
      console.warn('[race] raceResult 무시(카운트다운 중 raceTime 비정상·스테일 의심)',rt,r);
      return;
    }
  }
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
  if(!serverRaceOpt||!isServerRaceTickFresh())return;
  const pl=serverRaceSnap.players;
  if(!pl||pl.length<2)return;
  const me=pl[myServerSlot];
  const opp=pl[1-myServerSlot];
  if(!me||!opp)return;
  /**
   * 내 오리(P): 거리·횡이동·스텀블/추락만 서버 권위. v/dirA/spinAngle 은 매 프레임 서버로 lerp 하면
   * 탭 직후 로컬 가속이 다음 틱 전에 계속 낮은 me.v 쪽으로 끌려 가 입력이 무뎌지고 3D도 죽어 보임.
   * v·자세는 tap()+updDuck() 로컬, 추락 구간만 서버 v=0 에 맞춤.
   */
  const aPos=1-Math.exp(-22*dt);
  const aVel=1-Math.exp(-11*dt);
  P.dist=lerp(P.dist,wireNum(me.dist,P.dist),aPos);
  P.lateral=lerp(P.lateral,wireNum(me.lateral,P.lateral),Math.min(1,aVel*1.1));
  P.stumble=me.isStumbling?1:0;
  if(me.isFallen){
    const wv=wireNum(me.v,0);
    P.v=wv;
    P.spd=wv;
  }
  if(me.isFallen&&!fallPaused){playerFallAnim=1;showFallOverlay();}
  CPU.dist=lerp(CPU.dist,wireNum(opp.dist,CPU.dist),aPos);
  CPU.v=lerp(CPU.v,wireNum(opp.v,CPU.v),aVel);
  CPU.spd=lerp(CPU.spd,wireNum(opp.spd!=null?opp.spd:opp.v,CPU.spd),aVel);
  CPU.lateral=lerp(CPU.lateral,wireNum(opp.lateral,CPU.lateral),aVel);
  CPU.dirA=lerp(CPU.dirA,wireNum(opp.dirA,CPU.dirA),aVel);
  CPU.spinAngle=lerp(CPU.spinAngle,wireNum(opp.spinAngle,CPU.spinAngle),aVel);
  CPU.stumble=opp.isStumbling?1:0;
  CPU.lastTapRaceT=raceT;
  if (!Number.isFinite(P.dist)) P.dist = wireNum(me.dist, 0);
  if (!Number.isFinite(CPU.dist)) CPU.dist = wireNum(opp.dist, 0);
  try {
    const lfRaw =
      opp.lastFoot === 'L' || opp.lastFoot === 'R'
        ? opp.lastFoot
        : opp.lastFoot === 'l'
          ? 'L'
          : opp.lastFoot === 'r'
            ? 'R'
            : null;
    if (lfRaw === 'L' || lfRaw === 'R') {
      if (lfRaw !== _wireOppLastFoot) {
        _wireOppLastFoot = lfRaw;
        if (lfRaw !== CPU.lastFoot) {
          applyPeerTapVisual(lfRaw === 'L' ? 'left' : 'right', { silent: true });
        }
      }
    }
  } catch (e) {
    console.error('[blend] lastFoot', e);
  }
  _blendLogCounter += 1;
  if(_blendLogCounter%30===1){
    console.log('[blend] 상대(CPU) dist:',CPU.dist,'서버 opp.dist:',opp.dist,'내 P.dist:',P.dist,'opp.spd:',opp.spd);
  }
}

// ═══ HELPERS ═══
function lerp(a,b,t){return a+(b-a)*t}

// ═══ UPDATE ═══
/**
 * 서버 카운트다운 숫자 — 모바일 백그라운드에서 rAF 가 멈춰도 setInterval 과 동일 식으로 진행
 * @returns {number|null} 경과 ms, 적용 불가면 null
 */
function applyServerCountdownWallClock(){
  if(state!=='countdown')return null;
  const srvCd=!!serverRaceOpt;
  if(!srvCd||serverCdStartAt==null||!Number.isFinite(serverCdStartAt))return null;
  const elapsed=Date.now()-serverCdStartAt;
  /** 서버 시각·단말 시각 차이로 elapsed 가 짧게 나오면 idx 가 한 박자 느림 → 덮어쓰기만 하면 2에 고정됨 */
  const idx=Math.min(3,Math.floor(Math.max(0,elapsed+180)/1000));
  const counts=[3,2,1,0];
  const next=counts[idx];
  cdVal=Math.min(cdVal,next);
  return elapsed;
}
function update(dt){
  padGlowL=Math.max(0,padGlowL-dt*7);
  padGlowR=Math.max(0,padGlowR-dt*7);
  if(state==='countdown'){
    cdT+=dt;
    updAnim(P,dt);
    updAnim(CPU,dt);
    const srvCd=!!serverRaceOpt;
    if(srvCd&&serverCdStartAt!=null&&Number.isFinite(serverCdStartAt)){
      const elapsed=applyServerCountdownWallClock();
      /** GO(0) 이후 ~250ms에 서버가 레이싱 시작 — race-start 유실 시 requestRaceSync로 복구 */
      if(elapsed!=null&&elapsed>=3100){
        _cdGoRecoverAcc+=dt;
        if(_cdGoRecoverAcc>=0.4){
          _cdGoRecoverAcc=0;
          const sk=getRaceIoSocket();
          if(sk){
            try{
              sk.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
            }catch(e){/* ignore */}
          }
        }
      }else{
        _cdGoRecoverAcc=0;
      }
    }else if(!srvCd&&cdT>=CD_STEP_SEC){
      cdT=0;
      cdVal--;
      if(cdVal<0)state='racing';
    }
    return;
  }
  if(state==='racing'){
    const srv=!!serverRaceOpt;
    if(srv){
      /** raceT·상대 동기화는 추락 UI 중에도 유지 — 멈추면 상대가 0m로 굳거나 화면이 버벅인 것처럼 보임 */
      if(
        isServerRaceTickFresh()&&
        serverRaceSnap&&
        typeof serverRaceSnap.raceT==='number'&&
        Number.isFinite(serverRaceSnap.raceT)
      ){
        raceT=serverRaceSnap.raceT;
      }else if(srv){
        raceT+=dt;
      }
      blendServerDucks(dt);
      updDuck(P,dt);
      if(!fallPaused)flowAcc+=((P.v+CPU.v)/2)*55*dt;
      updAnim(CPU,dt);
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
        let stride=TAP_STRIDE_M*CPU_TAP_DV_MUL*CPU.cpuM;
        const f=CPU.lastFoot==='L'?'R':'L';
        if(slip){
          if(CPU.lastFoot==='L')CPU.dirA-=PH.SAME_FOOT_ANGLE*0.7;
          else CPU.dirA+=PH.SAME_FOOT_ANGLE*0.7;
          if(terr.slipOnSameFoot)CPU.spinAngle+=(terr.spinRate||0.35)*0.6;
          stride*=0.4;
        }else{
          const r=PH.ANGLE_RECOVERY;
          if(CPU.dirA>r)CPU.dirA-=r;
          else if(CPU.dirA<-r)CPU.dirA+=r;
          else CPU.dirA=0;
          if(terr.spinRecovery!=null)CPU.spinAngle=moveTowardVal(CPU.spinAngle,0,terr.spinRecovery);
        }
        CPU.dirA=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,CPU.dirA));
        CPU.spinAngle=Math.max(-DIR_A_LIMIT,Math.min(DIR_A_LIMIT,CPU.spinAngle));
        const ca=Math.cos(CPU.dirA);
        const sa=Math.sin(CPU.dirA);
        CPU.dist+=stride*ca;
        CPU.lateral+=stride*sa;
        CPU.v=Math.min(PH.MAX_SPEED,stride*8);
        CPU.spd=CPU.v;
        CPU.lastTapRaceT=raceT;
        CPU.wcTgt+=Math.PI;
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
  if(serverRaceOpt)return;
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
  /** 한 탭 = 한 걸음(TAP_STRIDE_M) — 프레임 간 v 로 dist 를 적분하지 않음. 온라인은 서버 blend 가 dist 권위 */
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
  if(inRace&&isServerRaceConnected()&&p===CPU&&isServerRaceTickFresh()&&serverRaceSnap){
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
/** 카운트다운 숫자 바뀔 때만 정각식 비프 1회 */
let _cdStationBeepKey = /** @type {string | null} */ (null);
/** PC 등에서 transport 업그레이드로 disconnect→connect 순서가 꼬여도 connected 기준으로 오버레이 동기화 */
let raceReconnectOvRef = /** @type {HTMLDivElement | null} */ (null);
function syncRace3D() {
  tapPadsWrap.style.display = state === 'ending' || state === 'result' ? 'none' : 'flex';
  if (state === 'ready' && _r3PrevState !== 'ready') {
    renderer3D.setCountdown(null);
    _cdStationBeepKey = null;
  }
  if (state === 'countdown') {
    if (cdVal >= 1 && cdVal <= 3) renderer3D.setCountdown(cdVal);
    else if (cdVal === 0) renderer3D.setCountdown(0);
    const k = String(cdVal);
    if (cdVal >= 0 && cdVal <= 3 && _cdStationBeepKey !== k) {
      _cdStationBeepKey = k;
      playStationCountdownBeep(cdVal);
    }
  } else if (_r3PrevState === 'countdown') {
    renderer3D.setCountdown(null);
    _cdStationBeepKey = null;
  }
  if (state === 'racing' && _r3PrevState !== 'racing') {
    renderer3D.setRacing();
  }
  if (state === 'ending' && _r3PrevState !== 'ending') {
    {
      const sk = getRaceIoSocket();
      if (sk?.connected && serverRaceOpt?.roomId) {
        try {
          sk.emit('raceEndingEntered', { roomId: serverRaceOpt.roomId });
        } catch (e) {
          console.warn('[race] raceEndingEntered emit', e);
        }
      }
    }
    if (pendingRematchFromPeer && openRematchInviteFromPeer) {
      const pr = pendingRematchFromPeer;
      pendingRematchFromPeer = null;
      try {
        openRematchInviteFromPeer(pr.senderUid, pr.senderName);
      } catch (e) {
        console.warn('[race] flush pending rematch invite', e);
      }
    }
    const myWin = winner === 'YOU';
    const oppWin = winner === 'CPU';
    renderer3D.setEnding(
      {
        winner: myWin ? 'win' : oppWin ? 'lose' : 'draw',
        myDist: P.dist,
        oppDist: CPU.dist,
      },
      {
        onRematch: () => {
          const appSt = typeof getAppState === 'function' ? getAppState() : null;
          const targetUid =
            serverRaceOpt?.oppUid ||
            (appSt?.lastOpponent &&
            typeof appSt.lastOpponent.userId === 'string' &&
            appSt.lastOpponent.userId
              ? appSt.lastOpponent.userId
              : '');
          if (!targetUid) {
            showAppToast('상대방 정보가 없습니다.');
            return;
          }
          const sock = getRaceIoSocket() || serverRaceOpt?.socket;
          if (!sock || !sock.connected) {
            showAppToast('상대방이 떠났습니다.');
            return;
          }
          if (appSt && typeof appSt === 'object') appSt.rematchFromRacePending = true;
          console.log('[DEBUG-REMATCH] onRematch clicked, screen:', typeof getAppState === 'function' ? getAppState()?.screen : 'unknown');
          sock.emit('sendRematch', {
            targetUid,
            roomId: serverRaceOpt.roomId,
            profile: serverRaceOpt?.myProfile || {},
          });
          function onRematchMatchFound() {
            clearTimeout(rematchListenCtx.waitTid);
            rematchListenCtx.waitTid = 0;
            rematchListenCtx.matchFoundFn = null;
            const st = typeof getAppState === 'function' ? getAppState() : null;
            if (st && typeof st === 'object') st.rematchFromRacePending = false;
            console.log('[DEBUG-REMATCH] matchFound after rematch — app.js globalBridge 가 navigate(race) 처리, 여기서는 정리만');
          }
          rematchListenCtx.matchFoundFn = onRematchMatchFound;
          sock.once('matchFound', onRematchMatchFound);
          rematchListenCtx.waitTid = window.setTimeout(() => {
            rematchListenCtx.waitTid = 0;
            sock.off('matchFound', onRematchMatchFound);
            rematchListenCtx.matchFoundFn = null;
            const st = typeof getAppState === 'function' ? getAppState() : null;
            if (st && typeof st === 'object') st.rematchFromRacePending = false;
            showAppToast('상대방이 응답하지 않습니다.');
          }, 15000);
          showAppToast('한판더 요청을 보냈습니다...');
        },
        onViewRecord: () => {
          const st = typeof getAppState === 'function' ? getAppState() : null;
          if (st && typeof st === 'object') st.rematchFromRacePending = false;
          const pl = makeFinishPayload();
          pl._fromButton = true;
          cleanupAndFinish(pl);
        },
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

  leftTapPadBtn.style.filter = padGlowL > 0.04 ? 'brightness(1.38) saturate(1.12)' : '';
  rightTapPadBtn.style.filter = padGlowR > 0.04 ? 'brightness(1.38) saturate(1.12)' : '';

  const rem = Math.max(0, TIME_LIMIT - raceT);
  if (state === 'racing' || state === 'ending' || state === 'result') {
    hudEl.innerHTML =
      `<div style="font-size:24px;font-weight:bold;line-height:1.2">${rem.toFixed(2)}초</div>` +
      `<div style="font-size:15px;line-height:1.35;margin-top:6px;opacity:0.95">나: ${P.dist.toFixed(3)}m | 상대: ${CPU.dist.toFixed(3)}m</div>`;
  } else {
    hudEl.innerHTML = '';
  }
  /** PC 에서 connected/엔진 상태와 무관하게 오탐 — 레이스 UX 해치므로 비표시(복구는 틱 신선도·requestRaceSync) */
  if (raceReconnectOvRef) {
    raceReconnectOvRef.style.display = 'none';
  }
}

// ═══ LOOP ═══
let rafId=0;
let lt=0;
function loop(t){
  const dt=Math.min((t-lt)/1000,.05);lt=t;
  try {
    update(dt);
    syncRace3D();
  } catch (err) {
    console.error('[raceV3] main loop', err);
  }
  rafId=requestAnimationFrame(loop);
}
rafId=requestAnimationFrame(loop);

function showRematchRequest(name, onAccept, onDecline) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);' +
    'background:rgba(0,0,0,0.85);color:#fff;padding:16px 24px;border-radius:16px;' +
    'display:flex;flex-direction:column;align-items:center;gap:12px;z-index:9999;font-size:16px;';
  const line = document.createElement('div');
  const bold = document.createElement('b');
  bold.textContent = name;
  line.appendChild(bold);
  line.appendChild(document.createTextNode('님이 한판더를 신청했습니다!'));
  el.appendChild(line);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;';
  const acc = document.createElement('button');
  acc.textContent = '수락';
  acc.style.cssText =
    'padding:8px 20px;background:#4CAF50;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;';
  const dec = document.createElement('button');
  dec.textContent = '거절';
  dec.style.cssText =
    'padding:8px 20px;background:#f44336;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;';
  acc.onclick = () => {
    el.remove();
    onAccept();
  };
  dec.onclick = () => {
    el.remove();
    onDecline();
  };
  btnRow.appendChild(acc);
  btnRow.appendChild(dec);
  el.appendChild(btnRow);
  document.body.appendChild(el);
  window.setTimeout(() => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
  }, 15000);
}

/** @type {{ sock: import('socket.io-client').Socket, onRaceMatched: (p: object) => void, onCountdown: (d: object) => void, onRaceStart: () => void, onTick: (p: object) => void, onRace: (r: object) => void, onPeerTap: (d: object) => void, onReceiveRematch: (d: object) => void, onRaceAborted: (p: object) => void, onRematchUnavailable: (p: object) => void, onSockConnect: () => void } | null} */
let srvHandlers=null;
/** 서버 카운트다운 이벤트 유실 시 주기적 재동기화 */
let countdownResyncIntervalId=0;
/** 레이싱 중 raceTick 유실 시 requestRaceSync */
let racingResyncIntervalId=0;
/** 카운트다운 중 rAF 정지 대비 월클럭(ms) */
let countdownWallMsIntervalId=0;
if(serverRaceOpt){
  const sock=getRaceIoSocket();
  if(!sock){
    console.warn('[race] serverRace 있으나 IO 소켓 없음 — getGameSocket·pendingRace.socket 확인');
  }else{
  const onRaceMatched=(payload)=>{
    touchServerRaceIo();
    void payload;
    try{
      const ru=getRaceJoinPayloadUid()||(typeof serverRaceOpt.myUid==='string'?serverRaceOpt.myUid:'');
      emitRaceJoin(serverRaceOpt.roomId,myServerSlot,sock,ru);
      sock.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
    }catch(e){
      console.warn('[race] race-matched 후속',e);
    }
  };
  function armRacingResyncInterval(){
    if(racingResyncIntervalId){
      clearInterval(racingResyncIntervalId);
      racingResyncIntervalId=0;
    }
    racingResyncIntervalId=window.setInterval(()=>{
      if(state!=='racing'){
        if(racingResyncIntervalId){
          clearInterval(racingResyncIntervalId);
          racingResyncIntervalId=0;
        }
        return;
      }
      try{
        sock.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
      }catch(e){
        console.warn('[race] racing requestRaceSync',e);
      }
    },900);
  }
  const onRematchUnavailable=(p)=>{
    if(!p||typeof p!=='object')return;
    const reason=typeof p.reason==='string'?p.reason:'';
    if(rematchListenCtx.matchFoundFn){
      try{sock.off('matchFound',rematchListenCtx.matchFoundFn);}catch(e){console.warn(e);}
      rematchListenCtx.matchFoundFn=null;
    }
    if(rematchListenCtx.waitTid){
      clearTimeout(rematchListenCtx.waitTid);
      rematchListenCtx.waitTid=0;
    }
    const st=typeof getAppState==='function'?getAppState():null;
    if(st&&typeof st==='object')st.rematchFromRacePending=false;
    if(reason==='peer_left')showAppToast('상대방이 경기장을 나갔어요.');
    else if(reason==='not_in_ending'||reason==='no_room')showAppToast('지금은 재대전을 요청할 수 없어요.');
  };
  sock.on('rematchUnavailable',onRematchUnavailable);
  openRematchInviteFromPeer = (senderUid, senderName) => {
    showRematchRequest(senderName, () => {
      const s = getRaceIoSocket() || sock;
      if (!s?.connected) return;
      s.emit('acceptRematch', {
        peerUid: senderUid,
        terrain: raceTerrainKey || 'normal',
        profile: serverRaceOpt?.myProfile || {},
      });
    }, () => {});
  };
  const onCountdown=(d)=>{
    pendingRematchFromPeer = null;
    _wireOppLastFoot = null;
    touchServerRaceIo();
    if(racingResyncIntervalId){
      clearInterval(racingResyncIntervalId);
      racingResyncIntervalId=0;
    }
    if(countdownWallMsIntervalId){
      clearInterval(countdownWallMsIntervalId);
      countdownWallMsIntervalId=0;
    }
    ensureAudio();
    state='countdown';
    const rawC=d&&Object.prototype.hasOwnProperty.call(d,'count')?d.count:3;
    const cNum=typeof rawC==='number'?rawC:Number(rawC);
    const c=Number.isFinite(cNum)?cNum:3;
    const cNorm=Math.max(0,Math.min(3,c));
    cdVal=cNorm;
    cdT=0;
    const rawSa=d&&Object.prototype.hasOwnProperty.call(d,'startAt')?d.startAt:undefined;
    let startMs=NaN;
    if(typeof rawSa==='number'&&Number.isFinite(rawSa)&&rawSa>0){
      startMs=rawSa;
    }else if(typeof rawSa==='string'){
      const n=Number(rawSa);
      if(Number.isFinite(n)&&n>0)startMs=n;
    }
    if(Number.isFinite(startMs)){
      serverCdStartAt=startMs;
    }else if(serverCdStartAt==null){
      /** startAt 누락·구버전 서버: 수신 count 기준으로 가상 시작 시각 (이벤트만으로는 2에서 멈춤) */
      serverCdStartAt=Date.now()-(3-cNorm)*1000;
    }
    countdownWallMsIntervalId=window.setInterval(()=>{
      if(state!=='countdown'){
        if(countdownWallMsIntervalId){
          clearInterval(countdownWallMsIntervalId);
          countdownWallMsIntervalId=0;
        }
        return;
      }
      applyServerCountdownWallClock();
    },200);
    if(countdownResyncIntervalId){
      clearInterval(countdownResyncIntervalId);
      countdownResyncIntervalId=0;
    }
    countdownResyncIntervalId=window.setInterval(()=>{
      if(state!=='countdown'){
        if(countdownResyncIntervalId){
          clearInterval(countdownResyncIntervalId);
          countdownResyncIntervalId=0;
        }
        return;
      }
      try{
        sock.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
      }catch(e){
        console.warn('[race] requestRaceSync',e);
      }
    },2000);
  };
  const onRaceStart=()=>{
    /**
     * race-start 와 raceGo 가 둘 다 오거나, 이미 raceTick 으로 레이싱 진입한 뒤 늦게 오면
     * raceT=0·snap=null 로 다시 밀면 한쪽만 트랙이 크게 어긋남 — 두 번째부터는 무시.
     */
    if(countdownResyncIntervalId){
      clearInterval(countdownResyncIntervalId);
      countdownResyncIntervalId=0;
    }
    if(countdownWallMsIntervalId){
      clearInterval(countdownWallMsIntervalId);
      countdownWallMsIntervalId=0;
    }
    if(state==='racing'){
      console.log('[race] race-start/raceGo 중복 무시(이미 레이싱)');
      return;
    }
    touchServerRaceIo();
    serverCdStartAt=null;
    _cdGoRecoverAcc=0;
    lastRaceTickRecvAt=0;
    state='racing';
    cdVal=-1;
    raceT=0;
    serverRaceSnap=null;
    _raceTickLogCounter=0;
    _blendLogCounter=0;
    _wireOppLastFoot = null;
    armRacingResyncInterval();
    console.log('[race] race-start — HUD 내 오리:',hudLabelMe(),'mySlot:',myServerSlot);
  };
  const onTick=(p)=>{
    touchServerRaceIo();
    serverRaceSnap=p;
    lastRaceTickRecvAt=Date.now();
    if(p&&typeof p.raceT==='number'&&Number.isFinite(p.raceT))raceT=p.raceT;
    /** race-start 유실 시 — racing 페이즈에서만 틱이 오므로 상태를 맞춤 */
    if(
      state!=='racing'&&
      state!=='ending'&&
      state!=='result'&&
      p&&
      Array.isArray(p.players)&&
      p.players.length>=2
    ){
      const wasCd = state === 'countdown';
      serverCdStartAt=null;
      _cdGoRecoverAcc=0;
      lastRaceTickRecvAt=Date.now();
      if(countdownResyncIntervalId){
        clearInterval(countdownResyncIntervalId);
        countdownResyncIntervalId=0;
      }
      if(countdownWallMsIntervalId){
        clearInterval(countdownWallMsIntervalId);
        countdownWallMsIntervalId=0;
      }
      state='racing';
      cdVal=-1;
      _wireOppLastFoot = null;
      armRacingResyncInterval();
      console.warn(
        wasCd
          ? '[race] raceTick: 카운트다운 중 클라이언트를 racing 으로 동기화'
          : '[race] raceTick 으로 레이싱 강제 진입(race-start·ready 등 누락 복구)',
      );
    }
    _raceTickLogCounter+=1;
    if(_raceTickLogCounter%30===1){
      console.log('[race] raceTick received',p);
    }
  };
  const onPeerTap=(d)=>{
    touchServerRaceIo();
    if(!d||typeof d!=='object')return;
    const slot=normalizeRaceSlot(d.slot);
    const foot=d.foot;
    if(slot==null)return;
    if(slot===myServerSlot)return;
    if(foot!=='left'&&foot!=='right')return;
    applyPeerTapVisual(foot);
    console.log('[raceV3] peerTap applied', foot, 'forcedMovingTimer=', CPU.forcedMovingTimer);
  };
  sock.on('race-matched',onRaceMatched);
  sock.on('countdown',onCountdown);
  sock.on('race-start',onRaceStart);
  sock.on('raceGo',onRaceStart);
  sock.on('raceTick',onTick);
  sock.on('peerTap',onPeerTap);
  sock.on('raceResult',onServerRaceResult);
  const onRaceAborted=(p)=>{if(typeof onFinish==='function'){try{onFinish({type:'raceAborted',...(p&&typeof p==='object'?/** @type {object} */(p):{})});}catch(e){console.error(e);}}};
  sock.on('raceAborted',onRaceAborted);
  const onReceiveRematch=(data)=>{
    if(!data||typeof data!=='object')return;
    const senderUid=typeof data.senderUid==='string'?data.senderUid:'';
    const senderName=typeof data.senderName==='string'?data.senderName:'상대';
    if(!senderUid)return;
    if(state==='ending'){
      pendingRematchFromPeer = null;
      openRematchInviteFromPeer?.(senderUid,senderName);
      return;
    }
    if(state==='racing'||state==='countdown'){
      pendingRematchFromPeer={senderUid,senderName};
      return;
    }
  };
  sock.on('receiveRematch',onReceiveRematch);
  const getRaceMyUid=()=>{
    try{
      const r=getRaceJoinPayloadUid();
      if(r)return r;
    }catch(e){/* ignore */}
    try{
      const j=getJwtUid();
      if(j)return j;
    }catch(e){/* ignore */}
    if(serverRaceOpt&&typeof serverRaceOpt.myUid==='string'&&serverRaceOpt.myUid)return serverRaceOpt.myUid;
    if(getAppState){
      try{
        const st=getAppState();
        const u=st&&st.user&&typeof st.user.uid==='string'?st.user.uid:'';
        if(u)return u;
      }catch(e){/* ignore */}
    }
    return '';
  };
  const raceReconnectOv=document.createElement('div');
  raceReconnectOv.setAttribute('aria-live','polite');
  raceReconnectOv.textContent='재연결 중…';
  raceReconnectOv.style.cssText=[
    'display:none','position:absolute','inset:0','z-index:300',
    'align-items:center','justify-content:center','background:rgba(0,0,0,0.45)',
    'color:#fff','font-size:16px','font-weight:600','pointer-events:auto',
  ].join(';');
  hostEl.appendChild(raceReconnectOv);
  raceReconnectOvRef=raceReconnectOv;
  const onSockConnect=()=>{
    touchServerRaceIo();
    const ru=getRaceMyUid();
    console.log('[RECONNECT] raceJoin 재전송 roomId='+serverRaceOpt.roomId+' uid='+ru+' slot='+myServerSlot);
    emitRaceJoin(serverRaceOpt.roomId,myServerSlot,sock,ru);
    try{
      sock.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
    }catch(e){
      console.warn('[race] connect resync',e);
    }
  };
  sock.on('connect',onSockConnect);
  if(sock.connected){
    queueMicrotask(onSockConnect);
  }
  srvHandlers={
    sock,
    onRaceMatched,
    onCountdown,
    onRaceStart,
    onTick,
    onRace:onServerRaceResult,
    onPeerTap,
    onReceiveRematch,
    onRaceAborted,
    onRematchUnavailable,
    onSockConnect,
  };
  console.log('[race] serverRace active', { roomId: serverRaceOpt.roomId, mySlot: serverRaceOpt.mySlot, socketConnected: sock.connected });
  window.setTimeout(()=>{
    try{
      if(sock.connected&&serverRaceOpt.roomId){
        const ru=getRaceMyUid();
        emitRaceJoin(serverRaceOpt.roomId,myServerSlot,sock,ru);
        sock.emit('requestRaceSync',{roomId:serverRaceOpt.roomId,slot:myServerSlot});
      }
    }catch(e){
      console.warn('[race] boot requestRaceSync',e);
    }
  },0);
  }
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


  let raceStopped = false;
  function stop() {
    if (raceStopped) return;
    raceStopped = true;
    pendingRematchFromPeer = null;
    openRematchInviteFromPeer = null;
    if(srvHandlers){
      if(countdownResyncIntervalId){
        clearInterval(countdownResyncIntervalId);
        countdownResyncIntervalId=0;
      }
      if(racingResyncIntervalId){
        clearInterval(racingResyncIntervalId);
        racingResyncIntervalId=0;
      }
      if(countdownWallMsIntervalId){
        clearInterval(countdownWallMsIntervalId);
        countdownWallMsIntervalId=0;
      }
      serverCdStartAt=null;
      _cdGoRecoverAcc=0;
      lastServerRaceIoAt=0;
      lastRaceTickRecvAt=0;
      raceReconnectOvRef=null;
      if(srvHandlers.sock?.connected&&serverRaceOpt?.roomId){
        try{srvHandlers.sock.emit('raceEndingLeft',{roomId:serverRaceOpt.roomId});}catch(e){console.warn('[race] raceEndingLeft',e);}
      }
      srvHandlers.sock.off('race-matched',srvHandlers.onRaceMatched);
      srvHandlers.sock.off('countdown',srvHandlers.onCountdown);
      srvHandlers.sock.off('race-start',srvHandlers.onRaceStart);
      srvHandlers.sock.off('raceGo',srvHandlers.onRaceStart);
      srvHandlers.sock.off('raceTick',srvHandlers.onTick);
      srvHandlers.sock.off('peerTap',srvHandlers.onPeerTap);
      srvHandlers.sock.off('raceResult',srvHandlers.onRace);
      srvHandlers.sock.off('raceAborted',srvHandlers.onRaceAborted);
      srvHandlers.sock.off('receiveRematch',srvHandlers.onReceiveRematch);
      srvHandlers.sock.off('rematchUnavailable',srvHandlers.onRematchUnavailable);
      srvHandlers.sock.off('connect',srvHandlers.onSockConnect);
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
