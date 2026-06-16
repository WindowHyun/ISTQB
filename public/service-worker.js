// Tombstone service worker (레거시 → React 배포 전환용).
//
// 과거 운영 배포는 루트 정적 레거시 앱이었고, 그 서비스워커가
// `/service-worker.js`(scope `/`)로 등록돼 브라우저에 남아 있다. 운영 배포가
// React(dist) 앱으로 전환된 뒤에도 이 구 SW가 캐시 우선으로 옛 앱을 계속
// 서빙해 사용자가 신버전을 못 보거나, 더 이상 존재하지 않는 자산(예:
// /data/istqb/figures/*.png)을 요청하며 404가 발생한다.
//
// 이 파일은 그 자리(`/service-worker.js`)에 배포되어, 구 SW의 업데이트 체크 시
// 교체된 뒤 스스로 등록 해제하고 모든 캐시를 비운 다음 열린 탭을 새로고침한다.
// 새 React 앱은 별도 경로(`/sw.js`)의 서비스워커를 사용하므로 충돌하지 않는다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
      } catch (err) {
        // 정리 실패는 치명적이지 않다. 다음 방문에서 재시도된다.
      }
    })()
  );
});
