/**
 * 오리 선택 전용 — 첫 진입 9마리 중 1마리 확정, 이후에는 보유 오리만 표시·사용 중 변경만
 * 구매는 shop.js
 */

import { DUCKS_NINE } from '../constants.js';
import { patchUserRecord } from '../services/db.js';
import { duckRawUrl } from '../data/duckFaces.js';

// ═══ 데이터 (shop 등에서 재사용) ═══

/** @param {object} state */
export function duckOwned(state, duckId) {
  return Array.isArray(state.ownedDuckIds) && state.ownedDuckIds.includes(duckId);
}

/** 보유 오리 0마리 — 아직 첫 동료 미선택 */
export function isFreeFirstPick(state) {
  return !Array.isArray(state.ownedDuckIds) || state.ownedDuckIds.length === 0;
}

/** @param {{ state: object }} api */
export function setSelectedDuck(api, duckId) {
  api.state.selectedDuckId = duckId;
  const uid = api.state.user?.uid;
  if (uid) patchUserRecord(uid, { selectedDuckId: duckId });
}

/** @param {{ state: object }} api */
export function addOwnedDuck(api, duckId) {
  const set = new Set(api.state.ownedDuckIds || []);
  set.add(duckId);
  const arr = [...set];
  api.state.ownedDuckIds = arr;
  const uid = api.state.user?.uid;
  if (uid) patchUserRecord(uid, { ownedDuckIds: arr });
}

/** @returns {import('../constants.js').DuckDef[]} */
export function ducksShownInSelector(state) {
  // MVP: 10색 모두 자유 선택 (구매 개념 없음)
  return [...DUCKS_NINE];
}

// ═══ 화면 ═══

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountDuckSelect(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen duck-select-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '오리 선택';

  const sub = document.createElement('p');
  sub.className = 'app-muted duck-select-sub';

  const grid = document.createElement('div');
  grid.className = 'duck-select-grid';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.textContent = '로비로 돌아가기';
  back.addEventListener('click', () => api.navigate('lobby'));

  function refreshSub() {
    sub.textContent = '함께 달릴 오리를 골라주세요. 언제든 바꿀 수 있어요!';
  }

  function handleDuckClick(duck) {
    const state = api.state;
    if (state.selectedDuckId === duck.id) return; // 이미 사용 중
    addOwnedDuck(api, duck.id); // 무료 선택 → 보유 처리
    setSelectedDuck(api, duck.id);
    refreshSub();
    renderGrid();
  }

  function renderGrid() {
    grid.replaceChildren();
    refreshSub();

    const list = ducksShownInSelector(api.state);
    for (const duck of list) {
      const isCurrent = api.state.selectedDuckId === duck.id;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'duck-cell';
      if (isCurrent) cell.classList.add('duck-cell--active');
      cell.setAttribute('aria-label', duck.name);

      const circle = document.createElement('img');
      circle.className = 'duck-raw-img';
      circle.src = duckRawUrl(duck.id);
      circle.alt = duck.name;

      const name = document.createElement('div');
      name.className = 'duck-name';
      name.textContent = duck.name;

      const meta = document.createElement('div');
      meta.className = 'duck-meta';
      if (isCurrent) {
        const use = document.createElement('span');
        use.className = 'duck-badge duck-badge--use';
        use.textContent = '✓ 사용 중';
        meta.appendChild(use);
      }

      cell.appendChild(circle);
      cell.appendChild(name);
      cell.appendChild(meta);
      cell.addEventListener('click', () => handleDuckClick(duck));
      grid.appendChild(cell);
    }
  }

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(grid);
  wrap.appendChild(back);
  root.appendChild(wrap);

  renderGrid();
}
