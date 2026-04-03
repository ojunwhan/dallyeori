/**
 * 상점 — 오리 · 꾸미기(탭/그리드/모달) · 하트 충전 · 광고
 */

import { DUCKS_NINE } from '../constants.js';
import { SHOP_CATEGORIES, SHOP_ITEMS, getShopItemById } from '../data/shopItems.js';
import { getBalance, rewardForAd, spend } from '../services/hearts.js';
import {
  equipOnDuck,
  getEquippedForDuck,
  ownsItem,
  purchaseDecorItem,
  unequipCategory,
} from '../services/inventory.js';
import { addOwnedDuck, duckOwned } from './duckSelect.js';

const AD_WAIT_MS = 1500;

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountShop(root, api) {
  const uid = api.state.user?.uid ?? '';
  const wrap = document.createElement('div');
  wrap.className = 'app-screen shop-screen';

  const title = document.createElement('h1');
  title.className = 'app-title shop-title-accent';
  title.textContent = '상점';

  const balanceEl = document.createElement('div');
  balanceEl.className = 'app-box shop-balance';
  balanceEl.setAttribute('aria-live', 'polite');

  const actionsRow = document.createElement('div');
  actionsRow.className = 'shop-actions-row';

  const btnCharge = document.createElement('button');
  btnCharge.type = 'button';
  btnCharge.className = 'app-btn shop-btn-gold';
  btnCharge.textContent = '♥ 하트 충전';

  const btnAd = document.createElement('button');
  btnAd.type = 'button';
  btnAd.className = 'app-btn shop-btn-orange';
  btnAd.textContent = '광고 시청 (+5♥)';

  actionsRow.appendChild(btnCharge);
  actionsRow.appendChild(btnAd);

  btnCharge.addEventListener('click', () => api.navigate('heartShop'));

  btnAd.addEventListener('click', () => {
    btnAd.disabled = true;
    const t = btnAd.textContent;
    btnAd.textContent = '시청 중…';
    window.setTimeout(() => {
      rewardForAd(api.state);
      refreshBalance();
      btnAd.textContent = t;
      btnAd.disabled = false;
      window.alert('+5♥ 지급되었습니다.');
    }, AD_WAIT_MS);
  });

  const preview = document.createElement('div');
  preview.className = 'app-box shop-preview';

  const previewLabel = document.createElement('div');
  previewLabel.className = 'shop-preview-label app-muted';
  previewLabel.textContent = '선택 오리 · 장착 미리보기';

  const previewRow = document.createElement('div');
  previewRow.className = 'shop-preview-row';

  preview.appendChild(previewLabel);
  preview.appendChild(previewRow);

  const tabRow = document.createElement('div');
  tabRow.className = 'shop-cat-tabs';
  /** @type {{ id: string, btn: HTMLButtonElement }[]} */
  const tabButtons = [];

  const duckTab = document.createElement('button');
  duckTab.type = 'button';
  duckTab.className = 'shop-cat-tab is-active';
  duckTab.textContent = '오리';
  duckTab.dataset.panel = 'ducks';
  tabRow.appendChild(duckTab);
  tabButtons.push({ id: 'ducks', btn: duckTab });

  for (const c of SHOP_CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shop-cat-tab';
    b.textContent = c.label;
    b.dataset.panel = c.id;
    tabRow.appendChild(b);
    tabButtons.push({ id: c.id, btn: b });
  }

  const gridWrap = document.createElement('div');
  gridWrap.className = 'shop-grid-wrap';

  const grid = document.createElement('div');
  grid.className = 'shop-item-grid';
  gridWrap.appendChild(grid);

  const modal = document.createElement('div');
  modal.className = 'shop-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const modalInner = document.createElement('div');
  modalInner.className = 'shop-modal-inner app-box';
  const modalTitle = document.createElement('div');
  modalTitle.className = 'shop-modal-title';
  const modalEmoji = document.createElement('div');
  modalEmoji.className = 'shop-modal-emoji';
  const modalDesc = document.createElement('div');
  modalDesc.className = 'shop-modal-desc app-muted';
  const modalPrice = document.createElement('div');
  modalPrice.className = 'shop-modal-price shop-price-accent';
  const modalActions = document.createElement('div');
  modalActions.className = 'shop-modal-actions';
  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'app-btn';
  btnClose.textContent = '닫기';

  modalInner.appendChild(modalTitle);
  modalInner.appendChild(modalEmoji);
  modalInner.appendChild(modalDesc);
  modalInner.appendChild(modalPrice);
  modalInner.appendChild(modalActions);
  modalInner.appendChild(btnClose);
  modal.appendChild(modalInner);
  btnClose.addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '12px';
  back.textContent = '로비로 돌아가기';
  back.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(balanceEl);
  wrap.appendChild(actionsRow);
  wrap.appendChild(preview);
  wrap.appendChild(tabRow);
  wrap.appendChild(gridWrap);
  wrap.appendChild(modal);
  wrap.appendChild(back);
  root.appendChild(wrap);

  let activePanel = 'ducks';

  function refreshBalance() {
    balanceEl.textContent = `보유 ♥ ${getBalance(api.state)}`;
  }

  function duckBySel() {
    const id = api.state.selectedDuckId;
    return id ? DUCKS_NINE.find((d) => d.id === id) ?? null : null;
  }

  function renderPreview() {
    previewRow.replaceChildren();
    const d = duckBySel();
    const circle = document.createElement('div');
    circle.className = 'duck-circle shop-preview-duck';
    if (d) {
      circle.style.backgroundColor = d.color;
      if (d.id === 'duri') circle.classList.add('duck-circle--dark');
      if (d.id === 'ari') circle.classList.add('duck-circle--light');
    } else {
      circle.classList.add('shop-preview-duck--empty');
    }
    previewRow.appendChild(circle);

    const decoRow = document.createElement('div');
    decoRow.className = 'shop-preview-decos';
    const duckId = api.state.selectedDuckId;
    if (uid && duckId) {
      const eq = getEquippedForDuck(uid, duckId);
      for (const itemId of Object.values(eq)) {
        const it = getShopItemById(itemId);
        if (!it) continue;
        const s = document.createElement('span');
        s.className = 'shop-preview-emoji';
        s.textContent = it.emoji;
        s.title = it.name;
        decoRow.appendChild(s);
      }
    }
    if (decoRow.childNodes.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'app-muted';
      hint.textContent = d ? '장착한 아이템이 없어요' : '오리를 선택해 주세요';
      decoRow.appendChild(hint);
    }
    previewRow.appendChild(decoRow);
  }

  function openModalDecor(itemId) {
    const item = getShopItemById(itemId);
    if (!item) return;
    const owned = uid ? ownsItem(uid, itemId) : false;
    const duckId = api.state.selectedDuckId;
    const equipped =
      uid && duckId ? getEquippedForDuck(uid, duckId)[item.cat] === itemId : false;

    modalTitle.textContent = item.name;
    modalEmoji.textContent = item.emoji;
    modalDesc.textContent = item.desc;
    modalPrice.textContent = owned ? '보유 중' : `♥ ${item.price}`;

    modalActions.replaceChildren();

    if (!owned) {
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'app-btn app-btn--primary';
      buy.textContent = '구매';
      buy.disabled = !uid || getBalance(api.state) < item.price;
      buy.addEventListener('click', () => {
        const r = purchaseDecorItem(api, itemId);
        if (r.ok) {
          refreshBalance();
          renderPreview();
          openModalDecor(itemId);
          renderGrid();
        } else if (r.error === 'funds') window.alert('하트가 부족합니다.');
        else if (r.error === 'owned') openModalDecor(itemId);
      });
      modalActions.appendChild(buy);
    }
    if (owned && duckId) {
      if (!equipped) {
        const eq = document.createElement('button');
        eq.type = 'button';
        eq.className = 'app-btn shop-btn-gold';
        eq.textContent = '장착';
        eq.addEventListener('click', () => {
          if (equipOnDuck(uid, duckId, itemId)) {
            renderPreview();
            openModalDecor(itemId);
            renderGrid();
          }
        });
        modalActions.appendChild(eq);
      } else {
        const uq = document.createElement('button');
        uq.type = 'button';
        uq.className = 'app-btn';
        uq.textContent = '해제';
        uq.addEventListener('click', () => {
          unequipCategory(uid, duckId, item.cat);
          renderPreview();
          openModalDecor(itemId);
          renderGrid();
        });
        modalActions.appendChild(uq);
      }
    } else if (owned && !duckId) {
      const hint = document.createElement('div');
      hint.className = 'app-muted';
      hint.textContent = '오리를 먼저 선택하면 장착할 수 있어요.';
      modalActions.appendChild(hint);
    }

    modal.hidden = false;
  }

  /** @param {import('../constants.js').DuckDef} duck */
  function openModalDuck(duck) {
    const owned = duckOwned(api.state, duck.id);
    modalTitle.textContent = duck.name;
    modalEmoji.textContent = '🦆';
    modalDesc.textContent = owned ? '이미 동료로 데려온 오리예요.' : `컬러: ${duck.color}`;
    modalPrice.textContent = owned ? '보유' : `♥ ${duck.price}`;

    modalActions.replaceChildren();
    if (!owned) {
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'app-btn app-btn--primary';
      buy.textContent = '구매';
      buy.disabled = getBalance(api.state) < duck.price;
      buy.addEventListener('click', () => {
        if (
          !window.confirm(`♥ ${duck.price}를 사용하여 「${duck.name}」 오리를 데려오시겠습니까?`)
        ) {
          return;
        }
        if (!spend(api.state, duck.price, 'shop_duck', { duckId: duck.id })) {
          window.alert('하트가 부족합니다.');
          return;
        }
        addOwnedDuck(api, duck.id);
        refreshBalance();
        renderPreview();
        openModalDuck(duck);
        renderGrid();
      });
      modalActions.appendChild(buy);
    }
    modal.hidden = false;
  }

  function setTab(id) {
    activePanel = id;
    for (const { id: tid, btn } of tabButtons) {
      btn.classList.toggle('is-active', tid === id);
    }
    renderGrid();
  }

  for (const { id, btn } of tabButtons) {
    btn.addEventListener('click', () => setTab(id));
  }

  function renderGrid() {
    grid.replaceChildren();

    if (activePanel === 'ducks') {
      for (const duck of DUCKS_NINE) {
        const owned = duckOwned(api.state, duck.id);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'shop-grid-cell app-box';
        if (owned) cell.classList.add('shop-grid-cell--owned');

        const circle = document.createElement('div');
        circle.className = 'duck-circle shop-grid-duck';
        circle.style.backgroundColor = duck.color;
        if (duck.id === 'duri') circle.classList.add('duck-circle--dark');
        if (duck.id === 'ari') circle.classList.add('duck-circle--light');

        const nm = document.createElement('div');
        nm.className = 'shop-grid-name';
        nm.textContent = duck.name;

        const meta = document.createElement('div');
        meta.className = 'shop-grid-meta';
        meta.textContent = owned ? '보유' : `♥${duck.price}`;

        cell.appendChild(circle);
        cell.appendChild(nm);
        cell.appendChild(meta);
        cell.addEventListener('click', () => openModalDuck(duck));
        grid.appendChild(cell);
      }
      return;
    }

    const items = SHOP_ITEMS.filter((x) => x.cat === activePanel);
    for (const item of items) {
      const owned = uid ? ownsItem(uid, item.id) : false;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'shop-grid-cell app-box';
      if (owned) cell.classList.add('shop-grid-cell--owned');

      const em = document.createElement('div');
      em.className = 'shop-grid-emoji';
      em.textContent = item.emoji;
      const nm = document.createElement('div');
      nm.className = 'shop-grid-name';
      nm.textContent = item.name;
      const meta = document.createElement('div');
      meta.className = 'shop-grid-meta';
      meta.textContent = owned ? '보유' : `♥${item.price}`;

      cell.appendChild(em);
      cell.appendChild(nm);
      cell.appendChild(meta);
      cell.addEventListener('click', () => openModalDecor(item.id));
      grid.appendChild(cell);
    }
  }

  refreshBalance();
  renderPreview();
  renderGrid();
}
