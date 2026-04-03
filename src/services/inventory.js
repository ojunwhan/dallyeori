/**
 * 꾸미기 인벤토리 — localStorage, 오리별 장착(카테고리당 1개)
 */

import { getShopItemById } from '../data/shopItems.js';
import { spend } from './hearts.js';

/** @typedef {{ ownedIds: string[], equipped: Record<string, Record<string, string>> }} InventoryPayload */

/** @param {string} uid */
function storageKey(uid) {
  return `dallyeori.inv.${uid}`;
}

/**
 * @returns {InventoryPayload}
 */
function emptyPayload() {
  return { ownedIds: [], equipped: {} };
}

/**
 * @param {string} uid
 * @returns {InventoryPayload}
 */
export function loadInventory(uid) {
  if (!uid) return emptyPayload();
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return emptyPayload();
    const o = JSON.parse(raw);
    const ownedIds = Array.isArray(o?.ownedIds) ? o.ownedIds.map(String) : [];
    const equipped =
      o?.equipped && typeof o.equipped === 'object' && !Array.isArray(o.equipped) ? o.equipped : {};
    const cleanedEquipped = {};
    for (const duckId of Object.keys(equipped)) {
      const slot = equipped[duckId];
      if (slot && typeof slot === 'object' && !Array.isArray(slot)) {
        cleanedEquipped[duckId] = { ...slot };
      }
    }
    return { ownedIds, equipped: cleanedEquipped };
  } catch {
    return emptyPayload();
  }
}

/**
 * @param {string} uid
 * @param {InventoryPayload} payload
 */
export function saveInventory(uid, payload) {
  if (!uid) return;
  localStorage.setItem(
    storageKey(uid),
    JSON.stringify({
      ownedIds: [...payload.ownedIds],
      equipped: JSON.parse(JSON.stringify(payload.equipped)),
    }),
  );
}

/**
 * @param {string} uid
 * @param {string} itemId
 */
export function ownsItem(uid, itemId) {
  const { ownedIds } = loadInventory(uid);
  return ownedIds.includes(itemId);
}

/**
 * 하트 차감 + 보유 추가
 * @param {{ state: object }} api
 * @param {string} itemId
 * @returns {{ ok: boolean, error?: 'funds' | 'owned' | 'unknown' }}
 */
export function purchaseDecorItem(api, itemId) {
  const uid = api.state.user?.uid;
  if (!uid) return { ok: false, error: 'unknown' };
  const item = getShopItemById(itemId);
  if (!item) return { ok: false, error: 'unknown' };
  const inv = loadInventory(uid);
  if (inv.ownedIds.includes(itemId)) return { ok: false, error: 'owned' };
  if (!spend(api.state, item.price, 'shop_decor', { itemId })) return { ok: false, error: 'funds' };
  inv.ownedIds.push(itemId);
  saveInventory(uid, inv);
  return { ok: true };
}

/**
 * @param {string} uid
 * @param {string} duckId
 * @param {string} itemId
 * @returns {boolean}
 */
export function equipOnDuck(uid, duckId, itemId) {
  if (!uid || !duckId || !itemId) return false;
  const item = getShopItemById(itemId);
  if (!item) return false;
  const inv = loadInventory(uid);
  if (!inv.ownedIds.includes(itemId)) return false;
  if (!inv.equipped[duckId]) inv.equipped[duckId] = {};
  inv.equipped[duckId][item.cat] = itemId;
  saveInventory(uid, inv);
  return true;
}

/**
 * @param {string} uid
 * @param {string} duckId
 * @param {string} cat
 * @returns {boolean}
 */
export function unequipCategory(uid, duckId, cat) {
  if (!uid || !duckId || !cat) return false;
  const inv = loadInventory(uid);
  if (!inv.equipped[duckId]) return false;
  delete inv.equipped[duckId][cat];
  if (Object.keys(inv.equipped[duckId]).length === 0) delete inv.equipped[duckId];
  saveInventory(uid, inv);
  return true;
}

/**
 * @param {string} uid
 * @param {string} duckId
 * @param {string} cat
 * @returns {string | null} itemId
 */
export function getEquippedInCategory(uid, duckId, cat) {
  if (!uid || !duckId || !cat) return null;
  const inv = loadInventory(uid);
  const id = inv.equipped[duckId]?.[cat];
  return id && typeof id === 'string' ? id : null;
}

/**
 * @param {string} uid
 * @param {string} duckId
 * @returns {Record<string, string>}
 */
export function getEquippedForDuck(uid, duckId) {
  if (!uid || !duckId) return {};
  const inv = loadInventory(uid);
  return inv.equipped[duckId] ? { ...inv.equipped[duckId] } : {};
}
