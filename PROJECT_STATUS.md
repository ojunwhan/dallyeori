# 달려오리(dallyeori) 프로젝트 현황

클라이언트 루트(`dallyeori/`)와 서브모듈/동반 저장소 `dallyeori-server/` 기준으로 정리했습니다. (조사 시점: 2026-03)

---

## 1. 파일 구조 — `src/` 이하 전체 목록

### 클라이언트 — `dallyeori/src/`

| 경로 | 설명(역할) |
|------|------------|
| `app.js` | 앱 라우터·전역 `appState`·경주 마운트 |
| `main.js` | 엔트리 |
| `constants.js` | 오리·물리 상수 등 |
| `raceV3Inline.js` | 인라인 경주 캔버스 엔진 |
| `camera.js` | (레거시/엔진 보조) 카메라 |
| `duck.js` | 오리 스프라이트/상태 |
| `input.js` | 입력 |
| `layoutPortrait.js` | 세로 레이아웃 |
| `physics.js` | 클라 로컬 물리(비서버 경주용) |
| `renderer.js` | 렌더링 |
| `track.js` | 트랙 |
| `ui.js` | UI 조각 |
| `index.html` | HTML 셸 |
| `dallyeori-v3.html` | 경주 단독 페이지(레거시/빌드용) |
| `build-race-inline.mjs` | 인라인 번들 빌드 스크립트 |
| `data/shopItems.js` | 상점 아이템 정의 |
| `screens/chatRoom.js` | 1:1 채팅방 화면 |
| `screens/duckSelect.js` | 오리 선택 |
| `screens/friends.js` | 친구 |
| `screens/guestQrWait.js` | QR 게스트 대기 |
| `screens/heartShop.js` | 하트 상점 UI |
| `screens/lobby.js` | 로비(탭 허브) |
| `screens/matching.js` | 랜덤 매칭 대기 |
| `screens/messages.js` | 메시지 목록 |
| `screens/profile.js` | 프로필 화면 |
| `screens/profileSetup.js` | 최초 프로필 설정 |
| `screens/qrMatchHost.js` | QR/링크 호스트 방 |
| `screens/raceHistory.js` | 경주 기록 |
| `screens/ranking.js` | 랭킹 |
| `screens/rematchWait.js` | 재대전 대기 |
| `screens/result.js` | 경주 결과 |
| `screens/shop.js` | 꾸미기 상점 |
| `screens/splash.js` | 스플래시·OAuth 진입 |
| `screens/terrainSelect.js` | 지형 선택 |
| `services/auth.js` | JWT·OAuth URL·QR 쿼리 소비 |
| `services/chat.js` | 채팅 저장소 |
| `services/db.js` | 유저 레코드 localStorage |
| `services/friends.js` | 친구 로직 |
| `services/hearts.js` | 하트 earn/spend |
| `services/inventory.js` | 인벤토리 |
| `services/likes.js` | 호감(일일 제한) |
| `services/mockUsers.js` | 더미 유저 풀 |
| `services/monoTranslate.js` | 번역 API fetch |
| `services/profileViewModel.js` | 프로필 VM |
| `services/qrMatchApi.js` | QR 방 생성 REST |
| `services/raceHistory.js` | 경주 기록 CRUD |
| `services/ranking.js` | 랭킹 데이터 조합 |
| `services/socket.js` | Socket.IO·매칭·탭 emit |
| `services/toast.js` | 토스트 |
| `services/interfaces/auth.contract.js` | 인증 계약 타입 |
| `services/interfaces/db.contract.js` | DB 계약 타입 |
| `sprites/ori10Parts.js` | 스프라이트 파트 |
| `sprites/spriteSheet.js` | 스프라이트 시트 |
| `styles.css` | 전역 스타일 |

### 서버 — `dallyeori-server/src/`

