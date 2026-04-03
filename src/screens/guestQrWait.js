/**
 * QR 게스트 — 소켓 연결·매칭 대기용 최소 화면
 */

/**
 * @param {HTMLElement} root
 */
export function mountGuestQrWait(root) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen guest-qr-wait-screen';

  const title = document.createElement('div');
  title.className = 'app-screen-title';
  title.textContent = 'QR 입장';

  const sub = document.createElement('p');
  sub.className = 'app-muted';
  sub.textContent = '경주 준비를 기다리는 중이에요…';

  wrap.appendChild(title);
  wrap.appendChild(sub);
  root.appendChild(wrap);
}
