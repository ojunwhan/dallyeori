/**
 * 프로필 국가 선택 — 커스텀 드롭다운 (languagePicker와 동일 UX)
 */

import { COUNTRY_TOP_20, COUNTRY_CODES_REST } from '../data/countryCodesProfile.js';
import { alpha2ToRegionalFlag, flagToDisplayUrl } from '../utils/flagIcon.js';

const TOP_SET = new Set(COUNTRY_TOP_20.map((c) => c.code));

/**
 * @param {string} code
 */
function isKnownAlpha2(code) {
  const u = String(code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return false;
  return TOP_SET.has(u) || COUNTRY_CODES_REST.includes(u);
}

/**
 * @param {string} code
 */
function normalizeInitial(code) {
  const u = String(code || '').trim().toUpperCase();
  return isKnownAlpha2(u) ? u : '';
}

/**
 * @param {string} selectedCode - ISO alpha-2 대문자 또는 빈 문자열
 * @param {(code: string) => void} onChange
 * @returns {HTMLElement}
 */
export function createCountryPicker(selectedCode, onChange) {
  let currentCode = normalizeInitial(selectedCode);

  const root = document.createElement('div');
  root.className = 'country-picker';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'country-picker__trigger';

  const panel = document.createElement('div');
  panel.className = 'country-picker__panel';
  panel.hidden = true;
  panel.setAttribute('role', 'listbox');

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'country-picker__search';
  search.placeholder = '국가 검색';
  search.autocomplete = 'off';

  const listWrap = document.createElement('div');
  panel.appendChild(search);
  panel.appendChild(listWrap);
  root.appendChild(trigger);
  root.appendChild(panel);

  /** @type {((ev: MouseEvent) => void) | null} */
  let documentMousedown = null;

  function rowFlagImg(emoji, fallbackCode) {
    const url = flagToDisplayUrl(emoji || '', fallbackCode);
    if (url) {
      const img = document.createElement('img');
      img.className = 'country-picker__item-flag';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      return img;
    }
    if (emoji) {
      const sp = document.createElement('span');
      sp.className = 'country-picker__item-flag country-picker__item-flag--emoji';
      sp.textContent = emoji;
      sp.setAttribute('aria-hidden', 'true');
      return sp;
    }
    return null;
  }

  function updateTrigger() {
    trigger.replaceChildren();
    if (!currentCode) {
      const ph = document.createElement('span');
      ph.className = 'country-picker__trigger-label country-picker__trigger-label--placeholder';
      ph.textContent = '국가 선택 *';
      trigger.appendChild(ph);
    } else {
      const top = COUNTRY_TOP_20.find((c) => c.code === currentCode);
      const emoji = top ? top.flag : alpha2ToRegionalFlag(currentCode);
      const flagEl = rowFlagImg(emoji || '', currentCode);
      if (flagEl) trigger.appendChild(flagEl);
      const lab = document.createElement('span');
      lab.className = 'country-picker__trigger-label';
      lab.textContent = top ? `${top.labelKo} (${top.code})` : currentCode;
      trigger.appendChild(lab);
    }
    trigger.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
  }

  /**
   * @param {string} q
   */
  function filterCountries(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      return { topList: [...COUNTRY_TOP_20], restList: [...COUNTRY_CODES_REST] };
    }
    const topList = COUNTRY_TOP_20.filter(
      (c) => c.labelKo.toLowerCase().includes(term) || c.code.toLowerCase().includes(term),
    );
    const restList = COUNTRY_CODES_REST.filter((code) => code.toLowerCase().includes(term));
    return { topList, restList };
  }

  function renderList() {
    listWrap.replaceChildren();
    const { topList, restList } = filterCountries(search.value);

    /**
     * @param {string} code
     * @param {string} primary
     * @param {string} secondary
     * @param {string} emoji
     */
    function addRow(code, primary, secondary, emoji) {
      const item = document.createElement('div');
      item.className = 'country-picker__item';
      item.setAttribute('role', 'option');
      item.dataset.code = code;
      if (code === currentCode) item.classList.add('country-picker__item--selected');

      const flagEl = rowFlagImg(emoji, code);
      if (flagEl) item.appendChild(flagEl);

      const textWrap = document.createElement('div');
      textWrap.className = 'country-picker__item-text';
      const p = document.createElement('span');
      p.className = 'country-picker__item-native';
      p.textContent = primary;
      textWrap.appendChild(p);
      if (secondary) {
        const s = document.createElement('span');
        s.className = 'country-picker__item-name';
        s.textContent = secondary;
        textWrap.appendChild(s);
      }
      item.appendChild(textWrap);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        currentCode = code;
        onChange(currentCode);
        updateTrigger();
        closePanel();
        renderList();
      });
      listWrap.appendChild(item);
    }

    for (const c of topList) {
      addRow(c.code, c.labelKo, `(${c.code})`, c.flag);
    }
    if (topList.length > 0 && restList.length > 0) {
      const hr = document.createElement('hr');
      hr.className = 'country-picker__divider';
      listWrap.appendChild(hr);
    }
    for (const code of restList) {
      const emoji = alpha2ToRegionalFlag(code);
      addRow(code, code, `(${code})`, emoji);
    }

    if (topList.length === 0 && restList.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'country-picker__item';
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
    if (panel.hidden) openPanel();
    else closePanel();
  });

  search.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', () => renderList());

  updateTrigger();

  return root;
}