| 경로 | 설명 |
|------|------|
| `index.js` | Express + Socket.IO 부트스트랩 |
| `auth/index.js` | `/api/auth` 라우터 조립 |
| `auth/google.js` | Google OAuth |
| `auth/kakao.js` | Kakao OAuth |
| `auth/oauthOrigin.js` | 리다이렉트용 public origin |
| `auth/session.js` | JWT 서명/검증·QR 게스트 토큰 |
| `game/matchmaker.js` | 큐·봇·방 생성 |
| `game/raceRoom.js` | 실시간 경주 방·틱·결과 |
| `game/physics.js` | 서버 측 오리 물리(클라 상수 미러) |
| `game/botPlayer.js` | 매칭 타임아웃 시 봇 탭 스케줄 |
| `game/qrMatch.js` | QR 대기실·게스트 조인 |

---

## 2. 화면(`screens/`) — 파일별 한 줄 요약

| 파일 | 한 줄 요약 |
|------|------------|
| `splash.js` | 구글/카카오 로그인 진입·세션 있으면 `navigateAfterAuth` |
| `profileSetup.js` | 최초 닉네임 등 프로필 완료 전 설정 |
| `lobby.js` | 메인 허브(경주·소셜·상점 탭) |
| `terrainSelect.js` | 랜덤 매칭 전 지형 선택 |
| `matching.js` | 소켓 매칭(또는 모킹) 대기·취소 |
| `rematchWait.js` | 재대전 요청 UI(서버 재대전은 제한적·모킹 폴백 존재) |
| `result.js` | 승패·거리·재도전/로비 이동 |
| `duckSelect.js` | 보유 오리 중 선택·저장 |
| `profile.js` | 전적·설정·프로필 편집 진입 |
| `friends.js` | 친구 목록·요청·검색(로컬+모킹 유저) |
| `messages.js` | 대화 목록(로컬 메타) |
| `chatRoom.js` | 1:1 채팅·번역(로컬 대화 저장) |
| `qrMatchHost.js` | QR/링크 방 생성·타이머·복사/공유·소켓 연결 후 API |
| `guestQrWait.js` | QR 게스트 `matchFound`까지 대기 후 경주로 이어짐 |
| `shop.js` | 꾸미기 상점·하트로 구매 |
| `heartShop.js` | 하트 충전(로컬 하트 정책) |
| `ranking.js` | 황금오리/리더보드 UI |
| `raceHistory.js` | 로컬 경주 기록 목록·필터 |

---

## 3. 서비스(`services/`) — 모킹 vs 실서버·역할

| 파일 | 실서버 / 모킹 | 한 줄 요약 |
|------|----------------|------------|
| `auth.js` | **실서버** OAuth 진입·클라 JWT 저장·`VITE_API_BASE_URL` | 로그인 리다이렉트·토큰·QR 쿼리 파싱 |
| `socket.js` | **실서버** Socket.IO (`VITE_SOCKET_URL`, 프로덕 동일 출처) + **옵션 모킹** | `ensureSocket`·`findMatch`·`tap`·QR 게스트 연결·`VITE_SOCKET_USE_MOCK` 시 로컬 매칭 |
| `qrMatchApi.js` | **실서버** `POST /api/qr-match/create` | 호스트 QR 방 생성 |
| `monoTranslate.js` | **실서버(선택)** `VITE_MONO_API_URL` 또는 `/api/translate` | 채팅 번역 fetch |
| `db.js` | **모킹(로컬)** localStorage | 유저 레코드·프로필 필드 |
| `hearts.js` | **모킹(로컬)** appState + localStorage 거래 로그 | 하트 차감/적립 |
| `friends.js` | **모킹** localStorage + `mockUsers` 검색 | 친구 요청/목록 |
| `chat.js` | **모킹** localStorage | 대화·차단 |
| `ranking.js` | **혼합** 보드는 `MOCK_USERS` + 내 평균은 `raceHistory` | 랭킹 리스트 조립 |
| `raceHistory.js` | **모킹** localStorage | 경주 기록 저장/조회 |
| `inventory.js` | **모킹** localStorage | 구매·장착 |
| `likes.js` | **모킹** localStorage | 일일 호감 |
| `mockUsers.js` | **모킹** 정적 배열 | 더미 유저 풀 |
| `profileViewModel.js` | 로컬 DB + appState | 프로필 화면용 스냅샷 |
| `toast.js` | UI만 | 전역 토스트 |
| `interfaces/*.js` | 타입/계약만 | 구현 아님 |

