/**
 * ori10.png — 라임(#00FF00 근처) 크로마키 후 몸통·좌·우 다리 캔버스 추출
 * 원본 2800×1504 기준 크롭 좌표(에셋 레이아웃 고정)
 */

const SRC_W = 2800;
const SRC_H = 1504;

/** #00FF00 + JPEG/압축 편차 허용 */
function isChromaGreen(r, g, b) {
  return r < 56 && g > 210 && b < 56;
}

function applyChromaKeyToCanvas(c) {
  const ctx = c.getContext('2d');
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (isChromaGreen(d[i], d[i + 1], d[i + 2])) d[i + 3] = 0;
  }
  ctx.putImageData(imgData, 0, 0);
}

function cropToCanvas(sourceCanvas, sx, sy, sw, sh) {
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/**
 * @param {HTMLImageElement} img
 */
export function buildOri10PartPack(img) {
  if (img.naturalWidth !== SRC_W || img.naturalHeight !== SRC_H) {
    console.warn('[ori10] 예상 크기와 다름:', img.naturalWidth, img.naturalHeight);
  }

  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  const fctx = full.getContext('2d');
  fctx.drawImage(img, 0, 0);
  applyChromaKeyToCanvas(full);

  const bodyR = { sx: 1037, sy: 61, sw: 780, sh: 811 };
  const legLR = { sx: 645, sy: 913, sw: 458, sh: 546 };
  const legRR = { sx: 1735, sy: 961, sw: 1001, sh: 498 };

  const body = cropToCanvas(full, bodyR.sx, bodyR.sy, bodyR.sw, bodyR.sh);
  const legL = cropToCanvas(full, legLR.sx, legLR.sy, legLR.sw, legLR.sh);
  const legR = cropToCanvas(full, legRR.sx, legRR.sy, legRR.sw, legRR.sh);

  const bodyPivotX = 1406.5 - bodyR.sx;
  const bodyPivotY = 871 - bodyR.sy;
  const legLPivotX = 800 - legLR.sx;
  const legLPivotY = 0;
  const legRPivotX = 1985.5 - legRR.sx;
  const legRPivotY = 0;

  return {
    body,
    legL,
    legR,
    bodyPivotX,
    bodyPivotY,
    legLPivotX,
    legLPivotY,
    legRPivotX,
    legRPivotY,
    bw: bodyR.sw,
    bh: bodyR.sh,
    lw: legLR.sw,
    lh: legLR.sh,
    rw: legRR.sw,
    rh: legRR.sh,
  };
}

export function loadOri10PartPack(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        resolve(buildOri10PartPack(img));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('ori10 load failed: ' + url));
    img.src = url;
  });
}
