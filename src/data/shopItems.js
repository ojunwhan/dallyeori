/**
 * 꾸미기템 모킹 데이터 — Phase 3 상점
 * @typedef {{ id: string, cat: 'hat'|'glasses'|'scarf'|'wing'|'tail', name: string, price: number, emoji: string, desc: string }} ShopItem
 */

/** @type {readonly ShopItem[]} */
export const SHOP_ITEMS = Object.freeze([
  { id: 'hat_cap_red', cat: 'hat', name: '빨간 야구모자', price: 10, emoji: '🧢', desc: '기본에 힘을 실은 레드 캡.' },
  { id: 'hat_crown', cat: 'hat', name: '미니 왕관', price: 28, emoji: '👑', desc: '작지만 위엄 있게.' },
  { id: 'hat_flower', cat: 'hat', name: '꽃 투구', price: 14, emoji: '🌸', desc: '봄 느낌 살짝.' },
  { id: 'hat_band', cat: 'hat', name: '헤어밴드', price: 8, emoji: '🎀', desc: '귀여움 UP.' },
  { id: 'gl_sun', cat: 'glasses', name: '선글라스', price: 12, emoji: '🕶️', desc: '터치 한 번에 더 시원하게.' },
  { id: 'gl_mono', cat: 'glasses', name: '둥근 안경', price: 11, emoji: '👓', desc: '지적 룩(오리용).' },
  { id: 'gl_star', cat: 'glasses', name: '별 안경', price: 18, emoji: '✨', desc: '눈이 반짝.' },
  { id: 'gl_heart', cat: 'glasses', name: '하트 글라스', price: 15, emoji: '💕', desc: '하트 듬뿍.' },
  { id: 'sc_warm', cat: 'scarf', name: '따뜻한 머풀러', price: 13, emoji: '🧣', desc: '추운 트랙도 OK.' },
  { id: 'sc_striped', cat: 'scarf', name: '줄무늬 스카프', price: 10, emoji: '🎗️', desc: '클래식 포인트.' },
  { id: 'sc_bow', cat: 'scarf', name: '리본 넥타이', price: 16, emoji: '🎀', desc: '단정한 매너 오리.' },
  { id: 'sc_gold', cat: 'scarf', name: '골드 체인', price: 24, emoji: '⛓️', desc: '럭셔리 질주.' },
  { id: 'wg_ribbon', cat: 'wing', name: '리본 날개', price: 22, emoji: '🎀', desc: '날아갈 듯한 연출.' },
  { id: 'wg_spark', cat: 'wing', name: '스파클 깃털', price: 20, emoji: '✨', desc: '잔광이 따라와요.' },
  { id: 'wg_mini', cat: 'wing', name: '미니 윙 클립', price: 9, emoji: '🪶', desc: '가볍게 장식.' },
  { id: 'wg_bolt', cat: 'wing', name: '번개 핀', price: 26, emoji: '⚡', desc: '스피드 강조.' },
  { id: 'tl_puff', cat: 'tail', name: '포실 꼬리끈', price: 11, emoji: '🎀', desc: '꼬리 율동 강조.' },
  { id: 'tl_ribbon', cat: 'tail', name: '리본 꼬리', price: 17, emoji: '🎀', desc: '뒤에서도 귀여움.' },
  { id: 'tl_star', cat: 'tail', name: '별 꼬리 장식', price: 19, emoji: '⭐', desc: '터치마다 반짝(연출).' },
  { id: 'tail_feather', cat: 'tail', name: '오색 깃털', price: 35, emoji: '🪶', desc: '프리미엄 액센트.' },
]);

/** @type {readonly { id: string, label: string }[]} */
export const SHOP_CATEGORIES = Object.freeze([
  { id: 'hat', label: '모자' },
  { id: 'glasses', label: '안경' },
  { id: 'scarf', label: '목도리' },
  { id: 'wing', label: '날개' },
  { id: 'tail', label: '꼬리' },
]);

/**
 * @param {string} id
 * @returns {ShopItem | undefined}
 */
export function getShopItemById(id) {
  return SHOP_ITEMS.find((x) => x.id === id);
}

/**
 * @param {string} cat
 * @returns {ShopItem[]}
 */
export function itemsInCategory(cat) {
  return SHOP_ITEMS.filter((x) => x.cat === cat);
}