---

## 4. 서버 API — `dallyeori-server/src/index.js` 기준

### REST

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| `GET` | `/api/auth/google` | — | Google OAuth 시작 |
| `GET` | `/api/auth/google/callback` | — | 코드 교환·JWT 발급·클라이언트로 리다이렉트 |
| `GET` | `/api/auth/kakao` | — | Kakao OAuth 시작 |
| `GET` | `/api/auth/kakao/callback` | — | 토큰 교환·JWT 발급·리다이렉트 |
| `POST` | `/api/qr-match/create` | Bearer JWT(일반 유저만) | QR 대기 방 생성·`qrUrl`·`guestToken` |
| `GET` | `/qr/:matchCode?t=...` | 쿼리 JWT | 게스트 토큰 검증 후 클라 `/?qr=&t=`로 302 |
| `GET` | `/health` | — | `{ ok: true }` |

`auth` 세부 라우트는 `auth/google.js`, `auth/kakao.js`에 정의.

### Socket.IO — 클라이언트 → 서버 (`socket.on` 핸들러)

| 이벤트 | 설명 |
|--------|------|
| `findMatch` | `{ terrain, profile }` — 랜덤 매칭 큐 진입(qrGuest 불가) |
| `cancelMatch` | 매칭 큐 취소 + QR 대기 취소 |
| `qrMatchCancel` | 호스트 QR 대기만 취소 |
| `raceJoin` | `{ roomId, slot }` — 방 입장 확정 |
| `tap` | `{ roomId, slot, foot: 'left'|'right' }` |
| `requestRematch` | 상대에게 `rematchRequest` 브로드캐스트(qrGuest 불가) |
| `disconnect` | 큐/QR 정리(암시) |

### Socket.IO — 서버 → 클라이언트 (`emit`)

| 이벤트 | 출처 | 설명 |
|--------|------|------|
| `matchFound` | matchmaker / qrMatch | `roomId`, `slot`, `terrain`, `opponent`, `myDuckId` 등 |
| `qrMatchExpired` | qrMatch | 호스트 대기 시간 만료 |
| `qrJoinFailed` | qrMatch | 게스트 입장 실패 |
| `preRaceCountdown` | raceRoom | 시작 전 카운트다운 |
| `raceGo` | raceRoom | 본 경주 시작 |
| `raceTick` | raceRoom | `{ raceT, players }` 동기화 |
| `raceResult` | raceRoom | `{ winnerSlot, raceTime, distances, taps }` |
| `opponentTap` | raceRoom | 상대 탭 피드백 `{ fromSlot, foot }` |
| `rematchRequest` | index | `{ from: uid }` |

소켓 연결 시 핸드셰이크 `auth.token`으로 JWT 검증 후 `socket.data`에 `uid`, `qrGuest`, `qrMatchCode` 등 설정. `qrGuest`면 `qrMatch.tryJoinGuest` 큐잉.

---

## 5. 서버 게임 로직 — 핵심 요약

