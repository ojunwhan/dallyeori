/**
 * 1:1 채팅 방
 */

import {
  blockUser,
  getConversation,
  isBlocked,
  markConversationRead,
  sendMessage,
  setupChatSocketListener,
  unblockUser,
} from '../services/chat.js';
import { showAppToast } from '../services/toast.js';
import { getMockUser } from '../services/mockUsers.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountChatRoom(root, api) {
  const uid = api.state.user?.uid;
  const peerId = api.state._chatPeerId || '';

  const wrap = document.createElement('div');
  wrap.className = 'app-screen chat-room-screen';

  if (!uid || !peerId) {
    const p = document.createElement('p');
    p.className = 'app-muted';
    p.textContent = '대화 상대를 찾을 수 없어요.';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'app-btn';
    back.textContent = '목록으로';
    back.addEventListener('click', () => api.navigate('messages'));
    wrap.appendChild(p);
    wrap.appendChild(back);
    root.appendChild(wrap);
    return;
  }

  setupChatSocketListener();

  const peer = getMockUser(peerId);
  const peerNick = peer?.nickname ?? peerId;

  markConversationRead(uid, peerId);

  const header = document.createElement('div');
  header.className = 'chat-header app-box';

  const headRow = document.createElement('div');
  headRow.className = 'chat-header-row';

  const av = document.createElement('div');
  av.className = 'chat-header-av';
  av.textContent = peerNick.slice(0, 1);

  const names = document.createElement('div');
  names.className = 'chat-header-names';
  const hTitle = document.createElement('div');
  hTitle.className = 'chat-header-title';
  hTitle.textContent = peerNick;
  names.appendChild(hTitle);

  const tools = document.createElement('div');
  tools.className = 'chat-header-tools';

  const btnBlock = document.createElement('button');
  btnBlock.type = 'button';
  btnBlock.className = 'app-btn app-btn--inline chat-tool-btn';
  btnBlock.textContent = isBlocked(uid, peerId) ? '차단 해제' : '차단';
  btnBlock.addEventListener('click', () => {
    if (isBlocked(uid, peerId)) {
      unblockUser(uid, peerId);
      showAppToast('차단을 해제했어요.');
    } else {
      if (window.confirm('이 상대를 차단할까요?')) {
        blockUser(uid, peerId);
        showAppToast('차단했어요.');
      }
    }
    syncBlockUi();
  });

  tools.appendChild(btnBlock);

  headRow.appendChild(av);
  headRow.appendChild(names);
  headRow.appendChild(tools);
  header.appendChild(headRow);

  const scroll = document.createElement('div');
  scroll.className = 'chat-scroll';

  const blockedBanner = document.createElement('div');
  blockedBanner.className = 'chat-blocked-banner';
  blockedBanner.hidden = true;
  blockedBanner.textContent = '차단한 유저입니다. 메시지를 보낼 수 없어요.';

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const btnVoice = document.createElement('button');
  btnVoice.type = 'button';
  btnVoice.className = 'chat-voice-btn';
  btnVoice.setAttribute('aria-label', '음성 메시지');
  btnVoice.textContent = '🎙';
  btnVoice.addEventListener('click', () => showAppToast('음성 메시지 준비 중'));

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'app-input chat-input';
  inp.placeholder = '메시지 입력';

  const btnSend = document.createElement('button');
  btnSend.type = 'button';
  btnSend.className = 'app-btn app-btn--primary';
  btnSend.textContent = '전송';

  inputRow.appendChild(btnVoice);
  inputRow.appendChild(inp);
  inputRow.appendChild(btnSend);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '8px';
  back.textContent = '← 목록';
  back.addEventListener('click', () => api.navigate('messages'));

  wrap.appendChild(header);
  wrap.appendChild(scroll);
  wrap.appendChild(blockedBanner);
  wrap.appendChild(inputRow);
  wrap.appendChild(back);
  root.appendChild(wrap);

  function syncBlockUi() {
    const blocked = isBlocked(uid, peerId);
    blockedBanner.hidden = !blocked;
    inp.disabled = blocked;
    btnSend.disabled = blocked;
  }

  function scrollBottom() {
    scroll.scrollTop = scroll.scrollHeight;
  }

  const bubbleBaseStyle =
    'min-width:48px;max-width:75%;word-break:keep-all;box-sizing:border-box;';

  function renderMsgs() {
    scroll.replaceChildren();
    const msgs = getConversation(uid, peerId);
    for (const m of msgs) {
      const row = document.createElement('div');
      row.className = 'chat-msg-row ' + (m.fromId === uid ? 'chat-msg--mine' : 'chat-msg--theirs');
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.style.cssText = bubbleBaseStyle;
      const original = m.originalText != null ? m.originalText : m.text;

      if (m.translatedText) {
        let showingOriginal = false;
        bubble.textContent = m.translatedText;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'chat-bubble-toggle app-muted';
        toggle.textContent = '(원문 보기)';
        toggle.style.cssText =
          'display:block;width:100%;margin-top:4px;padding:0;border:none;background:none;font:inherit;font-size:11px;color:#888;cursor:pointer;text-align:inherit;touch-action:manipulation;';
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          showingOriginal = !showingOriginal;
          bubble.textContent = showingOriginal ? original : m.translatedText;
          toggle.textContent = showingOriginal ? '(번역 보기)' : '(원문 보기)';
        });
        const wrap = document.createElement('div');
        wrap.className = 'chat-msg-bubble-stack';
        wrap.appendChild(bubble);
        wrap.appendChild(toggle);
        row.appendChild(wrap);
      } else {
        bubble.textContent = original;
        row.appendChild(bubble);
      }

      const meta = document.createElement('div');
      meta.className = 'chat-msg-meta';
      meta.textContent = new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      row.appendChild(meta);
      scroll.appendChild(row);
    }
    scrollBottom();
  }

  function trySend() {
    const t = inp.value.trim();
    if (!t) return;
    if (inp.disabled) return;
    btnSend.disabled = true;
    inp.disabled = true;
    try {
      const r = sendMessage(uid, peerId, t);
      if (!r.ok) {
        showAppToast(r.error === 'blocked' ? '차단 상태에서는 보낼 수 없어요.' : '전송 실패');
        return;
      }
      inp.value = '';
      renderMsgs();
    } finally {
      btnSend.disabled = false;
      syncBlockUi();
    }
  }

  btnSend.addEventListener('click', () => {
    trySend();
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySend();
  });

  syncBlockUi();
  renderMsgs();

  function onChatUpdate(/** @type {CustomEvent} */ ev) {
    if (ev.detail?.peerId === peerId) {
      markConversationRead(uid, peerId);
      renderMsgs();
    }
  }
  window.addEventListener('dallyeori-chat-update', /** @type {any} */ (onChatUpdate));
}
