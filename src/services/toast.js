/** 전역 토스트 (짧은 메시지) */

/** @param {string} msg */
export function showAppToast(msg) {
  let el = document.getElementById('dallyeori-app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dallyeori-app-toast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-visible');
  window.clearTimeout(/** @type {any} */ (el)._t);
  el._t = window.setTimeout(() => el.classList.remove('is-visible'), 2200);
}

/** 하트 수신 알림 — 상단 고정, 약 2초 후 페이드아웃 */
/** @param {string} senderName */
export function showHeartReceiveToast(senderName) {
  const name = String(senderName || '누군가').slice(0, 32);
  let el = document.getElementById('dallyeori-heart-recv-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dallyeori-heart-recv-toast';
    el.className = 'heart-recv-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = `❤️ ${name}님이 하트를 보냈어요!`;
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
  window.clearTimeout(/** @type {any} */ (el)._t);
  el._t = window.setTimeout(() => el.classList.remove('is-visible'), 2000);
}

/** 친구 요청 수신 — 상단 토스트 */
/** @param {string} senderName */
export function showFriendRequestToast(senderName) {
  const name = String(senderName || '누군가').slice(0, 32);
  let el = document.getElementById('dallyeori-friend-req-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dallyeori-friend-req-toast';
    el.className = 'friend-req-recv-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = `🤝 ${name}님이 친구 요청을 보냈어요!`;
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
  window.clearTimeout(/** @type {any} */ (el)._t);
  el._t = window.setTimeout(() => el.classList.remove('is-visible'), 2800);
}