| 모듈 | 핵심 동작 |
|------|-----------|
| **matchmaker.js** | 지형별 큐에 소켓 등록·2명이면 `RaceRoom` 생성·30초 타임아웃 시 `botPlayer` 프로필로 봇 방(`_createRoomWithBot`)·`pairQrRoom`으로 QR 1:1 방·`socketRoom`으로 소켓↔방 매핑 |
| **raceRoom.js** | 양 플레이어 `raceJoin`으로 `playerJoined`·4초 프리카운트다운 후 `beginRacing`·16ms `tick`에서 `physics` 적분·봇 스케줄러·종료 시 `raceResult`·탭 시 `onTap` + `opponentTap` |
| **physics.js** | `TRACK_DISTANCE_M`, `RACE_TIME_LIMIT_SEC`, 지형별 마찰/미끄럼/벼랑 등 — 클라 `constants`와 맞춘 서버 권위 시뮬 |
| **botPlayer.js** | 지형별 탭 간격·미끄럼 확률로 `applyTap` 콜백 호출·`randomBotProfile`로 가짜 프로필 |
| **qrMatch.js** | 호스트 소켓 온라인 시 `createPending`·`QR_PENDING_MS`(3분) 타이머·게스트 소켓 연결 시 `tryJoinGuest`→`matchmaker.pairQrRoom`·만료/취소 시 `qrMatchExpired` 등 |

---

## 6. 인증

### 구글 / 카카오 OAuth 흐름

1. 클라 `auth.login()` → `GET /api/auth/google` 또는 `/api/auth/kakao`로 이동.
2. IdP 콜백 → 서버가 코드로 액세스 토큰 교환 → 사용자 정보 조회.
3. `session.signSessionToken`으로 JWT 발급 후 `publicAppOrigin(req)/#dallyeori_token=...` 로 리다이렉트.
4. 클라 `consumeOAuthReturn()`이 해시에서 JWT를 꺼내 `localStorage` 저장.

### JWT(세션) 구조

- 서버 `jsonwebtoken`으로 서명, `JWT_SECRET` 필수.
- 페이로드(일반): `uid`, `displayName`, `email`, `photoURL` — 만료 `7d`.
- `uid` 형식: `google:{id}` 또는 `kakao:{id}`.

### QR 게스트 JWT

- `signQrGuestToken(matchCode)`: `uid`=`guest:{uuid}`, `displayName`=`게스트_###`, `qrGuest: true`, `qrMatchCode`, 만료 `1h`.
- REST `POST /api/qr-match/create`는 일반 JWT만 허용(`qrGuest`면 403).
- 소켓은 게스트 JWT로 연결 후 서버가 `tryJoinGuest` 실행.

---

## 7. 실서버 연동 완료 vs 모킹/로컬

### 실서버(또는 설정 시 외부 API)에 붙는 것

- OAuth + 세션 JWT (`dallyeori-server` `/api/auth/*`)
- Socket.IO: 매칭, 경주, 탭 동기화, QR 게스트 조인
- `POST /api/qr-match/create`, (선택) `GET /qr/:code` 리다이렉트
- 번역: `monoTranslate.js` → 별도 `/api/translate` 또는 `VITE_MONO_API_URL`

### 클라이언트 로컬·모킹 위주인 것

- 전적/닉네임/오리/친구/채팅/인벤/하트/좋아요/랭킹 보드의 **대부분** — `localStorage` + `mockUsers`
- `VITE_SOCKET_USE_MOCK=true` 시 랜덤 매칭만 타이머+가짜 상대(서버 미사용)
- `startMockRematchRequest()` — 재대전 수락 시뮬레이션(랜덤)
- QR 게스트 경주 후 `saveRaceResult` 스킵(`qrGuestOneShot`) 등 정책은 클라 측

---

## 8. 앱 라우팅 — `app.js`의 `navigate(screen, payload)`

| `screen` | 동작 |
|----------|------|
| `splash` | `mountSplash` |
| `profileSetup` | `mountProfileSetup` |
| `lobby` | `mountLobby` |
| `terrainSelect` | `mountTerrainSelect` |
| `matching` | 지형·프로필 전역 설정 후 `mountMatching` |
| `rematchWait` | `mountRematchWait` |
| `race` | `runRace(payload)` — `#game-root`에 `raceV3Inline` 마운트·`emitRaceJoin` |
| `result` | `payload` 있으면 `lastRaceResult` 갱신 후 `mountResult` |
| `duckSelect` | `mountDuckSelect` |
| `profile` | `mountProfile` |
| `friends` | `mountFriends` |
| `messages` | `mountMessages` |
| `chatRoom` | `payload.peerId` → `_chatPeerId`, `mountChatRoom` |
| `qrMatchHost` | `mountQrMatchHost` |
| `guestQrWait` | `mountGuestQrWait` |
| `shop` | `mountShop` |
| `heartShop` | `mountHeartShop` |
| `ranking` | `mountRanking` |
| `raceHistory` | `mountRaceHistory` |
| *(default)* | 알 수 없는 이름 → `mountLobby` |

