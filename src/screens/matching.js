/**
 * 매칭 — 랜덤/친구 선택 · 대기 VS · 모킹 매칭(services/socket.js)
 */

import { DUCKS_NINE } from '../constants.js';
import { resolveMediaUrl } from '../services/auth.js';
import { ensureSocket, startMockRandomMatch } from '../services/socket.js';

const RACE_DELAY_MS = 1000;

/** @param {string | null | undefined} id */
function duckById(id) {
  if (!id) return null;
  return DUCKS_NINE.find((d) => d.id === id) ?? null;
}

/** @param {object} state */
function displayNick(state) {
  return state.nickname || state.user?.displayName || '게스트';
}

/**
 * @param {{
 *   photoURL: string,
 *   nickname: string,
 *   duck: { id: string, name: string, color: string } | null,
 *   placeholder?: boolean,
 *   record?: { wins: number, losses: number, draws: number },
 * }} opts
 */
function createMatchPlayerCard(opts) {
  const card = document.createElement('div');
  card.className = 'matching-player-card';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'matching-player-avatar-wrap';

  if (opts.placeholder) {
    const ph = document.createElement('div');
    ph.className = 'matching-player-avatar-q';
    ph.textContent = '?';
    ph.setAttribute('aria-hidden', 'true');
    avatarWrap.appendChild(ph);
  } else if (opts.photoURL) {
    const img = document.createElement('img');
    img.className = 'matching-player-avatar-img';
    img.src = resolveMediaUrl(opts.photoURL);
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    avatarWrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'matching-player-avatar-placeholder';
    ph.textContent = opts.nickname.slice(0, 1) || '?';
    ph.setAttribute('aria-hidden', 'true');
    avatarWrap.appendChild(ph);
  }

  const nick = document.createElement('div');
  nick.className = 'matching-player-nick';
  nick.textContent = opts.placeholder ? '???' : opts.nickname;

  const duckRow = document.createElement('div');
  duckRow.className = 'matching-player-duck';

  const circle = document.createElement('div');
  circle.className = 'duck-circle matching-player-duck-circle';

  if (opts.duck) {
    circle.style.backgroundColor = opts.duck.color;
    if (opts.duck.id === 'duri') circle.classList.add('duck-circle--dark');
    if (opts.duck.id === 'ari') circle.classList.add('duck-circle--light');
  } else {
    circle.classList.add('matching-player-duck-circle--q');
    circle.textContent = '?';
  }

  const duckName = document.createElement('span');
  duckName.className = 'matching-player-duck-name';
  duckName.textContent = opts.duck ? opts.duck.name : '—';

  duckRow.appendChild(circle);
  duckRow.appendChild(duckName);

  card.appendChild(avatarWrap);
  card.appendChild(nick);
  card.appendChild(duckRow);

  if (opts.record && !opts.placeholder) {
    const rec = document.createElement('div');
    rec.className = 'matching-player-record app-muted';
    rec.textContent = `전적 ${opts.record.wins}승 ${opts.record.losses}패 ${opts.record.draws}무`;
    card.appendChild(rec);
  }

  return card;
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountMatching(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen matching-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '대전 매칭';

  const menuLayer = document.createElement('div');
  menuLayer.className = 'matching-menu';

  const btnRandom = document.createElement('button');
  btnRandom.type = 'button';
  btnRandom.className = 'app-btn app-btn--primary';
  btnRandom.textContent = '랜덤 대전';

  const btnFriend = document.createElement('button');
  btnFriend.type = 'button';
  btnFriend.className = 'app-btn';
  btnFriend.style.marginTop = '10px';
  btnFriend.textContent = '친구 대전';
  btnFriend.addEventListener('click', () => {
    api.navigate('friends');
  });

  menuLayer.appendChild(btnRandom);
  menuLayer.appendChild(btnFriend);

  const waitLayer = document.createElement('div');
  waitLayer.className = 'matching-wait';
  waitLayer.hidden = true;

  const duelRow = document.createElement('div');
  duelRow.className = 'matching-duel-row';

  const vs = document.createElement('div');
  vs.className = 'matching-vs';
  vs.textContent = 'VS';

  const myDuck = duckById(api.state.selectedDuckId);
  const meCard = createMatchPlayerCard({
    photoURL: api.state.profilePhotoURL,
    nickname: displayNick(api.state),
    duck: myDuck,
  });

  let oppCardEl = createMatchPlayerCard({
    photoURL: '',
    nickname: '',
    duck: null,
    placeholder: true,
  });

  duelRow.appendChild(meCard);
  duelRow.appendChild(vs);
  duelRow.appendChild(oppCardEl);

  const loadingBlock = document.createElement('div');
  loadingBlock.className = 'matching-loading';

  const spinner = document.createElement('div');
  spinner.className = 'matching-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const duckRun = document.createElement('div');
  duckRun.className = 'matching-duck-run';
  duckRun.textContent = '🦆';
  duckRun.setAttribute('aria-hidden', 'true');

  const loadingText = document.createElement('p');
  loadingText.className = 'matching-loading-text';
  loadingText.textContent = '매칭 중…';

  loadingBlock.appendChild(spinner);
  loadingBlock.appendChild(duckRun);
  loadingBlock.appendChild(loadingText);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'app-btn';
  cancel.textContent = '취소';
  cancel.addEventListener('click', () => {
    api.navigate('lobby');
  });

  waitLayer.appendChild(duelRow);
  waitLayer.appendChild(loadingBlock);
  waitLayer.appendChild(cancel);

  const backLobby = document.createElement('button');
  backLobby.type = 'button';
  backLobby.className = 'app-btn';
  backLobby.style.marginTop = '12px';
  backLobby.textContent = '로비로';
  backLobby.addEventListener('click', () => api.navigate('lobby'));

  wrap.appendChild(title);
  wrap.appendChild(menuLayer);
  wrap.appendChild(waitLayer);
  wrap.appendChild(backLobby);
  root.appendChild(wrap);

  const onMatchErr = (ev) => {
    const data = ev.detail;
    if (api.state.screen !== 'matching') return;
    if (data && data.reason === 'noHearts') {
      window.removeEventListener('dallyeori-match-error', onMatchErr);
      api.state._matchingMatchErrCleanup = null;
      window.alert(
        '하트가 부족합니다! 광고를 보거나 친구에게 하트를 요청하세요',
      );
      api.navigate('lobby');
    }
  };
  window.addEventListener('dallyeori-match-error', onMatchErr);
  api.state._matchingMatchErrCleanup = () => {
    window.removeEventListener('dallyeori-match-error', onMatchErr);
  };

  btnRandom.addEventListener('click', () => {
    if (!ensureSocket()) {
      menuLayer.hidden = false;
      waitLayer.hidden = true;
      backLobby.hidden = false;
      return;
    }
    menuLayer.hidden = true;
    waitLayer.hidden = false;
    backLobby.hidden = true;

    loadingBlock.hidden = false;
    cancel.hidden = false;
    loadingText.textContent = '매칭 중…';

    const { promise, cancel: abortMatch } = startMockRandomMatch(api.state.user?.uid);
    api.state._matchingCancel = abortMatch;

    promise
      .then((opponent) => {
      if (api.state.screen !== 'matching') return;
      api.state._matchingCancel = null;

      loadingBlock.hidden = true;
      cancel.hidden = true;

      const oppDuck = duckById(opponent.duckId);
      const nextCard = createMatchPlayerCard({
        photoURL: opponent.profilePhotoURL,
        nickname: opponent.nickname,
        duck: oppDuck,
        record: {
          wins: opponent.wins,
          losses: opponent.losses,
          draws: opponent.draws,
        },
      });
      oppCardEl.replaceWith(nextCard);
      oppCardEl = nextCard;

      title.textContent = '매칭 완료';

      api.state.lastOpponent = {
        userId: opponent.userId,
        nickname: opponent.nickname,
        profilePhotoURL: opponent.profilePhotoURL,
        duckId: opponent.duckId,
        duckName: opponent.duckName,
        duckColor: opponent.duckColor,
        wins: opponent.wins,
        losses: opponent.losses,
        draws: opponent.draws,
      };

      api.state._matchingTimer = window.setTimeout(() => {
        api.state._matchingTimer = null;
        if (api.state.screen !== 'matching') return;
        try {
          api.navigate('race', { opponentName: opponent.nickname });
        } catch (err) {
          console.error('[dallyeori] matching → race', err);
        }
      }, RACE_DELAY_MS);
    })
      .catch((err) => {
        if (api.state.screen !== 'matching') return;
        api.state._matchingCancel = null;
        console.warn('[matching]', err?.message || err);
        api.navigate('lobby');
      });
  });
}
