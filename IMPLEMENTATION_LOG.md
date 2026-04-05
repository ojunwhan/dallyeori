# 달려오리 구현 현황 (2026-04-05 기준)

본 문서는 저장소 `dallyeori`(클라이언트) 및 `dallyeori-server`(서버, 서브모듈/연동) 소스를 읽고 정리한 것이다. 인프라 IP·도메인은 코드·`.env.production` 주석·배포 대화 맥락을 참고했으며, 실제 운영 값은 환경마다 다를 수 있다.

---

## 서버 (`dallyeori-server`)

### 인증 (`auth/`)

| 파일 | 역할 |
|------|------|
| `auth/index.js` | `Router`로 Google/Kakao 라우트 마운트. `POST /complete-profile` — Bearer JWT 검증 후 `markProfileSetupComplete(uid)`, 응답에 `isNewUser: false` 포함. |
| `auth/google.js` | `GET /google` → Google OAuth authorize. `GET /google/callback` → code 교환, userinfo, `ensureAuthUser('google:'+id)`, `signSessionToken`, 리다이렉트 `CLIENT_ORIGIN/#dallyeori_token=...`. |
| `auth/kakao.js` | 동일 패턴으로 Kakao OAuth (`kauth.kakao.com`). |
| `auth/session.js` | `signSessionToken` / `verifySessionToken` (JWT, `JWT_SECRET`, 7d). `signQrGuestToken(matchCode)` — 게스트 uid, `qrGuest`, `qrMatchCode`, 1h. |
| `auth/userStore.js` | `data/dallyeori-users.json` — uid별 `profileSetupComplete`, `createdAt` 등. MONO/lingora DB와 분리된 달려오리 전용 최소 저장소. |
| `auth/oauthOrigin.js` | `publicAppOrigin(req)` — OAuth 콜백 후 프론트 리다이렉트용 origin. `CF-Visitor`, `X-Forwarded-*`, 비로컬 호스트는 https 강제. |

**미구현/TODO:** 서버 쪽 소스에 `TODO`/`FIXME` 주석 없음(검색 기준). 풀피처 계정 시스템·토큰 갱신·리프레시 토큰 저장 등은 범위 밖.

### 게임 (`game/`)

**`matchmaker.js`**

- **랜덤 매칭:** `enqueue(socket, terrain, profile)` — 지형별 큐, `socket.data.matchProfile` 저장, 2명이면 `_createHumanRoom`, 1명만 있으면 30초 후 `_timeoutMatch`로 봇 방(`_createRoomWithBot`).
- **QR 1:1:** `pairQrRoom` — `qrMatch.js`에서 호출, `_createHumanRoom`과 동등한 `matchFound` 시퀀스.
- **재매치:** `pairDirectRematch(terrain, socketA, socketB)` — 양쪽 `cleanupFinishedRoomForSocket` + `cancel(..., true)`, `getMatchProfile`로 엔트리 구성 후 `_createHumanRoom(..., { rematch: true })`. 로그: `REMATCH: entering`, `REMATCH profiles`, `REMATCH: emitting matchFound`.
- **`getMatchProfile(socket)`:** `socket.data.matchProfile` 우선, 없으면 `displayName`/`photoURL`/보리 폴백.

**`raceRoom.js`**

- `roomId` — `rm_${Date.now()}_${random}`. Socket room 채널 `race:${roomId}`.
- **페이즈:** `wait_join` → (양쪽 `raceJoin` 후) `pending_start` → 서버 카운트다운 3·2·1·0 → 250ms 후 `racing` → `done`.
- **틱:** `setInterval` **16ms** (`TICK_MS`), `stepDuck` + 봇 스케줄러, `raceTick` 브로드캐스트.
- **물리:** `physics.js`의 `applyTap`, `stepDuck`, 지형 `normalizeTerrainKey` (normal / ice / cliff / iceCliff).
- **`attachSocket`:** 이전 `socket.data.raceChannel`이 있으면 `leave` 후 새 채널 `join`.

**`physics.js`**

