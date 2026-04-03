/**
 * MONO(lingora.chat) 번역 REST API — 클라이언트에서 직접 호출
 * 서버: POST {base}/api/translate — MONO 인스턴스에 라우트 추가 필요 (mono-server-patch 참고)
 */

/**
 * @param {string} text
 * @param {string} fromLang ISO 코드 (ko, en, ja …)
 * @param {string} toLang
 * @param {'casual'|'formal'} [tone]
 * @returns {Promise<string>}
 */
export async function translateMessage(text, fromLang, toLang, tone = 'casual') {
  const raw = import.meta.env.VITE_MONO_API_URL;
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
  /** 비우면 동일 출처 /api/translate (nginx에서 MONO 등으로 프록시) */
  const translateUrl = base ? `${base}/api/translate` : '/api/translate';
  const body = {
    text: String(text || '').trim(),
    fromLang: String(fromLang || 'ko'),
    toLang: String(toLang || 'ko'),
    tone: tone === 'formal' ? 'formal' : 'casual',
  };
  if (!body.text) {
    throw new Error('번역할 텍스트가 비어 있습니다.');
  }
  const response = await fetch(translateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let msg = `번역 서버 오류 (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody && typeof errBody.error === 'string') msg = errBody.error;
    } catch {
      try {
        const t = await response.text();
        if (t) msg = t.slice(0, 200);
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  const data = await response.json();
  if (data == null || typeof data.translated !== 'string') {
    throw new Error('번역 응답 형식이 올바르지 않습니다.');
  }
  return data.translated.trim();
}
