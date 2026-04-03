/**
 * 모킹 유저 DB (localStorage) — {@link ./interfaces/db.contract.js IUserDbService}
 */

/** @typedef {import('./interfaces/db.contract.js').UserRecord} UserRecord */
/** @typedef {import('./interfaces/auth.contract.js').AuthUser} AuthUser */

const USERS_KEY = 'dallyeori.db.users';

/** @returns {Record<string, UserRecord>} */
function readAll() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeAll(/** @type {Record<string, UserRecord>} */ map) {
  localStorage.setItem(USERS_KEY, JSON.stringify(map));
}

/**
 * @param {string} uid
 * @returns {UserRecord | null}
 */
/**
 * @param {import('./interfaces/db.contract.js').UserRecord} r
 * @returns {import('./interfaces/db.contract.js').UserRecord}
 */
function migrateOwnedDucks(r) {
  let owned = Array.isArray(r.ownedDuckIds) ? [...r.ownedDuckIds] : [];
  let changed = !Array.isArray(r.ownedDuckIds);
  if (r.selectedDuckId && !owned.includes(r.selectedDuckId)) {
    owned.push(r.selectedDuckId);
    changed = true;
  }
  if (!changed) return r;
  const next = { ...r, ownedDuckIds: owned };
  saveUserRecord(next);
  return next;
}

/**
 * 메시지 차단 목록(수신 거부 UID) — 구 기록에는 없을 수 있음
 * @param {import('./interfaces/db.contract.js').UserRecord} r
 */
function migrateMessageBlockedUserIds(r) {
  if (Array.isArray(r.messageBlockedUserIds)) return r;
  const next = { ...r, messageBlockedUserIds: [] };
  saveUserRecord(next);
  return next;
}

/**
 * @param {import('./interfaces/db.contract.js').UserRecord} r
 */
function migrateTranslateTone(r) {
  if (r.translateTone === 'casual' || r.translateTone === 'formal') return r;
  const next = { ...r, translateTone: 'casual' };
  saveUserRecord(next);
  return next;
}

export function getUserRecord(uid) {
  const map = readAll();
  const r = map[uid];
  if (!r || typeof r !== 'object') return null;
  return migrateTranslateTone(migrateMessageBlockedUserIds(migrateOwnedDucks(r)));
}

/**
 * @param {UserRecord} record
 */
export function saveUserRecord(record) {
  const map = readAll();
  map[record.uid] = { ...record };
  writeAll(map);
}

/**
 * @param {AuthUser} authUser
 * @returns {UserRecord}
 */
export function ensureUserFromAuth(authUser) {
  const existing = getUserRecord(authUser.uid);
  if (existing) return existing;

  const record = /** @type {UserRecord} */ ({
    uid: authUser.uid,
    nickname: authUser.displayName || '플레이어',
    language: 'ko',
    profilePhotoURL: authUser.photoURL || '',
    wins: 0,
    losses: 0,
    draws: 0,
    hearts: 30,
    selectedDuckId: null,
    ownedDuckIds: [],
    profileSetupComplete: false,
    messageBlockedUserIds: [],
    translateTone: 'casual',
  });
  saveUserRecord(record);
  return record;
}

/**
 * @param {string} uid
 * @param {Partial<UserRecord>} partial
 * @returns {UserRecord | null}
 */
export function patchUserRecord(uid, partial) {
  const cur = getUserRecord(uid);
  if (!cur) return null;
  const next = { ...cur, ...partial, uid };
  if ('ownedDuckIds' in partial && Array.isArray(partial.ownedDuckIds)) {
    next.ownedDuckIds = [...partial.ownedDuckIds];
  }
  if ('messageBlockedUserIds' in partial && Array.isArray(partial.messageBlockedUserIds)) {
    next.messageBlockedUserIds = [...partial.messageBlockedUserIds];
  }
  saveUserRecord(next);
  return next;
}

/**
 * @param {object} state
 * @param {UserRecord} record
 */
export function applyUserRecordToAppState(state, record) {
  state.nickname = record.nickname;
  state.language = record.language;
  state.profilePhotoURL = record.profilePhotoURL;
  state.hearts = record.hearts;
  state.selectedDuckId = record.selectedDuckId;
  state.ownedDuckIds = Array.isArray(record.ownedDuckIds) ? [...record.ownedDuckIds] : [];
  state.profileSetupComplete = record.profileSetupComplete;
  state.wins = record.wins;
  state.losses = record.losses;
  state.draws = record.draws ?? 0;
  state.translateTone = record.translateTone === 'formal' ? 'formal' : 'casual';
}

/**
 * @type {import('./interfaces/db.contract.js').IUserDbService}
 */
export const userDbService = {
  getUserRecord,
  saveUserRecord,
  ensureUserFromAuth,
  patchUserRecord,
  applyUserRecordToAppState,
};

/** @deprecated ensureUserFromAuth + getUserRecord 사용 */
export async function getUserProfile(uid) {
  const r = getUserRecord(uid);
  if (!r) return null;
  return {
    wins: r.wins,
    losses: r.losses,
    duckId: r.selectedDuckId ?? 'ari',
  };
}

/** @deprecated patchUserRecord 사용 */
export async function saveUserProfile(uid, data) {
  if (!data || typeof data !== 'object') return false;
  const cur = getUserRecord(uid);
  if (!cur) return false;
  /** @type {Partial<UserRecord>} */
  const partial = {};
  if ('wins' in data) partial.wins = Number(data.wins);
  if ('losses' in data) partial.losses = Number(data.losses);
  if ('duckId' in data) partial.selectedDuckId = data.duckId;
  patchUserRecord(uid, partial);
  return true;
}
