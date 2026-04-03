/**
 * 유저 DB 계약 — Firestore / REST 등으로 교체 시 동일 시그니처 유지
 *
 * @typedef {object} UserRecord
 * @property {string} uid
 * @property {string} nickname
 * @property {string} language
 * @property {string} profilePhotoURL
 * @property {number} wins
 * @property {number} losses
 * @property {number} [draws]
 * @property {number} hearts
 * @property {string | null} selectedDuckId
 * @property {string[]} ownedDuckIds
 * @property {boolean} profileSetupComplete
 * @property {string[]} messageBlockedUserIds — 내가 메시지 수신을 거부한 상대 UID 목록(친구 여부와 무관). Phase 4 메시지에서 발신·수신 필터.
 * @property {'casual'|'formal'} [translateTone] — MONO 채팅 번역 톤 (기본 casual)
 */

/**
 * @typedef {object} IUserDbService
 * @property {(uid: string) => UserRecord | null} getUserRecord
 * @property {(record: UserRecord) => void} saveUserRecord
 * @property {(authUser: { uid: string, email: string, displayName: string, photoURL: string }) => UserRecord} ensureUserFromAuth
 * @property {(uid: string, partial: Partial<UserRecord>) => UserRecord | null} patchUserRecord
 * @property {(state: object, record: UserRecord) => void} applyUserRecordToAppState
 */

export {};
