# MONO 서버에 `/api/translate` 추가 (달려오리 연동)

달려오리 클라이언트는 `VITE_MONO_API_URL` 기준으로 `POST /api/translate` 를 호출합니다.

## 요청 / 응답

- **POST** `/api/translate`
- **Body (JSON):** `{ "text": string, "fromLang": string, "toLang": string, "tone": "casual" | "formal" }`
- **Response (JSON):** `{ "translated": string }`
- **에러 시:** `{ "error": string }` + 적절한 HTTP 상태코드

## CORS

달려오리 개발: `http://localhost:5173`  
프로덕션: 실제 클라이언트 오리진을 MONO의 `cors` 허용 목록에 추가하세요.

## 통합 방법

1. MONO 프로젝트에 이미 있는 **GPT/Groq 번역 함수**가 있으면, `translate-endpoint.snippet.js` 안의 `runTranslation` 부분을 그 호출로 교체하는 것이 가장 안전합니다.
2. 없으면 스니펫의 OpenAI 호출을 사용할 수 있습니다. MONO 서버 `.env`에 `OPENAI_API_KEY` 를 넣고, 기존 MONO가 쓰는 모델/엔드포인트와 충돌하지 않게 조정하세요.

## 파일

- `translate-endpoint.snippet.js` — Express 라우트 예시 (복사 후 MONO `server.js` 등에 붙여넣기)

**주의:** QR 통역·병원 등 기존 라우트/미들웨어는 수정하지 말고, **새 라우트만 추가**하세요.
