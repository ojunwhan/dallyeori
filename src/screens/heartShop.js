/**
 * 하트 충전(IAP 모킹) · 광고 · 거래 내역
 */

import { IAP_PACKAGES, getBalance, getTransactions, purchaseIAP, rewardForAd } from '../services/hearts.js';

const AD_WAIT_MS = 1500;

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountHeartShop(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen heart-shop-screen';

  const title = document.createElement('h1');
  title.className = 'app-title heart-shop-title';
  title.textContent = '하트 충전';

  const balance = document.createElement('div');
  balance.className = 'heart-shop-balance';
  balance.setAttribute('aria-live', 'polite');

  const mockNote = document.createElement('p');
  mockNote.className = 'app-muted heart-shop-mock';
  mockNote.textContent = '모킹: 결제 대신 확인만 누르면 즉시 지급됩니다.';

  const iapGrid = document.createElement('div');
  iapGrid.className = 'heart-shop-iap-grid';

  const packs = /** @type {(keyof typeof IAP_PACKAGES)[]} */ ([
    'pack100',
    'pack300',
    'pack500',
    'pack1200',
  ]);

  function refreshBalance() {
    balance.innerHTML = '';
    const lab = document.createElement('div');
    lab.className = 'heart-shop-balance-label';
    lab.textContent = '보유 하트';
    const val = document.createElement('div');
    val.className = 'heart-shop-balance-value';
    val.textContent = `${getBalance(api.state)}♥`;
    balance.appendChild(lab);
    balance.appendChild(val);
  }

  for (const key of packs) {
    const p = IAP_PACKAGES[key];
    const card = document.createElement('div');
    card.className = 'app-box heart-shop-pack';

    if (p.note) {
      const badge = document.createElement('div');
      badge.className = 'heart-shop-pack-badge';
      badge.textContent = p.note;
      card.appendChild(badge);
    }

    const h = document.createElement('div');
    h.className = 'heart-shop-pack-hearts';
    h.textContent = p.label;
    const pr = document.createElement('div');
    pr.className = 'heart-shop-pack-won';
    pr.textContent = `₩${p.priceWon.toLocaleString('ko-KR')}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-btn shop-btn-gold heart-shop-pack-btn';
    btn.textContent = '구매 (모킹)';
    btn.addEventListener('click', () => {
      const msg = `₩${p.priceWon.toLocaleString('ko-KR')}에 ${p.label}를 충전할까요?\n(실제 결제 없이 모킹 지급)`;
      if (!window.confirm(msg)) return;
      const r = purchaseIAP(api.state, p.id);
      if (r.ok) {
        refreshBalance();
        renderTx();
        window.alert(`${r.hearts}♥가 추가되었습니다.`);
      }
    });

    card.appendChild(h);
    card.appendChild(pr);
    card.appendChild(btn);
    iapGrid.appendChild(card);
  }

  const adRow = document.createElement('div');
  adRow.className = 'heart-shop-ad-row';

  const btnAd = document.createElement('button');
  btnAd.type = 'button';
  btnAd.className = 'app-btn shop-btn-orange';
  btnAd.textContent = '광고 시청 (+5♥)';

  btnAd.addEventListener('click', () => {
    btnAd.disabled = true;
    const t = btnAd.textContent;
    btnAd.textContent = '시청 중… (1.5초)';
    window.setTimeout(() => {
      rewardForAd(api.state);
      refreshBalance();
      renderTx();
      btnAd.textContent = t;
      btnAd.disabled = false;
      window.alert('+5♥ 지급되었습니다.');
    }, AD_WAIT_MS);
  });

  adRow.appendChild(btnAd);

  const txToggle = document.createElement('button');
  txToggle.type = 'button';
  txToggle.className = 'app-btn heart-shop-tx-toggle';
  txToggle.textContent = '거래 내역 보기';

  const txBox = document.createElement('div');
  txBox.className = 'app-box heart-shop-tx-box';
  txBox.hidden = true;

  function renderTx() {
    txBox.replaceChildren();
    const list = getTransactions(api.state, 200);
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '내역이 없습니다.';
      txBox.appendChild(p);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'heart-shop-tx-list';
    for (const e of list) {
      const li = document.createElement('li');
      li.className = 'heart-shop-tx-item';
      const sign = e.kind === 'earn' ? '+' : '−';
      const dt = new Date(e.ts).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
      li.textContent = `${dt}  ${sign}${e.amount}♥  ${e.reason}`;
      ul.appendChild(li);
    }
    txBox.appendChild(ul);
  }

  let txOpen = false;
  txToggle.addEventListener('click', () => {
    txOpen = !txOpen;
    txBox.hidden = !txOpen;
    txToggle.textContent = txOpen ? '거래 내역 닫기' : '거래 내역 보기';
    if (txOpen) renderTx();
  });

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.textContent = '← 상점';
  back.addEventListener('click', () => api.navigate('shop'));

  wrap.appendChild(title);
  wrap.appendChild(balance);
  wrap.appendChild(mockNote);
  wrap.appendChild(iapGrid);
  wrap.appendChild(adRow);
  wrap.appendChild(txToggle);
  wrap.appendChild(txBox);
  wrap.appendChild(back);
  root.appendChild(wrap);

  refreshBalance();
}
