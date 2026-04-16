/**
 * 프로필 사진 풀스크린 라이트박스 — 뒤로가기(popstate)로 닫힘
 */

import { resolveMediaUrl } from '../services/auth.js';

const LB_Z = 25000;

/** @type {boolean} */
let sessionOpen = false;
/** @type {string} */
let bodyOverflowPrev = '';
/** @type {(() => void) | null} */
let detachListeners = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let failCloseTimer = null;

function clearFailTimer() {
  if (failCloseTimer != null) {
    clearTimeout(failCloseTimer);
    failCloseTimer = null;
  }
}

function tearDownDom() {
  clearFailTimer();
  const el = document.getElementById('dallyeori-avatar-lightbox');
  el?.remove();
}

function restoreBody() {
  document.body.style.overflow = bodyOverflowPrev;
  bodyOverflowPrev = '';
}

function detachAll() {
  detachListeners?.();
  detachListeners = null;
}

/** @returns {boolean} true면 앱 popstate에서 네비게이션 생략 */
function consumeAvatarLightboxPopstate() {
  if (!sessionOpen) return false;
  sessionOpen = false;
  globalThis.__dallyeoriConsumeAvatarLightboxPopstate = undefined;
  detachAll();
  tearDownDom();
  restoreBody();
  return true;
}

function requestCloseAvatarLightbox() {
  if (!sessionOpen) return;
  try {
    history.back();
  } catch {
    consumeAvatarLightboxPopstate();
  }
}

function onKeyDown(/** @type {KeyboardEvent} */ e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    requestCloseAvatarLightbox();
  }
}

/**
 * @param {string} photoURLRaw
 * @param {{ displayName?: string }} [options]
 */
export function openAvatarLightbox(photoURLRaw, options = {}) {
  const raw = typeof photoURLRaw === 'string' ? photoURLRaw.trim() : '';
  if (!raw) return;

  const photoURL = resolveMediaUrl(raw);
  if (!photoURL) return;

  if (sessionOpen) {
    try {
      history.back();
    } catch {
      consumeAvatarLightboxPopstate();
    }
  }

  sessionOpen = true;
  bodyOverflowPrev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  globalThis.__dallyeoriConsumeAvatarLightboxPopstate = consumeAvatarLightboxPopstate;

  try {
    history.pushState({ __dallyeoriAvatarLightbox: true }, '', '');
  } catch {
    sessionOpen = false;
    restoreBody();
    globalThis.__dallyeoriConsumeAvatarLightboxPopstate = undefined;
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'dallyeori-avatar-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '프로필 사진');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    `z-index:${LB_Z}`,
    'background:rgba(0,0,0,0.92)',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:24px 16px 32px',
    'box-sizing:border-box',
    'cursor:default',
  ].join(';');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:12px',
    'width:44px',
    'height:44px',
    'border:none',
    'border-radius:10px',
    'background:rgba(255,255,255,0.12)',
    'color:#fff',
    'font-size:1.25rem',
    'line-height:1',
    'cursor:pointer',
    'z-index:1',
  ].join(';');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    requestCloseAvatarLightbox();
  });

  const column = document.createElement('div');
  column.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'max-width:100%',
    'pointer-events:auto',
  ].join(';');
  column.addEventListener('click', (e) => e.stopPropagation());

  const img = document.createElement('img');
  img.src = photoURL;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  img.style.cssText = [
    'max-width:90vw',
    'max-height:85vh',
    'width:auto',
    'height:auto',
    'object-fit:contain',
    'border-radius:12px',
    'display:block',
    'background:#111',
  ].join(';');

  const nameEl = document.createElement('div');
  const dn = typeof options.displayName === 'string' ? options.displayName.trim() : '';
  if (dn) {
    nameEl.textContent = dn;
    nameEl.style.cssText =
      'margin-top:14px;color:#fff;font-size:1rem;font-weight:600;text-align:center;max-width:90vw;word-break:break-word;';
    column.appendChild(img);
    column.appendChild(nameEl);
  } else {
    column.appendChild(img);
  }

  img.addEventListener('error', () => {
    clearFailTimer();
    const ph = document.createElement('div');
    ph.textContent = '이미지를 불러올 수 없어요';
    ph.style.cssText = [
      'min-width:200px',
      'max-width:90vw',
      'min-height:120px',
      'padding:24px',
      'border-radius:12px',
      'background:#222',
      'color:#bbb',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'text-align:center',
      'font-size:0.95rem',
    ].join(';');
    img.replaceWith(ph);
    failCloseTimer = window.setTimeout(() => {
      failCloseTimer = null;
      if (sessionOpen) requestCloseAvatarLightbox();
    }, 1000);
  });

  overlay.appendChild(closeBtn);
  overlay.appendChild(column);

  overlay.addEventListener('click', () => {
    requestCloseAvatarLightbox();
  });

  const onKd = (e) => onKeyDown(e);
  window.addEventListener('keydown', onKd);
  detachListeners = () => {
    window.removeEventListener('keydown', onKd);
  };

  document.body.appendChild(overlay);
}
