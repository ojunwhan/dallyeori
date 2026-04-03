/**
 * Auth 계약 — Firebase Auth 등으로 교체 시 동일 시그니처 유지
 *
 * @typedef {object} AuthUser
 * @property {string} uid
 * @property {string} email
 * @property {string} displayName
 * @property {string} photoURL
 */

/**
 * @typedef {object} IAuthService
 * @property {(provider?: string) => Promise<AuthUser>} login
 * @property {() => void} logout
 * @property {() => AuthUser | null} getCurrentUser
 * @property {() => string | null} [getToken] Socket.IO 등에 raw JWT 전달
 */

export {};
