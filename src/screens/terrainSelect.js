/**
 * 경기장(지형) 선택 — 매칭 전 단계
 */

const OPTIONS = [
  { id: 'normal', label: '일반', stars: '⭐', desc: '일반 트랙' },
  { id: 'ice', label: '얼음', stars: '⭐⭐', desc: '저마찰 · 스핀' },
  { id: 'cliff', label: '벼랑', stars: '⭐⭐⭐', desc: '좁은 길 · 추락' },
  { id: 'iceCliff', label: '얼음벼랑', stars: '⭐⭐⭐⭐', desc: '얼음 + 절벽' },
];

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountTerrainSelect(root, api) {
  if (!api.state.terrain) api.state.terrain = 'normal';

  const wrap = document.createElement('div');
  wrap.className = 'app-screen terrain-select-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '경기장 선택';

  const hint = document.createElement('p');
  hint.className = 'app-muted';
  hint.style.marginBottom = '12px';
  hint.textContent = '지형에 따라 미끄러짐·벼랑 추락이 달라져요.';

  const grid = document.createElement('div');
  grid.className = 'terrain-select-grid';

  for (const opt of OPTIONS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'app-box terrain-select-card';
    card.innerHTML = `
      <div class="terrain-card-stars">${opt.stars}</div>
      <div class="terrain-card-label"><strong>${opt.label}</strong></div>
      <div class="terrain-card-desc app-muted">${opt.desc}</div>
    `;
    card.addEventListener('click', () => {
      api.state.terrain = opt.id;
      api.navigate('matching');
    });
    grid.appendChild(card);
  }

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.style.marginTop = '16px';
  back.textContent = '로비';
  back.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(grid);
  wrap.appendChild(back);
  root.appendChild(wrap);
}
