/**
 * QR 게스트 — 소켓 연결·매칭 대기용 최소 화면
 */

/**
 * @param {HTMLElement} root
 */
export function mountGuestQrWait(root) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen guest-qr-wait-screen';

  const emoji = document.createElement('div');
  emoji.style.fontSize = '48px';
  emoji.style.marginBottom = '16px';
  emoji.textContent = '🦆';

  const title = document.createElement('div');
  title.className = 'app-title';
  title.style.textAlign = 'center';
  title.textContent = '달려오리';

  const sub = document.createElement('p');
  sub.className = 'app-muted';
  sub.textContent = '경주 준비 중…';

  wrap.appendChild(emoji);
  wrap.appendChild(title);
  wrap.appendChild(sub);
  root.appendChild(wrap);
}
