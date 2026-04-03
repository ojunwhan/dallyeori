/**
 * MONO(lingora.chat) Express 앱에 아래를 "추가"하세요.
 * - 기존 app.use(cors(...)) 가 localhost:5173 을 허용하는지 확인; 없으면 아래 corsOrigin 에 오리진 추가.
 *
 * 환경변수 (예시):
 *   OPENAI_API_KEY=...   (스니펫 기본 경로 사용 시)
 * 이미 MONO에 번역 유틸이 있으면 runTranslation 내부를 그 구현으로 바꾸세요.
 */

// --- 붙여넣기 시작: require 는 MONO 프로젝트 스타일에 맞게 조정 (import vs require) ---
const express = require('express');

async function runTranslation(text, fromLang, toLang, tone) {
  const toneRule =
    tone === 'formal'
      ? 'Use polite, formal register appropriate for the target language.'
      : 'Use casual, friendly register appropriate for the target language.';
  const system = `You are a professional translator. Translate the user's message from language code "${fromLang}" to "${toLang}". ${toneRule} Output ONLY the translated text, no quotes or explanation.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set (or wire runTranslation to your existing MONO translator)');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MONO_TRANSLATE_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200) || `OpenAI HTTP ${res.status}`);
  }
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (typeof out !== 'string' || !out.trim()) {
    throw new Error('Empty translation from model');
  }
  return out.trim();
}

/**
 * @param {import('express').Express} app
 */
function attachTranslateRoute(app) {
  app.post('/api/translate', express.json({ limit: '32kb' }), async (req, res) => {
    try {
      const { text, fromLang, toLang, tone } = req.body || {};
      if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'text required' });
      }
      const from = typeof fromLang === 'string' && fromLang ? fromLang : 'auto';
      const to = typeof toLang === 'string' && toLang ? toLang : 'en';
      const t = tone === 'formal' ? 'formal' : 'casual';
      const translated = await runTranslation(text.trim(), from, to, t);
      return res.json({ translated });
    } catch (e) {
      const msg = e && e.message ? String(e.message) : 'translate_failed';
      return res.status(502).json({ error: msg });
    }
  });
}

module.exports = { attachTranslateRoute, runTranslation };
// --- 붙여넣기 끝 ---
//
// 사용 예 (MONO server.js):
//   const { attachTranslateRoute } = require('./path/to/translate-endpoint.snippet');
//   attachTranslateRoute(app);
