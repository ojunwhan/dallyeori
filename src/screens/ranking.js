/**
 * 세계 랭킹 — 황금오리, TOP 10, 내 요약
 */

import { DUCKS_NINE } from '../constants.js';
import { getGoldenDuck, getMyRankingData, getTopTen, isGoldenDuck } from '../services/ranking.js';

/** @param {string | null | undefined} duckId */
function duckLabel(duckId) {
  if (!duckId) return '—';
  return DUCKS_NINE.find((d) => d.id === duckId)?.name ?? duckId;
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountRanking(root, api) {
  const uid = api.state.user?.uid;
  const nick = api.state.nickname || api.state.user?.displayName || '나';
  const duckId = api.state.selectedDuckId;

  const wrap = document.createElement('div');
  wrap.className = 'app-screen ranking-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '랭킹';

  const golden = getGoldenDuck(uid || '', nick, duckId);
  const top = getTopTen(uid || '', nick, duckId);
  const mine = getMyRankingData(uid || '', nick, duckId);

  const goldCard = document.createElement('div');
  goldCard.className = 'ranking-golden-card';
  if (golden) {
    const isMe = uid && golden.userId === uid;
    goldCard.innerHTML = `
      <p class="ranking-golden-sparkle" aria-hidden="true">✨ ✨ ✨</p>
      <div class="ranking-golden-title">황금오리</div>
      <div class="ranking-golden-nick">${escapeHtml(golden.nickname)}${isMe ? ' <span class="ranking-me-tag">(나)</span>' : ''}</div>
      <div class="ranking-golden-stats">평균 ${golden.avgSpeed.toFixed(2)} m/s · 경주 ${golden.totalRaces}회</div>
      <div class="ranking-golden-tagline">전세계에 딱 1마리!</div>
    `;
  } else {
    goldCard.textContent = '랭킹 정보를 불러올 수 없어요.';
  }

  const listTitle = document.createElement('h2');
  listTitle.className = 'ranking-subtitle';
  listTitle.textContent = 'TOP 10';

  const listEl = document.createElement('div');
  listEl.className = 'ranking-list';
  for (const row of top) {
    const rowEl = document.createElement('div');
    const amGold = isGoldenDuck(row.userId, uid || '', nick, duckId);
    rowEl.className = 'ranking-row app-box' + (uid && row.userId === uid ? ' is-me' : '');
    if (amGold) rowEl.classList.add('ranking-row--golden-seat');
    rowEl.innerHTML = `
      <span class="ranking-rank">#${row.rank}</span>
      <div class="ranking-row-mid">
        <div class="ranking-nick">${escapeHtml(row.nickname)}</div>
        <div class="ranking-meta app-muted">${duckLabel(row.duckId)} · ${row.avgSpeed.toFixed(2)} m/s</div>
      </div>
      <span class="ranking-races app-muted">${row.totalRaces}회</span>
    `;
    listEl.appendChild(rowEl);
  }

  const myCard = document.createElement('div');
  myCard.className = 'app-box ranking-my-card';
  if (!uid) {
    myCard.innerHTML =
      '<div class="app-muted">로그인 후 내 순위가 반영돼요. 모킹 유저와 세계 랭킹만 표시됩니다.</div>';
  } else {
    const rankStr = mine.rank != null ? `#${mine.rank}` : '—';
    let gapLine = '';
    if (!mine.inTopTen && mine.gapToTenth != null && mine.gapToTenth > 0) {
      gapLine = `<p class="ranking-gap app-muted">TOP 10까지 ${mine.gapToTenth.toFixed(2)} m/s 더 필요!</p>`;
    } else if (mine.inTopTen) {
      gapLine = '<p class="ranking-gap ranking-gap--ok">TOP 10 안에 있어요!</p>';
    }
    myCard.innerHTML = `
      <div class="ranking-my-title">내 랭킹</div>
      <div class="ranking-my-grid">
        <div><span class="app-muted">순위</span> <strong>${rankStr}</strong></div>
        <div><span class="app-muted">평균 속도</span> <strong>${mine.avgSpeed.toFixed(2)} m/s</strong></div>
        <div><span class="app-muted">총 경주</span> <strong>${mine.totalRaces}</strong></div>
        <div><span class="app-muted">최고 속도</span> <strong>${mine.bestSpeed.toFixed(2)} m/s</strong></div>
      </div>
      ${gapLine}
    `;
  }

  const btnHistory = document.createElement('button');
  btnHistory.type = 'button';
  btnHistory.className = 'app-btn app-btn--primary';
  btnHistory.textContent = '내 기록 보기';
  btnHistory.addEventListener('click', () => api.navigate('raceHistory'));

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '8px';
  back.textContent = '로비';
  back.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(goldCard);
  wrap.appendChild(listTitle);
  wrap.appendChild(listEl);
  wrap.appendChild(myCard);
  wrap.appendChild(btnHistory);
  wrap.appendChild(back);
  root.appendChild(wrap);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
