/**
 * 오리 전신 캐릭터 (10색) — 파스텔 배경 카드에 전신으로 표시
 * id는 DUCKS_NINE과 1:1 (tori/sori/mari/nuri/bori/yuri/nari/duri/ari/miri)
 */
import { DUCKS_NINE } from '../constants.js';
import tori from '../assets/ducks/face-tori.png';
import sori from '../assets/ducks/face-sori.png';
import mari from '../assets/ducks/face-mari.png';
import nuri from '../assets/ducks/face-nuri.png';
import bori from '../assets/ducks/face-bori.png';
import yuri from '../assets/ducks/face-yuri.png';
import nari from '../assets/ducks/face-nari.png';
import duri from '../assets/ducks/face-duri.png';
import ari from '../assets/ducks/face-ari.png';
import miri from '../assets/ducks/face-miri.png';

const FACE = { tori, sori, mari, nuri, bori, yuri, nari, duri, ari, miri };

/** 오리 id → 얼굴 이미지 URL (없으면 '') */
export function duckFaceUrl(id) {
  return FACE[id] || '';
}

/** hex(#RRGGBB) → 오리색 파스텔 그라데이션 배경 */
function pastelBg(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (a) =>
    `rgb(${Math.round(r * a + 255 * (1 - a))},${Math.round(g * a + 255 * (1 - a))},${Math.round(b * a + 255 * (1 - a))})`;
  return `linear-gradient(180deg, ${mix(0.08)}, ${mix(0.22)})`;
}

/**
 * 오리 전신을 파스텔 배경 카드로 표시한다.
 * @param {HTMLElement} circleEl - .duck-circle 엘리먼트
 * @param {string} id - 오리 id
 * @returns {boolean} 적용 여부
 */
export function applyDuckFace(circleEl, id) {
  const url = FACE[id];
  if (!circleEl || !url) return false;
  const duck = DUCKS_NINE.find((d) => d.id === id);
  const pastel = duck ? pastelBg(duck.color) : 'linear-gradient(180deg,#eef4fb,#dce9f5)';
  circleEl.classList.add('duck-circle--face');
  circleEl.style.backgroundColor = '';
  circleEl.style.backgroundImage = '';
  circleEl.style.background = 'transparent'; // 박스·배경 없이 오리만 (게임 화면 배경 위)
  // 오리는 자식 <img> — drop-shadow로 바닥 그림자를 넣어 입체감(2D→3D)
  let img = circleEl.querySelector('.duck-face-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'duck-face-img';
    img.alt = duck ? duck.name : '';
    circleEl.appendChild(img);
  }
  img.src = url;
  return true;
}