- 클라이언트 `constants.js`의 `RACE_ENGINE_PHYSICS`와 동일 계열 상수·지형 테이블. `TRACK_DISTANCE_M=70`, `RACE_TIME_LIMIT_SEC=13`.

**`botPlayer.js`**

- 타임아웃 매칭 시 CPU 탭 스케줄.

**`qrMatch.js`**

- 대기 만료 **180초** (`QR_PENDING_MS`). `createPending` / `tryJoinGuest` / `pairQrRoom` 연동.

### 소켓 이벤트 목록

**클라이언트 → 서버**

| 이벤트 | 페이로드(요지) | 처리 |
|--------|----------------|------|
| `syncMatchProfile` | `{ profile }` | `applyClientMatchProfile` |
| `findMatch` | `terrain`, `profile` | `matchmaker.enqueue` |
| `cancelMatch` | — | QR 대기 취소 + `matchmaker.cancel` |
| `qrMatchCancel` | — | QR 대기만 취소 |
| `raceJoin` | `roomId`, `slot` 0\|1 | `socketRoom` 일치 시 `playerJoined` + `syncClient` |
| `tap` | `roomId`, `foot`, `slot` | 방·페이즈·매핑 검증 후 `room.onTap` |
| `sendChat` | `toUid`, `text`, 선택 `translatedText` | 수신자 소켓에 릴레이, 언어 다르면 `lingora.chat/api/translate` 호출 |
| `sendFriendRequest` | `targetUid`, `requestId` | 상대 uid 전 소켓에 `receiveFriendRequest` |
| `sendRematch` | `targetUid`, 선택 `profile` | 프로필 병합 후 상대에 `receiveRematch` |
| `acceptRematch` | `peerUid`, `terrain`, 선택 `profile` | 수락자 프로필 병합, `pickNewestConnectedSocket(peer)` + `pairDirectRematch` |
| `sendHeart` | `targetUid` | 상대 소켓에 `receiveHeart` |

**서버 → 클라이언트**

| 이벤트 | 비고 |
|--------|------|
| `matchFound` | `roomId`, `slot`, `terrain`, `myDuckId`, `opponent` |
| `countdown` | `count`, 선택 `sync` |
| `race-start`, `raceGo` | — |
| `raceTick` | `raceT`, `players` |
| `peerTap` | `slot`, `foot` |
| `raceResult` | 승자·거리·탭 수 등 |
| `receiveChat` | 메시지 객체 |
| `chatSent` | 발신자 에코 |
| `receiveFriendRequest` | — |
| `receiveRematch` | `senderUid`, `senderName` |
| `receiveHeart` | — |
| `qrMatchExpired` | QR 대기 만료 |

### 번역 연동 (채팅)

- **서버 `sendChat`:** 발신·수신 소켓의 `socket.data.language`가 다르면 `fetch('https://lingora.chat/api/translate', { text, fromLang, toLang, tone:'casual' })`, 성공 시 `translatedText`를 메시지에 넣어 `receiveChat` 전달. 같으면 번역 스킵 로그.
- **클라이언트 `monoTranslate.js`:** UI에서 직접 번역 시 `VITE_MONO_API_URL` 또는 동일 출처 `/api/translate` (nginx가 MONO로 프록시한다는 가정, `.env.production` 주석 참고).

### 데이터 저장

- **유저:** `auth/userStore.js` → `dallyeori-users.json` (프로필 완료 플래그 등만, 오리/닉 상세 아님).
- **메시지:** 서버 **영구 저장 없음**. 실시간 릴레이만. 클라이언트 `localStorage`에 대화 보관(`chat.js`).

---

## 클라이언트 (`src/`)

**엔트리:** 앱은 `app.js`가 DOM에 마운트(스플래시 이후 라우팅). `main.js`는 별도 캔버스 데모/레거시 트랙용.

### 화면 (`screens/`)

