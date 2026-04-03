/**
 * 메시지 — 대화 목록 (Phase 4)
 */

import { getConversationList } from '../services/chat.js';
import { getMockUser } from '../services/mockUsers.js';

const HIDDEN_CHATS_KEY = 'dallyeori-hidden-chats';

/** @returns {Record<string, string[]>} */
function readHiddenChatsMap() {
  try {
    const raw = localStorage.getItem(HIDDEN_CHATS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) return /** @type {Record<string, string[]>} */ (o);
    return {};
  } catch {
    return {};
  }
}

/** @param {string} myUid */
function getHiddenPeerIds(myUid) {
  if (!myUid) return new Set();
  const m = readHiddenChatsMap();
  const arr = m[myUid];
  return new Set(Array.isArray(arr) ? arr.map(String) : []);
}

/** @param {string} myUid @param {string} peerId */
function addHiddenPeer(myUid, peerId) {
  const m = readHiddenChatsMap();
  const set = getHiddenPeerIds(myUid);
  set.add(String(peerId));
  m[myUid] = [...set];
  localStorage.setItem(HIDDEN_CHATS_KEY, JSON.stringify(m));
}

/**
 * @param {HTMLElement} el
 * @param {{ onShortClick: () => void, onLongPress: () => void }} handlers
 */
function attachLongPress(el, { onShortClick, onLongPress }) {
  const THRESHOLD_MS = 700;
  const MOVE_PX = 12;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let longFired = false;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onStart = (clientX, clientY) => {
    longFired = false;
    startX = clientX;
    startY = clientY;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      longFired = true;
      onLongPress();
    }, THRESHOLD_MS);
  };

  const onMove = (clientX, clientY) => {
    if (timer == null) return;
    if (Math.abs(clientX - startX) > MOVE_PX || Math.abs(clientY - startY) > MOVE_PX) {
      clearTimer();
    }
  };

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length < 1) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  el.addEventListener('touchend', clearTimer);
  el.addEventListener('touchcancel', clearTimer);

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY);
    const mm = (ev) => onMove(ev.clientX, ev.clientY);
    const mu = () => {
      clearTimer();
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu, { once: true });
  });

  el.addEventListener('click', (e) => {
    if (longFired) {
      e.preventDefault();
      e.stopPropagation();
      longFired = false;
      return;
    }
    onShortClick();
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountMessages(root, api) {
  const uid = api.state.user?.uid;

  const wrap = document.createElement('div');
  wrap.className = 'app-screen messages-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '메시지';

  const list = document.createElement('div');
  list.className = 'messages-list';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '12px';
  back.textContent = '로비';
  back.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(list);
  wrap.appendChild(back);
  root.appendChild(wrap);

  function showDeleteModal(peerId) {
    const overlay = document.createElement('div');
    overlay.className = 'messages-delete-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

    const modal = document.createElement('div');
    modal.className = 'messages-delete-modal app-box';
    modal.style.cssText =
      'width:100%;max-width:320px;padding:20px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;';

    const q = document.createElement('p');
    q.textContent = '이 대화를 삭제할까요?';
    q.style.cssText = 'margin:0 0 4px;text-align:center;font-size:1rem;';

    function close() {
      overlay.remove();
    }

    const btnMe = document.createElement('button');
    btnMe.type = 'button';
    btnMe.className = 'app-btn';
    btnMe.style.width = '100%';
    btnMe.textContent = '나에게서 삭제';
    btnMe.addEventListener('click', () => {
      if (uid) addHiddenPeer(uid, peerId);
      close();
      render();
    });

    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.className = 'app-btn';
    btnAll.style.width = '100%';
    btnAll.textContent = '모두 삭제';
    btnAll.addEventListener('click', () => {
      // TODO: 서버 API 연동 필요 — 현재는 나에게서 삭제와 동일
      if (uid) addHiddenPeer(uid, peerId);
      close();
      render();
    });

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'app-btn';
    btnCancel.style.width = '100%';
    btnCancel.textContent = '취소';
    btnCancel.addEventListener('click', close);

    modal.appendChild(q);
    modal.appendChild(btnMe);
    modal.appendChild(btnAll);
    modal.appendChild(btnCancel);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function render() {
    list.replaceChildren();
    if (!uid) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '로그인 후 메시지를 이용할 수 있어요.';
      list.appendChild(p);
      return;
    }
    const hidden = getHiddenPeerIds(uid);
    const rows = getConversationList(uid).filter((r) => !hidden.has(String(r.peerId)));
    if (rows.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '대화가 없어요. 결과 화면 등에서 메시지를 보내 보세요.';
      list.appendChild(p);
      return;
    }
    for (const row of rows) {
      const u = getMockUser(row.peerId);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'messages-row app-box';

      attachLongPress(cell, {
        onShortClick: () => api.navigate('chatRoom', { peerId: row.peerId }),
        onLongPress: () => showDeleteModal(row.peerId),
      });

      const av = document.createElement('div');
      av.className = 'messages-av';
      av.textContent = (u?.nickname ?? row.peerId).slice(0, 1);

      const mid = document.createElement('div');
      mid.className = 'messages-mid';
      const top = document.createElement('div');
      top.className = 'messages-peer-line';
      const nn = document.createElement('span');
      nn.className = 'messages-nick';
      nn.textContent = u?.nickname ?? row.peerId;
      top.appendChild(nn);
      if (row.unread > 0) {
        const ub = document.createElement('span');
        ub.className = 'messages-unread';
        ub.textContent = String(row.unread);
        top.appendChild(ub);
      }
      const prev = document.createElement('div');
      prev.className = 'messages-preview app-muted';
      prev.textContent = row.preview || '—';
      const time = document.createElement('div');
      time.className = 'messages-time app-muted';
      time.textContent = new Date(row.lastTs).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      mid.appendChild(top);
      mid.appendChild(prev);
      mid.appendChild(time);

      cell.appendChild(av);
      cell.appendChild(mid);
      list.appendChild(cell);
    }
  }

  render();
}
