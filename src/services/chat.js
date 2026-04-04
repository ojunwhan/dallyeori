/**
 * 1:1 채팅 — 친구 아님도 발송 가능, 차단, 대화당 최대 100건
 */

import { getMockUser } from './mockUsers.js';
import { getGameSocket, ensureSocket } from './socket.js';

const MAX_MSG = 100;

/** @param {string} a @param {string} b */
function convStorageKey(a, b) {
  return `dallyeori.chat.conv.${a < b ? `${a}__${b}` : `${b}__${a}`}`;
}

/** @param {string} uid */
function blocksKey(uid) {
  return `dallyeori.chat.blocks.${uid}`;
}

/** @param {string} uid */
function metaKey(uid) {
  return `dallyeori.chat.meta.${uid}`;
}

/** @typedef {{ id: string, fromId: string, toId: string, text: string, ts: number, originalText?: string, translatedText?: string }} ChatMessage */

/** @returns {ChatMessage[]} */
function readConv(a, b) {
  try {
    const raw = localStorage.getItem(convStorageKey(a, b));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** @param {string} a @param {string} b @param {ChatMessage[]} messages */
function writeConv(a, b, messages) {
  localStorage.setItem(convStorageKey(a, b), JSON.stringify(messages.slice(-MAX_MSG)));
}

/** @returns {Record<string, { lastTs: number, preview: string, unread: number }>} */
function readMeta(uid) {
  try {
    const raw = localStorage.getItem(metaKey(uid));
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** @param {string} uid @param {Record<string, { lastTs: number, preview: string, unread: number }>} meta */
function writeMeta(uid, meta) {
  localStorage.setItem(metaKey(uid), JSON.stringify(meta));
}

function bumpMeta(uid, peerId, preview, /** @type {boolean} */ isIncoming) {
  const meta = readMeta(uid);
  const prev = meta[peerId] || { lastTs: 0, preview: '', unread: 0 };
  meta[peerId] = {
    lastTs: Date.now(),
    preview,
    unread: isIncoming ? prev.unread + 1 : prev.unread,
  };
  writeMeta(uid, meta);
}

let receiveChatWindowBound = false;
if (typeof window !== 'undefined' && !receiveChatWindowBound) {
  receiveChatWindowBound = true;
  window.addEventListener('dallyeori-receiveChat', (ev) => {
    const msg = /** @type {CustomEvent} */ (ev).detail;
    console.log('[chat] window receiveChat handler fired:', msg);
    if (!msg || !msg.fromId || !msg.toId || !msg.text) return;
    const myUid = msg.toId;
    const peerId = msg.fromId;
    const arr = readConv(myUid, peerId);
    if (arr.some((m) => m.id === msg.id)) return;
    arr.push(msg);
    writeConv(myUid, peerId, arr);
    bumpMeta(myUid, peerId, msg.translatedText || msg.text, true);
    window.dispatchEvent(new CustomEvent('dallyeori-chat-update', { detail: { peerId } }));
  });
}

/**
 * @param {string} uid
 * @param {string} peerId
 */
export function markConversationRead(uid, peerId) {
  const meta = readMeta(uid);
  if (!meta[peerId]) return;
  meta[peerId] = { ...meta[peerId], unread: 0 };
  writeMeta(uid, meta);
}

/** @returns {string[]} */
function readBlocks(uid) {
  try {
    const raw = localStorage.getItem(blocksKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function writeBlocks(uid, list) {
  localStorage.setItem(blocksKey(uid), JSON.stringify(list));
}

/**
 * 내가 targetId 를 차단했는지 (내 화면에서 입력 막기용)
 * @param {string} uid
 * @param {string} targetId
 */
export function isBlocked(uid, targetId) {
  return readBlocks(uid).includes(targetId);
}

/**
 * @param {string} uid
 * @param {string} targetId
 */
export function blockUser(uid, targetId) {
  const list = readBlocks(uid);
  if (!list.includes(targetId)) {
    list.push(targetId);
    writeBlocks(uid, list);
  }
}

/**
 * @param {string} uid
 * @param {string} targetId
 */
export function unblockUser(uid, targetId) {
  writeBlocks(
    uid,
    readBlocks(uid).filter((x) => x !== targetId),
  );
}

const AUTO_REPLIES = [
  '오늘도 뛰었어!',
  'Nice run 🦆',
  'また対戦しよう',
  'GG!',
  '한판 더?',
  'tap faster next time lol',
  '응원할게~',
  'おつかれ!',
];

function randomInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function newMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const replyTimers = new Map();

/**
 * @param {string} uid
 * @param {string} targetId
 * @param {string} text 원문
 * @param {{ translatedText?: string }} [opts] 번역 ON 시 상대 언어로 번역된 문자열
 */
export function sendMessage(uid, targetId, text, opts) {
  const t = String(text || '').trim();
  if (!uid || !targetId || !t) return { ok: false, error: 'empty' };
  if (isBlocked(uid, targetId)) return { ok: false, error: 'blocked' };
  const tr = opts?.translatedText != null ? String(opts.translatedText).trim().slice(0, 2000) : '';
  const msg = /** @type {ChatMessage} */ ({
    id: newMsgId(),
    fromId: uid,
    toId: targetId,
    text: t.slice(0, 2000),
    originalText: t.slice(0, 2000),
    translatedText: tr || undefined,
    ts: Date.now(),
  });
  const arr = readConv(uid, targetId);
  arr.push(msg);
  writeConv(uid, targetId, arr);
  bumpMeta(uid, targetId, t, false);
  bumpMeta(targetId, uid, tr || t, true);

  // ── 소켓 전송 시도 ──
  let sock = getGameSocket();
  if (!sock || !sock.connected) {
    ensureSocket();
    sock = getGameSocket();
  }
  const socketSent = !!(sock && sock.connected);
  if (socketSent) {
    sock.emit('sendChat', {
      toUid: targetId,
      text: msg.text,
      translatedText: msg.translatedText,
    });
  }

  // 완전 오프라인(소켓 인스턴스 없음)일 때만 모킹 자동응답
  if (!socketSent && !sock) {
    const timerKey = `${uid}::${targetId}`;
    const old = replyTimers.get(timerKey);
    if (old) clearTimeout(old);
    const delay = randomInt(1000, 3000);
    const tid = window.setTimeout(() => {
      replyTimers.delete(timerKey);
      const replyText = AUTO_REPLIES[randomInt(0, AUTO_REPLIES.length - 1)];
      const reply = /** @type {ChatMessage} */ ({
        id: newMsgId(),
        fromId: targetId,
        toId: uid,
        text: replyText,
        ts: Date.now(),
      });
      const arr2 = readConv(uid, targetId);
      arr2.push(reply);
      writeConv(uid, targetId, arr2);
      bumpMeta(uid, targetId, replyText, true);
      bumpMeta(targetId, uid, replyText, false);
      window.dispatchEvent(new CustomEvent('dallyeori-chat-update', { detail: { peerId: targetId } }));
    }, delay);
    replyTimers.set(timerKey, tid);
  }

  return { ok: true };
}

/** socket.js 가 receiveChat → window 로 중계; 호환용 noop */
export function setupChatSocketListener() {}

/**
 * @param {string | undefined | null} uid
 */
export function getTotalUnreadCount(uid) {
  if (!uid) return 0;
  const meta = readMeta(uid);
  let total = 0;
  for (const key of Object.keys(meta)) {
    total += meta[key].unread || 0;
  }
  return total;
}

/**
 * @param {string} uid
 * @param {string} targetId
 * @returns {ChatMessage[]}
 */
export function getConversation(uid, targetId) {
  if (!uid || !targetId) return [];
  return readConv(uid, targetId);
}

/**
 * @param {string} uid
 */
export function getConversationList(uid) {
  if (!uid) return [];
  const meta = readMeta(uid);
  return Object.entries(meta)
    .map(([peerId, m]) => {
      const u = getMockUser(peerId);
      return {
        peerId,
        lastTs: m.lastTs,
        preview: m.preview,
        unread: m.unread,
        nickname: u?.nickname ?? peerId,
        profilePhotoURL: u?.profilePhotoURL ?? '',
        duckId: u?.duckId ?? null,
      };
    })
    .filter((x) => x.lastTs > 0)
    .sort((a, b) => b.lastTs - a.lastTs);
}
