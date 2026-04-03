/**
 * 메시지 — 대화 목록 (Phase 4)
 */

import { getConversationList } from '../services/chat.js';
import { getMockUser } from '../services/mockUsers.js';

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

  function render() {
    list.replaceChildren();
    if (!uid) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '로그인 후 메시지를 이용할 수 있어요.';
      list.appendChild(p);
      return;
    }
    const rows = getConversationList(uid);
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
      cell.addEventListener('click', () => api.navigate('chatRoom', { peerId: row.peerId }));

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
