/**
 * 경주 기록 히스토리
 */

import {
  getOverallStats,
  getRaceHistory,
  getStatsVsOpponent,
} from '../services/raceHistory.js';

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountRaceHistory(root, api) {
  const uid = api.state.user?.uid;

  const wrap = document.createElement('div');
  wrap.className = 'app-screen race-history-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '경주 기록';

  const summary = document.createElement('div');
  summary.className = 'app-box race-history-summary';

  const filterRow = document.createElement('div');
  filterRow.className = 'race-history-filter';
  const filterLabel = document.createElement('span');
  filterLabel.className = 'app-muted';
  filterLabel.textContent = '상대 필터';
  const filterSelect = document.createElement('select');
  filterSelect.className = 'app-input race-history-select';

  const listEl = document.createElement('div');
  listEl.className = 'race-history-list';

  /** @type {string | null} */
  let filterOppId = null;

  function rebuildFilterOptions(history) {
    const ids = new Map();
    for (const h of history) {
      if (h.opponentId) ids.set(h.opponentId, h.opponentNick);
    }
    filterSelect.replaceChildren();
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = '전체';
    filterSelect.appendChild(optAll);
    for (const [id, nick] of ids) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = nick;
      filterSelect.appendChild(o);
    }
    if (filterOppId && !ids.has(filterOppId)) filterOppId = null;
    filterSelect.value = filterOppId ?? '';
  }

  function renderSummary() {
    if (!uid) {
      summary.innerHTML = '<p class="app-muted">로그인 후 기록을 볼 수 있어요.</p>';
      return;
    }
    let st = getOverallStats(uid);
    if (filterOppId) {
      const vs = getStatsVsOpponent(uid, filterOppId);
      const races = vs.wins + vs.losses + vs.draws;
      let avg = 0;
      if (vs.races.length > 0) {
        avg = vs.races.reduce((a, r) => a + r.mySpeed, 0) / vs.races.length;
      }
      st = {
        wins: vs.wins,
        losses: vs.losses,
        draws: vs.draws,
        totalRaces: races,
        avgSpeed: avg,
        bestSpeed: vs.races.reduce((m, r) => Math.max(m, r.mySpeed), 0),
      };
    }
    const total = st.wins + st.losses + st.draws;
    const rate = total > 0 ? ((st.wins / total) * 100).toFixed(1) : '0.0';
    summary.innerHTML = `
      <div class="race-history-summary-grid">
        <div><span class="app-muted">승</span> <strong>${st.wins}</strong></div>
        <div><span class="app-muted">패</span> <strong>${st.losses}</strong></div>
        <div><span class="app-muted">무</span> <strong>${st.draws}</strong></div>
        <div><span class="app-muted">승률</span> <strong>${rate}%</strong></div>
      </div>
      <p class="race-history-summary-speed app-muted" style="margin-top:10px">평균 속도 ${st.totalRaces ? st.avgSpeed.toFixed(2) : '—'} m/s${
        filterOppId ? ' · 선택한 상대만' : ''
      }</p>
    `;
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderList() {
    listEl.replaceChildren();
    if (!uid) return;
    const full = getRaceHistory(uid, 500);
    rebuildFilterOptions(full);
    const rows = filterOppId ? full.filter((r) => r.opponentId === filterOppId) : full;
    if (rows.length === 0) {
      const p = document.createElement('p');
      p.className = 'app-muted';
      p.textContent = '기록이 없어요.';
      listEl.appendChild(p);
      return;
    }
    for (const r of rows) {
      const card = document.createElement('div');
      card.className = 'race-history-card app-box';
      const badge =
        r.result === 'win' ? '승' : r.result === 'lose' ? '패' : '무';
      const badgeCls =
        r.result === 'win' ? 'race-badge-win' : r.result === 'lose' ? 'race-badge-lose' : 'race-badge-draw';
      card.innerHTML = `
        <div class="race-history-card-top">
          <span class="race-history-date app-muted">${fmtDate(r.date)}</span>
          <span class="race-badge ${badgeCls}">${badge}</span>
        </div>
        <div class="race-history-opp">${escapeHtml(r.opponentNick)}</div>
        <div class="race-history-dist">나 ${r.myDistance.toFixed(1)}m · 상대 ${r.opponentDistance.toFixed(1)}m</div>
      `;
      card.style.cursor = r.opponentId ? 'pointer' : 'default';
      if (r.opponentId) {
        card.addEventListener('click', () => {
          filterOppId = r.opponentId;
          filterSelect.value = filterOppId;
          renderSummary();
          renderList();
        });
      }
      listEl.appendChild(card);
    }
  }

  filterSelect.addEventListener('change', () => {
    const v = filterSelect.value;
    filterOppId = v || null;
    renderSummary();
    renderList();
  });

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '12px';
  back.textContent = '랭킹';
  back.addEventListener('click', () => api.navigate('ranking'));

  const backLobby = document.createElement('button');
  backLobby.type = 'button';
  backLobby.className = 'app-btn';
  backLobby.style.marginTop = '8px';
  backLobby.textContent = '로비';
  backLobby.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(summary);
  filterRow.appendChild(filterLabel);
  filterRow.appendChild(filterSelect);
  wrap.appendChild(filterRow);
  wrap.appendChild(listEl);
  wrap.appendChild(back);
  wrap.appendChild(backLobby);
  root.appendChild(wrap);

  renderSummary();
  renderList();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
