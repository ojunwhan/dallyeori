/**
 * 하트 통화 — appState + UserRecord 동기화, 거래 내역 localStorage(최대 200건)
 */

import { patchUserRecord } from './db.js';
import { isFriend } from './friends.js';

const TX_CAP = 200;
/** @param {string} uid */
function txStorageKey(uid) {
  return `dallyeori.hearts.tx.${uid}`;
}

/**
 * @typedef {{
 *   id: string,
 *   ts: number,
 *   kind: 'earn' | 'spend',
 *   amount: number,
 *   reason: string,
 *   detail?: object
 * }} HeartTransaction
 */

/**
 * @param {string} uid
 * @returns {HeartTransaction[]}
 */
function readTxList(uid) {
  try {
    const raw = localStorage.getItem(txStorageKey(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} uid
 * @param {HeartTransaction[]} list
 */
function writeTxList(uid, list) {
  localStorage.setItem(txStorageKey(uid), JSON.stringify(list));
}

function newTxId() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {string} uid
 * @param {Omit<HeartTransaction, 'id'|'ts'> & { id?: string, ts?: number }} partial
 */
function appendTransaction(uid, partial) {
  const list = readTxList(uid);
  const entry = /** @type {HeartTransaction} */ ({
    id: partial.id ?? newTxId(),
    ts: partial.ts ?? Date.now(),
    kind: partial.kind,
    amount: partial.amount,
    reason: partial.reason,
    ...(partial.detail != null ? { detail: partial.detail } : {}),
  });
  list.unshift(entry);
  writeTxList(uid, list.slice(0, TX_CAP));
}

export const IAP_PACKAGES = Object.freeze({
  pack100: {
    id: 'pack100',
    hearts: 100,
    priceWon: 1200,
    label: '100♥',
    note: '',
  },
  pack300: {
    id: 'pack300',
    hearts: 330,
    priceWon: 3300,
    label: '300♥',
    note: '10% 보너스',
  },
  pack500: {
    id: 'pack500',
    hearts: 500,
    priceWon: 5000,
    label: '500♥',
    note: '인기',
  },
  pack1200: {
    id: 'pack1200',
    hearts: 1200,
    priceWon: 11000,
    label: '1,200♥',
    note: '최고 가성비',
  },
});

/**
 * @param {object} state
 */
export function getBalance(state) {
  return typeof state?.hearts === 'number' && Number.isFinite(state.hearts) ? state.hearts : 0;
}

/** @deprecated 호환용 */
export function getHearts(state) {
  return getBalance(state);
}

/**
 * @param {object} state
 * @param {number} amount
 * @param {string} reason
 * @param {object} [detail]
 * @returns {number} 새 잔고
 */
export function earn(state, amount, reason, detail) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return getBalance(state);
  const next = getBalance(state) + n;
  state.hearts = next;
  const uid = state?.user?.uid;
  if (uid) {
    patchUserRecord(uid, { hearts: next });
    appendTransaction(uid, { kind: 'earn', amount: n, reason, ...(detail ? { detail } : {}) });
  }
  return next;
}

/**
 * @param {object} state
 * @param {number} amount
 * @param {string} reason
 * @param {object} [detail]
 * @returns {boolean}
 */
export function spend(state, amount, reason, detail) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return false;
  if (getBalance(state) < n) return false;
  const next = getBalance(state) - n;
  state.hearts = next;
  const uid = state?.user?.uid;
  if (uid) {
    patchUserRecord(uid, { hearts: next });
    appendTransaction(uid, { kind: 'spend', amount: n, reason, ...(detail ? { detail } : {}) });
  }
  return true;
}

/**
 * 친구에게만 선물 가능 — Phase 4 친구 목록 연동 전에는 실패
 * @param {object} state
 * @param {string} friendId
 * @param {number} amount
 * @returns {{ ok: boolean, error?: string }}
 */
export function giftToFriend(state, friendId, amount) {
  const uid = state?.user?.uid;
  const n = Math.floor(Number(amount));
  if (!friendId || typeof friendId !== 'string') {
    return { ok: false, error: '친구를 선택할 수 없어요.' };
  }
  if (!uid) return { ok: false, error: 'login' };
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'amount' };
  if (!isFriend(uid, friendId)) {
    window.alert('하트는 친구에게만 선물할 수 있어요.');
    return { ok: false, error: 'not_friend' };
  }
  if (!spend(state, n, 'gift_friend', { friendId })) {
    return { ok: false, error: 'funds' };
  }
  return { ok: true };
}

/**
 * @param {object} state
 * @param {boolean} won
 * @returns {number} 이번에 지급된 양
 */
export function rewardForRace(state, won) {
  const n = won ? 3 : 1;
  const reason = won ? 'race_win' : 'race_participate';
  earn(state, n, reason);
  return n;
}

/**
 * @param {object} state
 * @returns {number} 지급량
 */
export function rewardForAd(state) {
  const n = 5;
  earn(state, n, 'ad_reward');
  return n;
}

/**
 * @param {object} state
 * @param {string} iapId
 * @returns {{ ok: boolean, hearts?: number, error?: string }}
 */
export function purchaseIAP(state, iapId) {
  const pack = IAP_PACKAGES[/** @type {keyof typeof IAP_PACKAGES} */ (iapId)];
  if (!pack) return { ok: false, error: 'unknown_iap' };
  earn(state, pack.hearts, 'iap', { iapId: pack.id, krw: pack.priceWon });
  return { ok: true, hearts: pack.hearts };
}

/**
 * @param {object} state
 * @param {number} [limit]
 * @returns {HeartTransaction[]}
 */
export function getTransactions(state, limit = 50) {
  const uid = state?.user?.uid;
  if (!uid) return [];
  const list = readTxList(uid);
  const num = Number(limit);
  const lim = Math.max(1, Math.min(TX_CAP, Number.isFinite(num) && num > 0 ? Math.floor(num) : 50));
  return list.slice(0, lim);
}

/** @deprecated earn 사용 권장 */
export function addHearts(state, n) {
  return earn(state, n, 'legacy');
}

/** @deprecated spend 사용 권장 */
export function spendHearts(state, n) {
  return spend(state, n, 'legacy');
}
