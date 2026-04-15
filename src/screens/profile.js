/**
 * 프로필 화면 — 데이터는 profileViewModel, 여기서는 DOM만
 */

import { logout } from '../services/auth.js';
import { createLanguagePicker } from '../components/languagePicker.js';
import { LANGUAGES, getLanguageByCode } from '../data/languages.js';
import {
  buildProfileViewModel,
  persistNickname,
  persistLanguage,
} from '../services/profileViewModel.js';
import { getOverallStats } from '../services/raceHistory.js';
import { getUserRecord, patchUserRecord } from '../services/db.js';
import { postProfile, postProfileAvatar, validateNicknameLocal } from '../services/profileApi.js';
import { showAppToast } from '../services/toast.js';

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
      sectionPhoto(vm, api, refresh),
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
function sectionPhoto(vm, api, refresh) {
  const box = document.createElement('div');
  box.className = 'app-box profile-photo-section';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
  fileInput.style.display = 'none';
  fileInput.setAttribute('aria-hidden', 'true');

  const stack = document.createElement('div');
  stack.className = 'profile-avatar-stack';

  const wrapImg = document.createElement('div');
  wrapImg.className = 'profile-avatar-wrap';

  const inner = document.createElement('div');
  inner.className = 'profile-avatar-inner';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'profile-avatar-loading';
  loadingEl.hidden = true;
  loadingEl.textContent = '업로드 중...';

  wrapImg.appendChild(inner);
  wrapImg.appendChild(loadingEl);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'app-btn app-btn--inline profile-avatar-edit-btn';
  editBtn.textContent = '✏️';
  editBtn.setAttribute('aria-label', '사진 변경');
  editBtn.title = '사진 변경';

  stack.appendChild(wrapImg);
  stack.appendChild(editBtn);

  const sheet = document.createElement('div');
  sheet.className = 'action-sheet';
  sheet.hidden = true;
  const sheetInner = document.createElement('div');
  sheetInner.className = 'action-sheet-inner app-box';
  sheet.appendChild(sheetInner);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.hidden = true;
  });

  function openPhotoSheet() {
    if (editBtn.disabled) return;
    sheetInner.replaceChildren();
    const h = document.createElement('div');
    h.className = 'action-sheet-title';
    h.textContent = '프로필 사진';
    sheetInner.appendChild(h);

    const bChange = document.createElement('button');
    bChange.type = 'button';
    bChange.className = 'app-btn';
    bChange.style.marginTop = '8px';
    bChange.textContent = '사진 변경';
    bChange.addEventListener('click', () => {
      sheet.hidden = true;
      fileInput.click();
    });
    sheetInner.appendChild(bChange);

    const bCancel = document.createElement('button');
    bCancel.type = 'button';
    bCancel.className = 'app-btn';
    bCancel.style.marginTop = '8px';
    bCancel.textContent = '취소';
    bCancel.addEventListener('click', () => {
      sheet.hidden = true;
    });
    sheetInner.appendChild(bCancel);

    sheet.hidden = false;
  }

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openPhotoSheet();
  });

  function setLoading(on) {
    loadingEl.hidden = !on;
    loadingEl.textContent = '업로드 중...';
    fileInput.disabled = on;
    editBtn.disabled = on;
  }

  function fillInnerFromSrc(src) {
    inner.replaceChildren();
    if (src) {
      const img = document.createElement('img');
      img.className = 'profile-avatar-img';
      img.src = src;
      img.alt = '프로필';
      img.referrerPolicy = 'no-referrer';
      img.draggable = false;
      img.addEventListener('error', () => {
        inner.replaceChildren(avatarPlaceholder());
      });
      inner.appendChild(img);
    } else {
      inner.appendChild(avatarPlaceholder());
    }
  }

  fillInnerFromSrc(vm.photoURL || '');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showAppToast('이미지는 5MB 이하만 올릴 수 있어요.');
      return;
    }
    sheet.hidden = true;
    const previewUrl = URL.createObjectURL(file);
    fillInnerFromSrc(previewUrl);
    setLoading(true);
    const r = await postProfileAvatar(file);
    URL.revokeObjectURL(previewUrl);
    setLoading(false);
    if (!r.ok) {
      const msg =
        r.error === 'file_too_large'
          ? '파일이 너무 커요 (최대 5MB).'
          : r.error === 'bad_file_type'
            ? 'JPG, PNG, WEBP만 올릴 수 있어요.'
            : r.error === 'no_profile'
              ? '프로필을 먼저 저장한 뒤 다시 시도해 주세요.'
              : r.error === 'avatar_required'
                ? '파일을 선택해 주세요.'
                : r.error === 'server_error'
                  ? '서버 오류로 업로드에 실패했어요.'
                  : r.status === 401
                    ? '로그인이 필요해요.'
                    : '업로드에 실패했어요. 잠시 후 다시 시도해 주세요.';
      showAppToast(msg);
      refresh();
      return;
    }
    const nextUrl = typeof r.photoURL === 'string' ? r.photoURL.trim() : '';
    api.state.profilePhotoURL = nextUrl;
    const uid = api.state.user?.uid;
    if (uid) patchUserRecord(uid, { profilePhotoURL: nextUrl });
    refresh();
  });

  box.appendChild(fileInput);
  box.appendChild(stack);
  box.appendChild(sheet);
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
    input.maxLength = 12;

    const errNick = document.createElement('p');
    errNick.className = 'profile-nick-error';
    errNick.hidden = true;
    errNick.setAttribute('role', 'alert');

    const actions = document.createElement('div');
    actions.className = 'profile-inline-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'app-btn app-btn--primary';
    save.textContent = '저장';
    save.addEventListener('click', async () => {
      errNick.hidden = true;
      errNick.textContent = '';
      const nv = validateNicknameLocal(input.value);
      if (!nv.ok) {
        errNick.textContent = '닉네임은 2~12자, 한글·영문·숫자만 사용할 수 있어요.';
        errNick.hidden = false;
        return;
      }
      const uid = api.state.user?.uid;
      const rec = uid ? getUserRecord(uid) : null;
      const body = {
        nickname: nv.nickname,
        photoURL: api.state.profilePhotoURL || api.state.user?.photoURL || rec?.profilePhotoURL || '',
        language: api.state.language || rec?.language || 'ko',
        selectedDuckId: api.state.selectedDuckId || rec?.selectedDuckId || 'bori',
      };
      const pr = await postProfile(body);
      if (!pr.ok) {
        if (pr.status === 409 && pr.error === 'nickname_taken') {
          errNick.textContent = '이미 사용 중인 닉네임입니다';
        } else if (pr.error === 'bad_nickname') {
          errNick.textContent = '닉네임은 2~12자, 한글·영문·숫자만 사용할 수 있어요.';
        } else {
          errNick.textContent = '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
        }
        errNick.hidden = false;
        return;
      }
      persistNickname(api.state, nv.nickname);
      onCancelEdit();
    });
    actions.appendChild(save);
    valueEl.appendChild(input);
    valueEl.appendChild(errNick);
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

    let pickedLang = vm.languageCode;
    const langPickerEl = createLanguagePicker(vm.languageCode, (code) => {
      pickedLang = code;
    });

    const actions = document.createElement('div');
    actions.className = 'profile-inline-actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'app-btn app-btn--primary';
    apply.textContent = '적용';
    apply.addEventListener('click', () => {
      persistLanguage(api.state, pickedLang);
      onCancelEdit();
    });
    actions.appendChild(apply);
    valueEl.appendChild(langPickerEl);
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
