/**
 * 프로필 화면 — 데이터는 profileViewModel, 여기서는 DOM만
 */

import { logout } from '../services/auth.js';
import { LANGUAGES, getLanguageByCode } from '../data/languages.js';
import {
  buildProfileViewModel,
  persistNickname,
  persistLanguage,
} from '../services/profileViewModel.js';
import { getOverallStats } from '../services/raceHistory.js';

function fillLanguageSelect(select, selectedCode) {
  const t1 = LANGUAGES.filter((l) => l.tier === 1);
  const t2 = LANGUAGES.filter((l) => l.tier === 2);
  for (const lang of t1) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.flag} ${lang.nativeName}`;
    select.appendChild(opt);
  }
  const sep = document.createElement('option');
  sep.disabled = true;
  sep.value = '';
  sep.textContent = '──────';
  select.appendChild(sep);
  for (const lang of t2) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.flag} ${lang.nativeName}`;
    select.appendChild(opt);
  }
  const code = LANGUAGES.some((l) => l.code === selectedCode) ? selectedCode : 'ko';
  select.value = code;
}

/**
 * @param {HTMLElement} root
 * @param {{ navigate: (s: string, p?: object) => void, state: object }} api
 */
export function mountProfile(root, api) {
  function getState() {
    return api?.state ?? {};
  }

  const wrap = document.createElement('div');
  wrap.className = 'app-screen profile-screen';

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '프로필';

  const main = document.createElement('div');
  main.className = 'profile-main';

  let editingNickname = false;
  let editingLanguage = false;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'app-btn';
  back.textContent = '로비로 돌아가기';
  back.addEventListener('click', () => api.navigate('lobby'));

  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'app-btn';
  out.style.marginTop = '8px';
  out.textContent = '로그아웃';
  out.addEventListener('click', () => {
    logout();
    api.state.user = null;
    api.navigate('splash');
  });

  function refresh() {
    const state = getState();
    const vm = buildProfileViewModel(state);
    main.replaceChildren();
    main.append(
      sectionPhoto(vm),
      sectionNickname(vm, api, editingNickname, () => {
        editingNickname = false;
        refresh();
      }, () => {
        editingNickname = true;
        refresh();
      }),
      sectionLanguage(vm, api, editingLanguage, () => {
        editingLanguage = false;
        refresh();
      }, () => {
        editingLanguage = true;
        refresh();
      }),
      sectionStats(api),
      sectionHearts(vm),
      sectionDuck(vm, api),
    );
  }

  wrap.appendChild(title);
  wrap.appendChild(main);
  wrap.appendChild(back);
  wrap.appendChild(out);
  root.appendChild(wrap);
  refresh();
}

/** @param {import('../services/profileViewModel.js').ProfileViewModel} vm */
function sectionPhoto(vm) {
  const box = document.createElement('div');
  box.className = 'app-box profile-photo-section';

  const wrapImg = document.createElement('div');
  wrapImg.className = 'profile-avatar-wrap';

  if (vm.photoURL) {
    const img = document.createElement('img');
    img.className = 'profile-avatar-img';
    img.src = vm.photoURL;
    img.alt = '프로필';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.replaceWith(avatarPlaceholder());
    });
    wrapImg.appendChild(img);
  } else {
    wrapImg.appendChild(avatarPlaceholder());
  }

  const hint = document.createElement('p');
  hint.className = 'app-muted profile-upload-hint';
  hint.textContent =
    '프로필 사진은 현재 구글 계정 이미지를 사용합니다. 업로드 기능은 추후 추가 예정입니다.';

  box.appendChild(wrapImg);
  box.appendChild(hint);
  return box;
}

function avatarPlaceholder() {
  const ph = document.createElement('div');
  ph.className = 'profile-avatar-placeholder';
  ph.setAttribute('aria-hidden', 'true');
  ph.textContent = '🦆';
  return ph;
}

/**
 * @param {import('../services/profileViewModel.js').ProfileViewModel} vm
 */
function sectionNickname(vm, api, editing, onCancelEdit, onStartEdit) {
  const box = document.createElement('div');
  box.className = 'app-box profile-row';

  const row = document.createElement('div');
  row.className = 'profile-row-head';

  const label = document.createElement('span');
  label.className = 'profile-label';
  label.textContent = '닉네임';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'app-btn app-btn--inline';

  const valueEl = document.createElement('div');
  valueEl.className = 'profile-value';

  if (editing) {
    editBtn.textContent = '취소';
    editBtn.addEventListener('click', () => onCancelEdit());

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'app-input';
    input.value = api.state.nickname || api.state.user?.displayName || '';
    input.autocomplete = 'nickname';

    const actions = document.createElement('div');
    actions.className = 'profile-inline-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'app-btn app-btn--primary';
    save.textContent = '저장';
    save.addEventListener('click', () => {
      persistNickname(api.state, input.value);
      onCancelEdit();
    });
    actions.appendChild(save);
    valueEl.appendChild(input);
    valueEl.appendChild(actions);
  } else {
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => onStartEdit());
    valueEl.innerHTML = `<strong>${escapeHtml(vm.nickname)}</strong>`;
  }

  row.appendChild(label);
  row.appendChild(editBtn);
  box.appendChild(row);
  box.appendChild(valueEl);
  return box;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {import('../services/profileViewModel.js').ProfileViewModel} vm
 */