| 파일 | 핵심 | 연동 서비스 |
|------|------|-------------|
| `splash.js` | OAuth 진입, `navigateAfterAuth` | `auth.js`, `db.js` |
| `profileSetup.js` | 최초 프로필, `complete-profile` API | `auth`, `db` |
| `lobby.js` | 허브 | `navigate`, 상태 |
| `terrainSelect.js` | 지형 선택 | `appState.terrain` |
| `matching.js` | 랜덤 매칭, `startMockRandomMatch` / `findMatch` | `socket.js` |
| `rematchWait.js` | 재매치 대기, 120초 후 로비 | — |
| `race` | `app.js`의 `runRace` + `raceV3Inline` | `socket`, `hearts` |
| `result.js` | 승패, `emitSendRematch`, 친구/하트/채팅 | `socket`, `friends`, `likes`, `chat` |
| `duckSelect.js` | 오리 선택 | `db`, `appState` |
| `profile.js` | 프로필 편집 | `db` |
| `friends.js` | 친구 목록·요청 | `friends.js`, `socket` |
| `messages.js` | 대화 목록 | `chat.js` |
| `chatRoom.js` | 1:1 채팅 UI | `chat.js`, `monoTranslate` |
| `qrMatchHost.js` | QR 호스트, `qrMatchApi` | `socket`, `qrMatchApi` |
| `guestQrWait.js` | QR 게스트 대기 | `socket` |
| `shop.js` / `heartShop.js` | 상점·하트 패키지(표시) | `hearts`, `inventory` |
| `ranking.js` / `raceHistory.js` | 랭킹·기록 UI | `ranking.js`, `raceHistory.js` |

### 서비스 (`services/`)

- **`auth.js`:** JWT `localStorage`, `consumeOAuthReturn` 해시, `consumeQrGuestParams`, `apiBase`/`resolvePublicApiUrl`, `login` 리다이렉트.
- **`socket.js`:** `socket.io-client`, `ensureSocket`/`openGameSocket`, `attachGlobalMatchFoundBridge`(`matchFound` → `__dallyeoriPendingRace` + `setServerMatchFoundNavigate`), `emitSyncMatchProfileToServer`, `buildLocalMatchProfilePayload`, `sendRematch`/`acceptRematch`에 `profile` 동봉, `receiveRematch`/`receiveChat` 등 릴레이, `findMatch`, `emitRaceJoin`, `sendTap`, 모킹 매칭 `VITE_SOCKET_USE_MOCK`.
- **`db.js`:** `localStorage` `dallyeori.db.users` — `UserRecord`(닉네임, `selectedDuckId`, 전적, 하트, 차단 목록, `translateTone` 등). Firestore 등으로 교체 가능한 계약 주석.
- **`chat.js`:** 대화·메타·차단 `localStorage`, `sendMessage` 시 `sendChat` emit, 수신은 `dallyeori-receiveChat` 윈도 이벤트로 동기화. 오프라인 시 모킹 자동응답.
- **`friends.js`:** 로컬 친구/요청 상태.
- **`likes.js`:** 일일 하트 전송 제한 등 로컬 로직 + `sendHeart` emit.
- **`hearts.js`:** 하트 적립/소비, 거래 내역 로컬, `IAP_PACKAGES` 정의(결제 연동은 별도).
- **`qrMatchApi.js`:** `POST /api/qr-match/create` (Bearer).
- **`mockUsers.js`:** 개발/폴백용 가상 유저.
- **`ranking.js` / `raceHistory.js` / `profileViewModel.js` / `inventory.js`:** 주로 로컬 또는 경량 API 가정.

### 레이스 엔진

- **`raceV3Inline.js`:** Vite 앱 내 풀스크린 캔버스. `RACE_ENGINE_PHYSICS`(`constants.js`)로 지형. **서버 모드** 시 `blendServerDucks`: 내 오리 **dist 0.7** / **vel·lateral 등 0.48** lerp 서버 스냅샷, 상대 **dist**는 `oppDistAlpha=min(1,12*dt)` 등으로 추종. `TIME_LIMIT=13`, 카운트다운은 서버 `countdown` 동기.
- **`constants.js`:** `RACE_ENGINE_PHYSICS` 키 — `DUCK_MASS`, `TAP_FORCE`, `MAX_SPEED`, `AIR_RESISTANCE`, `SAME_FOOT_ANGLE`, `ANGLE_RECOVERY`, `STUMBLE_*`, `TERRAIN.normal|ice|cliff|iceCliff`. 별도 `PHYSICS`(레거시 트랙), `DUCKS_NINE`, `TRACK_DISTANCE_M`, `RACE_TIME_LIMIT_SEC` 등.

