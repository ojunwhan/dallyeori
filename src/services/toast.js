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
