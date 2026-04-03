/**
 * 더미 유저 풀 — 검색·매칭·채팅 자동응답 등 공유
 * @typedef {{ id: string, nickname: string, duckId: string, language: string, profilePhotoURL: string }} MockUser
 */

/** @type {readonly MockUser[]} */
export const MOCK_USERS = Object.freeze([
  { id: 'mock-yuki', nickname: 'ゆき', duckId: 'nuri', language: 'ja', profilePhotoURL: '' },
  { id: 'mock-duckmaster', nickname: 'DuckMaster', duckId: 'bori', language: 'en', profilePhotoURL: '' },
  { id: 'mock-oriking', nickname: '오리킹', duckId: 'tori', language: 'ko', profilePhotoURL: '' },
  { id: 'mock-quackjp', nickname: 'quack_jp', duckId: 'yuri', language: 'ja', profilePhotoURL: '' },
  { id: 'mock-ahiru', nickname: 'アヒル', duckId: 'mari', language: 'ja', profilePhotoURL: '' },
  { id: 'mock-runnerkim', nickname: 'RunnerKim', duckId: 'sori', language: 'ko', profilePhotoURL: '' },
  { id: 'mock-hanriver', nickname: '한강러버', duckId: 'nari', language: 'ko', profilePhotoURL: '' },
  { id: 'mock-tabstar', nickname: 'Tab☆Star', duckId: 'duri', language: 'ko', profilePhotoURL: '' },
  { id: 'mock-pato', nickname: 'Pato_BR', duckId: 'ari', language: 'pt', profilePhotoURL: '' },
  { id: 'mock-canard', nickname: 'canard_SN', duckId: 'bori', language: 'fr', profilePhotoURL: '' },
  { id: 'mock-mizuiro', nickname: 'みずいろ', duckId: 'nuri', language: 'ja', profilePhotoURL: '' },
  { id: 'mock-speedy', nickname: 'SpeedyQuack', duckId: 'tori', language: 'en', profilePhotoURL: '' },
  { id: 'mock-anatra', nickname: 'anatra_IT', duckId: 'mari', language: 'it', profilePhotoURL: '' },
  { id: 'mock-cloud', nickname: '구름위러너', duckId: 'ari', language: 'ko', profilePhotoURL: '' },
  { id: 'mock-neo', nickname: 'NeoDuck#07', duckId: 'yuri', language: 'ko', profilePhotoURL: '' },
]);

/**
 * @param {string} id
 * @returns {MockUser | null}
 */
export function getMockUser(id) {
  return MOCK_USERS.find((u) => u.id === id) ?? null;
}

/**
 * @param {string} query
 * @param {string} [excludeId] 현재 유저 UID 제외
 * @returns {MockUser[]}
 */
export function searchMockUsersByNickname(query, excludeId) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MOCK_USERS.filter(
    (u) => u.id !== excludeId && (u.nickname.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)),
  );
}

/**
 * @param {string} [excludeId]
 * @returns {MockUser}
 */
export function getRandomMockUser(excludeId) {
  const pool = excludeId ? MOCK_USERS.filter((u) => u.id !== excludeId) : [...MOCK_USERS];
  if (pool.length === 0) return MOCK_USERS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 친구 요청 보내면 3~5초 뒤 자동 거절(모킹 성향) */
export const AUTO_REJECT_MOCK_IDS = Object.freeze(
  new Set(['mock-oriking', 'mock-quackjp', 'mock-tabstar']),
);

/**
 * @param {string} targetId
 */
export function shouldAutoRejectFriendRequest(targetId) {
  return AUTO_REJECT_MOCK_IDS.has(targetId);
}
