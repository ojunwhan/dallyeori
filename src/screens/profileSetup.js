/**
 * 첫 로그인 프로필 설정 (모킹) — 닉네임·언어 확인 후 로비 진입
 */

import { LANGUAGES } from '../data/languages.js';
import { getToken, resolvePublicApiUrl } from '../services/auth.js';
import { saveUserRecord, getUserRecord, ensureUserFromAuth } from '../services/db.js';
import { postProfile, validateNicknameLocal } from '../services/profileApi.js';

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
export function mountProfileSetup(root, api) {
  const wrap = document.createElement('div');
  wrap.className = 'app-screen';

  const uid = api.state.user?.uid;
  if (!uid) {
    api.navigate('splash');
    return;
  }

  const nickError = document.createElement('p');
  nickError.className = 'profile-nick-error';
  nickError.setAttribute('role', 'alert');
  nickError.hidden = true;

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '프로필 설정';

  const sub = document.createElement('p');
  sub.className = 'app-muted';
  sub.textContent = '첫 방문이에요. 닉네임과 언어를 확인해 주세요.';

  let rec = getUserRecord(uid);
  if (!rec) rec = ensureUserFromAuth(api.state.user);

  const nickLabel = document.createElement('label');
  nickLabel.className = 'app-muted';
  nickLabel.textContent = '닉네임';
  nickLabel.style.display = 'block';
  nickLabel.style.marginTop = '12px';

  const nickInput = document.createElement('input');
  nickInput.type = 'text';
  nickInput.className = 'app-input';
  nickInput.value = rec?.nickname ?? api.state.user?.displayName ?? '';
  nickInput.autocomplete = 'nickname';
  nickInput.maxLength = 12;

  const langLabel = document.createElement('label');
  langLabel.className = 'app-muted';
  langLabel.textContent = '언어';
  langLabel.style.display = 'block';
  langLabel.style.marginTop = '12px';

  const langSelect = document.createElement('select');
  langSelect.className = 'app-input';
  fillLanguageSelect(langSelect, rec?.language ?? 'ko');

  const box = document.createElement('div');
  box.className = 'app-box';
  box.appendChild(nickLabel);
  box.appendChild(nickInput);
  box.appendChild(nickError);
  box.appendChild(langLabel);
  box.appendChild(langSelect);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'app-btn app-btn--primary';
  submit.style.marginTop = '16px';
  submit.textContent = '시작하기';
  submit.addEventListener('click', async () => {
    nickError.hidden = true;
    nickError.textContent = '';
    if (!rec) {
      api.navigate('splash');
      return;
    }
    const nickname = nickInput.value.trim() || api.state.user?.displayName || '';
    const nv = validateNicknameLocal(nickname);
    if (!nv.ok) {
      nickError.textContent = '닉네임은 2~12자, 한글·영문·숫자만 사용할 수 있어요.';
      nickError.hidden = false;
      return;
    }
    const language = langSelect.value || 'ko';
    const selectedDuckId = rec.selectedDuckId || 'bori';
    const photoURL = api.state.user?.photoURL || rec.profilePhotoURL || '';
    const body = { nickname: nv.nickname, photoURL, language, selectedDuckId };
    const pr = await postProfile(body);
    if (!pr.ok) {
      if (pr.status === 409 && pr.error === 'nickname_taken') {
        nickError.textContent = '이미 사용 중인 닉네임입니다';
      } else if (pr.error === 'bad_nickname') {
        nickError.textContent = '닉네임은 2~12자, 한글·영문·숫자만 사용할 수 있어요.';
      } else {
        nickError.textContent = '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
      }
      nickError.hidden = false;
      return;
    }
    const next = {
      ...rec,
      nickname: nv.nickname,
      language,
      profilePhotoURL: photoURL,
      profileSetupComplete: true,
    };
    saveUserRecord(next);
    api.state.nickname = next.nickname;
    api.state.language = language;
    api.state.profilePhotoURL = next.profilePhotoURL;
    api.state.profileSetupComplete = true;
    const t = getToken();
    if (t) {
      try {
        await fetch(resolvePublicApiUrl('/api/auth/complete-profile'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        console.warn('[profileSetup] complete-profile', e);
      }
    }
    api.navigate('lobby');
  });

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(box);
  wrap.appendChild(submit);
  root.appendChild(wrap);
}
