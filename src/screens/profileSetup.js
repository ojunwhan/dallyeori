/**
 * 첫 로그인 프로필 설정 (모킹) — 닉네임·언어 확인 후 로비 진입
 */

import { LANGUAGES } from '../data/languages.js';
import { saveUserRecord, getUserRecord, ensureUserFromAuth } from '../services/db.js';

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

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = '프로필 설정';

  const sub = document.createElement('p');
  sub.className = 'app-muted';
  sub.textContent = '첫 방문이에요. 닉네임과 언어를 확인해 주세요.';

  const uid = api.state.user?.uid;
  if (!uid) {
    api.navigate('splash');
    return;
  }
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
  box.appendChild(langLabel);
  box.appendChild(langSelect);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'app-btn app-btn--primary';
  submit.style.marginTop = '16px';
  submit.textContent = '시작하기';
  submit.addEventListener('click', () => {
    if (!rec) {
      api.navigate('splash');
      return;
    }
    const nickname = nickInput.value.trim() || api.state.user?.displayName || '플레이어';
    const language = langSelect.value || 'ko';
    const next = {
      ...rec,
      nickname,
      language,
      profilePhotoURL: api.state.user?.photoURL || rec.profilePhotoURL,
      profileSetupComplete: true,
    };
    saveUserRecord(next);
    api.state.nickname = nickname;
    api.state.language = language;
    api.state.profilePhotoURL = next.profilePhotoURL;
    api.state.profileSetupComplete = true;
    api.navigate('lobby');
  });

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(box);
  wrap.appendChild(submit);
  root.appendChild(wrap);
}