### QR 대전

- 호스트: 로그인 소켓 필수, `createPending` → QR URL(`?qr=&t=`), 게스트 JWT 1h, 대기 **3분** 만료 시 `qrMatchExpired`.
- 게스트: URL 쿼리로 진입 → `connectQrGuestSocket`, `tryJoinGuest`로 `pairQrRoom`.
- `GET /qr/:matchCode?t=` — 검증 후 클라이언트 베이스로 리다이렉트.

### 하트·경제

- **클라이언트:** `hearts.js`로 잔액·거래 로컬 관리, 레이스 보상·부활 소비 등. `IAP_PACKAGES`는 UI/가격 정의 수준.
- **서버:** `sendHeart`는 실시간 토스트용 이벤트만, 잔액 동기화 DB 없음.

### 소셜

- **친구:** 로컬 상태 + `sendFriendRequest` / `receiveFriendRequest` 소켓.
- **하트:** `likes.js` + `sendHeart` / `receiveHeart`.
- **메시지:** 로컬 스레드 + 소켓 릴레이, 서버 비저장.
- **프로필:** `db` + 서버 `complete-profile` / JWT 클레임.

---

## 인프라 (코드·주석·배포 맥락 요약)

| 항목 | 내용 |
|------|------|
| STAGING IP | 대화 맥락: `43.201.103.166` (저장소에 하드코딩 없음) |
| 클라이언트 배포 경로(예시) | `/var/www/dallyeori/`, `pm2` 프로세스명 `dallyeori` |
| 서버 포트 | 기본 `3100` (`PORT` env) |
| `.env.production` (클라) | `VITE_API_BASE_URL`, `VITE_SOCKET_URL` 비우면 동일 출처; `dallyeori.com` / `duck.lingora.chat` 언급. `VITE_MONO_API_URL` 비우면 `/api/translate` → nginx가 MONO(주석상 3174)로 프록시 가정. |
| nginx | API·`socket.io`·번역 프록시는 서버 설정 파일은 본 저장소에 없음(`mono-server-patch` 폴더 참고). |
| Cloudflare | `oauthOrigin.js` — `CF-Visitor`, https 강제. |
| OAuth 콜백 | Google/Kakao: `{publicAppOrigin}/api/auth/{provider}/callback` → 성공 시 `{origin}/#dallyeori_token=...` |

---

## `package.json` 요약

**클라이언트 (`dallyeori`):** `vite` 빌드, 의존성 `socket.io-client`, `qrcode`.

**서버 (`dallyeori-server`):** `express`, `socket.io`, `jsonwebtoken`, `axios`, `cors`, `dotenv`. 스크립트 `start` / `dev`(`node --watch`).

---

## 미구현 / TODO 목록

### 소스 내 `TODO` (프로젝트 `src`·`dallyeori-server/src` 한정)

- `src/screens/messages.js` — 대화 삭제/동기화: *「서버 API 연동 필요 — 현재는 나에게서 삭제와 동일」*.

### 설계상 미구현·로컬 한정(코드 구조 기준)

- 서버 DB **메시지 영구 저장**.
- **하트 경제** 서버 권위·동기화, 실결제 **IAP** 연동.
- **푸시 알림**.
- **Unity** 이식은 `RACE_ENGINE_PHYSICS` 주석으로만 언급, 별도 Unity 프로젝트 없음.
- Firebase: `.env.example`에 키 플레이스홀더만 있고 앱 코드에서 필수 사용 여부는 본 문서 범위에서 미확인.

---

*문서 생성: 저장소 정적 분석. 런타임 환경 변수·nginx·PM2 상세는 서버 실제 설정을 따른다.*
