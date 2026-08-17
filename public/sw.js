// 달려오리 서비스워커 — PWA "홈화면 설치" 요건 + 최소 캐시(네트워크 우선)
const CACHE = 'dallyeori-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 게임은 실시간(소켓) 서비스라 항상 네트워크 우선.
  // 이 fetch 핸들러의 존재 자체가 '설치 가능' 요건을 충족시킨다.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
