/** Twemoji 14 SVG (리전 플래그 이모지) */
const TWEMOJI_SVG_BASE =
  'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

const REGIONAL_A = 0x1f1e6;
const REGIONAL_Z = 0x1f1ff;

/**
 * ISO 3166-1 alpha-2 (예: KR) → 리전 인디케이터 이모지 🇰🇷
 * @param {string} countryCode
 */
export function alpha2ToRegionalFlag(countryCode) {
  const s = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(s)) return '';
  const a = s.codePointAt(0) - 0x41 + REGIONAL_A;
  const b = s.codePointAt(1) - 0x41 + REGIONAL_A;
  if (a < REGIONAL_A || a > REGIONAL_Z || b < REGIONAL_A || b > REGIONAL_Z) return '';
  return String.fromCodePoint(a, b);
}

/**
 * 리전 플래그 이모지(2글자) → Twemoji SVG URL
 * @param {string} emoji
 * @returns {string | null}
 */
export function flagToTwemojiUrl(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const chars = [...emoji];
  if (chars.length !== 2) return null;
  const pts = chars.map((ch) => ch.codePointAt(0));
  if (!pts.every((cp) => cp >= REGIONAL_A && cp <= REGIONAL_Z)) return null;
  const hex = pts.map((cp) => cp.toString(16)).join('-');
  return `${TWEMOJI_SVG_BASE}/${hex}.svg`;
}

/**
 * 이모지에서 리전 쌍 → alpha-2 (Twemoji/flagcdn용)
 * @param {string} emoji
 * @returns {string | null}
 */
export function regionalEmojiToAlpha2(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const pts = [...emoji].map((ch) => ch.codePointAt(0));
  if (pts.length !== 2) return null;
  if (!pts.every((cp) => cp >= REGIONAL_A && cp <= REGIONAL_Z)) return null;
  return (
    String.fromCodePoint(pts[0] - REGIONAL_A + 65) +
    String.fromCodePoint(pts[1] - REGIONAL_A + 65)
  );
}

/**
 * Twemoji 우선, 실패 시 flagcdn (fallbackCountryCode는 소문자 alpha-2)
 * @param {string} emoji
 * @param {string | null | undefined} fallbackCountryCode
 * @returns {string | null}
 */
export function flagToDisplayUrl(emoji, fallbackCountryCode) {
  const tw = flagToTwemojiUrl(emoji);
  if (tw) return tw;
  const fromEmoji = regionalEmojiToAlpha2(emoji);
  const raw = (fromEmoji || fallbackCountryCode || '').toString().trim().toLowerCase();
  if (/^[a-z]{2}$/.test(raw)) {
    return `https://flagcdn.com/w40/${raw}.png`;
  }
  return null;
}
