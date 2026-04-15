/**
 * 커스텀 언어 선택 드롭다운 (Vanilla DOM)
 */

import { LANGUAGES } from '../data/languages.js';
import { flagToDisplayUrl } from '../utils/flagIcon.js';

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
    trigger.replaceChildren();
    const lang = LANGUAGES.find((l) => l.code === currentCode);
    if (!lang) {
      trigger.textContent = currentCode;
    } else {
      const url = flagToDisplayUrl(lang.flag, null);
      if (url) {
        const img = document.createElement('img');
        img.className = 'lang-picker__trigger-flag';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        trigger.appendChild(img);
      } else if (lang.flag) {
        const sp = document.createElement('span');
        sp.className = 'lang-picker__trigger-flag lang-picker__trigger-flag--emoji';
        sp.textContent = lang.flag;
        sp.setAttribute('aria-hidden', 'true');
        trigger.appendChild(sp);
      }
      const lab = document.createElement('span');
      lab.className = 'lang-picker__trigger-label';
      lab.textContent = lang.nativeName;
      trigger.appendChild(lab);
    }
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
      l.nativeName.toLowerCase().includes(term) ||
      l.name.toLowerCase().includes(term) ||
      l.code.toLowerCase().includes(term);
    return {
      t1: LANGUAGES.filter((l) => l.tier === 1 && match(l)),
      t2: LANGUAGES.filter((l) => l.tier === 2 && match(l)),
    };
  }

  function renderList() {
    listWrap.replaceChildren();
    const { t1, t2 } = filterLangs(search.value);
    const t2Sorted = [...t2].sort((a, b) => a.code.localeCompare(b.code));

    /** @param {{ code: string, flag: string, name: string, nativeName: string, tier: number }} lang */
    function addItem(lang) {
      const item = document.createElement('div');
      item.className = 'lang-picker__item';
      item.setAttribute('role', 'option');
      item.dataset.code = lang.code;
      if (lang.code === currentCode) item.classList.add('lang-picker__item--selected');

      const url = flagToDisplayUrl(lang.flag, null);
      if (url) {
        const img = document.createElement('img');
        img.className = 'lang-picker__item-flag';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        item.appendChild(img);
      } else if (lang.flag) {
        const sp = document.createElement('span');
        sp.className = 'lang-picker__item-flag lang-picker__item-flag--emoji';
        sp.textContent = lang.flag;
        sp.setAttribute('aria-hidden', 'true');
        item.appendChild(sp);
      }

      const textWrap = document.createElement('div');
      textWrap.className = 'lang-picker__item-text';
      const nat = document.createElement('span');
      nat.className = 'lang-picker__item-native';
      nat.textContent = lang.nativeName;
      const nm = document.createElement('span');
      nm.className = 'lang-picker__item-name';
      nm.textContent = lang.name;
      textWrap.appendChild(nat);
      textWrap.appendChild(nm);
      item.appendChild(textWrap);

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
    if (t1.length > 0 && t2Sorted.length > 0) {
      const hr = document.createElement('hr');
      hr.className = 'lang-picker__divider';
      listWrap.appendChild(hr);
    }
    for (const lang of t2Sorted) addItem(lang);

    if (t1.length === 0 && t2Sorted.length === 0) {
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
