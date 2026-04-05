/**
 * 커스텀 언어 선택 드롭다운 (Vanilla DOM)
 */

import { LANGUAGES } from '../data/languages.js';

/**
 * @param {string} code
 */
function normalizeCode(code) {
  return LANGUAGES.some((l) => l.code === code) ? code : 'ko';
}

/**
 * createLanguagePicker(selectedCode, onChange)
 * @param {string} selectedCode - 현재 선택된 언어 코드 (예: 'ko')
 * @param {(code: string) => void} onChange - 선택 변경 콜백
 * @returns {HTMLElement} - 드롭다운 컨테이너 DOM
 */
export function createLanguagePicker(selectedCode, onChange) {
  let currentCode = normalizeCode(selectedCode);

  const root = document.createElement('div');
  root.className = 'lang-picker';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'lang-picker__trigger';

  const panel = document.createElement('div');
  panel.className = 'lang-picker__panel';
  panel.hidden = true;
  panel.setAttribute('role', 'listbox');

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'lang-picker__search';
  search.placeholder = '언어 검색';
  search.autocomplete = 'off';

  const listWrap = document.createElement('div');

  panel.appendChild(search);
  panel.appendChild(listWrap);

  root.appendChild(trigger);
  root.appendChild(panel);

  /** @type {((ev: MouseEvent) => void) | null} */
  let documentMousedown = null;

  function updateTrigger() {
    const lang = LANGUAGES.find((l) => l.code === currentCode);
    trigger.textContent = lang ? `${lang.flag} ${lang.nativeName}` : currentCode;
    trigger.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  }

  /**
   * @param {string} q
   */
  function filterLangs(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      return {
        t1: LANGUAGES.filter((l) => l.tier === 1),
        t2: LANGUAGES.filter((l) => l.tier === 2),
      };
    }
    const match = (l) =>
      l.nativeName.toLowerCase().includes(term) || l.name.toLowerCase().includes(term);
    return {
      t1: LANGUAGES.filter((l) => l.tier === 1 && match(l)),
      t2: LANGUAGES.filter((l) => l.tier === 2 && match(l)),
    };
  }

  function renderList() {
    listWrap.replaceChildren();
    const { t1, t2 } = filterLangs(search.value);

    /** @param {{ code: string, flag: string, nativeName: string, tier: number }} lang */
    function addItem(lang) {
      const item = document.createElement('div');
      item.className = 'lang-picker__item';
      item.setAttribute('role', 'option');
      item.textContent = `${lang.flag} ${lang.nativeName}`;
      item.dataset.code = lang.code;
      if (lang.code === currentCode) item.classList.add('lang-picker__item--selected');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        currentCode = lang.code;
        onChange(currentCode);
        updateTrigger();
        closePanel();
        renderList();
      });
      listWrap.appendChild(item);
    }

    for (const lang of t1) addItem(lang);
    if (t1.length > 0 && t2.length > 0) {
      const hr = document.createElement('hr');
      hr.className = 'lang-picker__divider';
      listWrap.appendChild(hr);
    }
    for (const lang of t2) addItem(lang);

    if (t1.length === 0 && t2.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lang-picker__item';
      empty.style.cursor = 'default';
      empty.style.color = '#888';
      empty.textContent = '검색 결과 없음';
      listWrap.appendChild(empty);
    }
  }

  function closePanel() {
    panel.hidden = true;
    updateTrigger();
    if (documentMousedown) {
      document.removeEventListener('mousedown', documentMousedown, true);
      documentMousedown = null;
    }
  }

  function openPanel() {
    panel.hidden = false;
    search.value = '';
    renderList();
    updateTrigger();
    documentMousedown = (ev) => {
      if (!root.contains(/** @type {Node} */ (ev.target))) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', documentMousedown, true);
    search.focus();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  search.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', () => renderList());

  updateTrigger();

  return root;
}