부트: `consumeOAuthReturn` → QR 쿼리 있으면 게스트 소켓·`guestQrWait` → 아니면 JWT 있으면 `navigateAfterAuth` → 없으면 `splash`.

---

## 9. 경주 엔진 `raceV3Inline.js` ↔ 서버

- **`app.js` `runRace`**: `globalThis.__dallyeoriPendingRace`에서 `socket`, `roomId`, `slot`, 오리 정보를 꺼내 `serverRace` 객체 구성. `emitTap` → `sendTap(foot, roomId, slot, socket)` → 소켓 **`emit('tap', { foot, roomId, slot })`** (서버 `foot`은 `'left'|'right'`).
- **서버 수신 이벤트**(소켓이 있을 때만 등록):  
  - `preRaceCountdown` → 로컬 카운트다운 상태  
  - `raceGo` → `state='racing'`, `raceT` 리셋  
  - `raceTick` → `serverRaceSnap` 갱신, `blendServerDucks`로 P/CPU 거리·자세 보간  
  - `raceResult` → `onServerRaceResult`: `winnerSlot`과 내 `myServerSlot`으로 승/패/무, `distances`/`taps`로 `serverFinishPayload` 구성 후 `ending` → `postRaceFinishToParent`에서 `onFinish` 호출
- **로컬 전용 모드**: `serverRace` 없으면 기존 CPU 탭 AI + 13초 타임업으로만 종료.
- **BroadcastChannel**: 임베드/다중 컨텍스트용 `dallyeori-race-finish`로 `raceFinish` 페이로드 수신 시 결과 화면으로 연결 가능.

---

## 10. CSS — `styles.css` 주요 섹션

| 구간(대략) | 구분 |
|------------|------|
| 파일头 ~ 약 280행 | 글로벌: `#app-root`, `#game-root`, `.app-screen`, 버튼·타이포·기본 레이아웃 |
| `/* ——— 로비 Phase 2-1 ——— */` (~281행~) | 로비·탭·카드 |
| `/* ——— Phase 4 소셜 ——— */` (~588행~) | 메시지·채팅 등 소셜 UI |
| `/* ——— 매칭 Phase 2-2 ——— */` (~1025행~) | 매칭 화면 |
| `/* ——— 결과 Phase 2-3 ——— */` (~1185행~) | 결과·재대전 대기 |
| `/* ——— Phase 3 상점 · 하트 충전 ——— */` (~1323행~) | 상점·하트 |
| `#game-canvas.is-hidden` 근처 | 게임 캔버스 표시 토글 |
| `/* 친구 — 거절 알림 */` | 친구 거절 스트립 |
| `/* 랭킹 — 황금오리 */` | 랭킹 카드·리스트 |
| `/* 경주 기록 */` (~1828행~) | 히스토리 카드·필터 |
| 기타 | QR 매치·게스트 대기 등은 위 Phase 블록 안에 클래스로 분산 |

---

## 부록: 환경 변수 요약

**클라(Vite)**  
`VITE_API_BASE_URL`, `VITE_SOCKET_URL`(빈 값이면 프로덕에서 동일 출처), `VITE_SOCKET_USE_MOCK`, `VITE_MONO_API_URL`

**서버**  
`PORT`, `JWT_SECRET`, `CLIENT_ORIGIN`(CORS, 콤마 구분), `GOOGLE_*`, `KAKAO_*`, `QR_CLIENT_BASE_URL` / `CLIENT_ORIGIN` 일부, 등 — 자세한 항목은 `dallyeori-server`의 `.env.example` 참고.