function sectionLanguage(vm, api, editing, onCancelEdit, onStartEdit) {
  const box = document.createElement('div');
  box.className = 'app-box profile-row';

  const row = document.createElement('div');
  row.className = 'profile-row-head';

  const label = document.createElement('span');
  label.className = 'profile-label';
  label.textContent = '언어';

  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'app-btn app-btn--inline';

  const valueEl = document.createElement('div');
  valueEl.className = 'profile-value';

  if (editing) {
    changeBtn.textContent = '취소';
    changeBtn.addEventListener('click', () => onCancelEdit());

    const sel = document.createElement('select');
    sel.className = 'app-input';
    fillLanguageSelect(sel, vm.languageCode);

    const actions = document.createElement('div');
    actions.className = 'profile-inline-actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'app-btn app-btn--primary';
    apply.textContent = '적용';
    apply.addEventListener('click', () => {
      persistLanguage(api.state, sel.value);
      onCancelEdit();
    });
    actions.appendChild(apply);
    valueEl.appendChild(sel);
    valueEl.appendChild(actions);
  } else {
    changeBtn.textContent = '변경';
    changeBtn.addEventListener('click', () => onStartEdit());
    const lang = getLanguageByCode(vm.languageCode);
    if (lang) {
      valueEl.innerHTML = `<span>${escapeHtml(`${lang.flag} ${lang.nativeName}`)}</span> <span class="app-muted">(${escapeHtml(lang.code)})</span>`;
    } else {
      valueEl.innerHTML = `<span>${escapeHtml(vm.languageCode)}</span>`;
    }
  }

  row.appendChild(label);
  row.appendChild(changeBtn);
  box.appendChild(row);
  box.appendChild(valueEl);
  return box;
}

/** @param {{ state?: object } | null | undefined} api */
function sectionStats(api) {
  const emptyStats = { wins: 0, losses: 0, draws: 0, totalRaces: 0, avgSpeed: 0, bestSpeed: 0 };
  const state = api?.state ?? {};
  const uid = state.user?.uid;
  const raw = uid ? getOverallStats(uid) : null;
  const s =
    raw && typeof raw === 'object'
      ? { ...emptyStats, ...raw }
      : { ...emptyStats };
  const box = document.createElement('div');
  box.className = 'app-box profile-row';
  const avgSpeed = Number(s.avgSpeed);
  const bestSpeed = Number(s.bestSpeed);
  const avgStr = s.totalRaces > 0 && Number.isFinite(avgSpeed) ? avgSpeed.toFixed(2) : '—';
  const bestStr = s.totalRaces > 0 && Number.isFinite(bestSpeed) ? bestSpeed.toFixed(2) : '—';
  box.innerHTML = `
    <div class="profile-label" style="margin-bottom:8px">전적</div>
    <div class="profile-stats-grid">
      <div><span class="app-muted">승</span> <strong>${s.wins}</strong></div>
      <div><span class="app-muted">패</span> <strong>${s.losses}</strong></div>
      <div><span class="app-muted">무</span> <strong>${s.draws}</strong></div>
      <div class="profile-stat-total"><span class="app-muted">총 경주</span> <strong>${s.totalRaces}</strong></div>
    </div>
    <div class="profile-stats-sub app-muted" style="margin-top:8px;font-size:0.9rem">평균 속도 ${avgStr} m/s · 최고 ${bestStr} m/s</div>
  `;
  return box;
}

/** @param {import('../services/profileViewModel.js').ProfileViewModel} vm */
function sectionHearts(vm) {
  const box = document.createElement('div');
  box.className = 'app-box profile-row';
  box.innerHTML = `<div class="profile-label">보유 하트</div><div class="profile-value profile-hearts"><strong>${vm.hearts}</strong></div>`;
  return box;
}

/**
 * @param {import('../services/profileViewModel.js').ProfileViewModel} vm
 */
function sectionDuck(vm, api) {
  const box = document.createElement('div');
  box.className = 'app-box profile-row';

  const head = document.createElement('div');
  head.className = 'profile-label';
  head.textContent = '선택한 오리';
  box.appendChild(head);

  if (vm.hasSelectedDuck) {
    const v = document.createElement('div');
    v.className = 'profile-value';
    v.innerHTML = `<strong>${escapeHtml(vm.duckLabel || '')}</strong>`;
    box.appendChild(v);
  } else {
    const hint = document.createElement('p');
    hint.className = 'app-muted';
    hint.textContent = '오리를 바꾸려면 오리 선택으로 이동하세요. 새 오리는 상점에서 구매할 수 있어요.';
    box.appendChild(hint);
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'app-btn';
    go.style.marginTop = '10px';
    go.textContent = '오리 선택하러 가기';
    go.addEventListener('click', () => api.navigate('duckSelect'));
    box.appendChild(go);
  }

  return box;
}
