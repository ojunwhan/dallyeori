import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, 'dallyeori-v3.html'), 'utf8');
const m = html.match(/<script>\s*([\s\S]*?)<\/script>/);
if (!m) throw new Error('no script in dallyeori-v3.html');
let body = m[1];

body = body.replace(
  /const EMBED_APP=window\.frameElement!=null;\s*console\.log\('\[embed\] EMBED_APP:',EMBED_APP\);/,
  "const EMBED_APP=true;",
);

body = body.replace(/const RACE_FINISH_BC='dallyeori-race-finish';\s*let _raceBcOut=null;\s*/g, '');

body = body.replace(
  /function postRaceFinishToParent\(\)\{\s*if\(raceFinishPosted\|\|!EMBED_APP\)return;/,
  'function postRaceFinishToParent(){if(raceFinishPosted)return;',
);

body = body.replace(
  /try\{\s*if\(!_raceBcOut\)_raceBcOut=new BroadcastChannel\(RACE_FINISH_BC\);\s*_raceBcOut\.postMessage\(pl\);\s*\}catch\(e\)\{\}/,
  "if(typeof onFinish==='function'){try{onFinish(pl);}catch(e){console.error(e);}}",
);

body = body.replace(
  /loadSprite\('body','\.\.\/assets\/sprites\/ari_body\.png'\);\s*loadSprite\('head','\.\.\/assets\/sprites\/ari_head\.png'\);\s*loadSprite\('leg','\.\.\/assets\/sprites\/ari_leg\.png'\);/,
  `loadSprite('body', new URL('../assets/sprites/ari_body.png', import.meta.url).href);
loadSprite('head', new URL('../assets/sprites/ari_head.png', import.meta.url).href);
loadSprite('leg', new URL('../assets/sprites/ari_leg.png', import.meta.url).href);`,
);

body = body.replace(/resize\(\);addEventListener\('resize',resize\)/, 'resize();window.addEventListener(\'resize\',resize)');

body = body.replace(
  /document\.addEventListener\('pointerdown',function\(e\)\{/,
  "function racePointerDown(e){",
);
body = body.replace(
  /\}\,\{passive:false\}\);\s*document\.addEventListener\('keydown',e=>\{/,
  "};hostEl.addEventListener('pointerdown',racePointerDown,{passive:false,capture:true});function raceKeyDown(e){",
);
body = body.replace(
  /if\(e\.key==='ArrowLeft'\)tap\('L'\);if\(e\.key==='ArrowRight'\)tap\('R'\);\s*\n\}\);/,
  "if(e.key==='ArrowLeft')tap('L');if(e.key==='ArrowRight')tap('R');\n}\nhostEl.addEventListener('keydown',raceKeyDown);",
);

body = body.replace(/\/\/ ═══ LOOP ═══\s*\nlet lt=0;/, '// ═══ LOOP ═══\nlet rafId=0;\nlet lt=0;');
body = body.replace(/requestAnimationFrame\(loop\)/g, 'rafId=requestAnimationFrame(loop)');

const wrapped = `/**
 * dallyeori-v3.html 로직 동일 — iframe 없이 앱 페이지에서 실행
 * @param {HTMLElement} hostEl
 * @param {{ onFinish?: (payload: object) => void }} options
 * @returns {() => void} stop — 리스너·rAF 정리
 */
export function mountRaceV3Game(hostEl, options) {
  const onFinish = options && options.onFinish;
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

${body.replace(/^const C=document\.getElementById\('g'\),X=C\.getContext\('2d'\);\s*/m, '')}

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    window.removeEventListener('resize', resize);
    hostEl.removeEventListener('pointerdown', racePointerDown, { capture: true });
    hostEl.removeEventListener('keydown', raceKeyDown);
    hostEl.remove();
  }
  return stop;
}
`;

fs.writeFileSync(path.join(__dirname, 'raceV3Inline.js'), wrapped);
console.log('wrote raceV3Inline.js');
