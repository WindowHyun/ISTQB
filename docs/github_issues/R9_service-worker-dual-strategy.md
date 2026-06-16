## 개요

서비스워커 전략이 둘로 공존하고, Vite PWA manifest의 아이콘이 비어 있습니다.

- 등급: **Medium**
- 대상 파일: `service-worker.js`, `www/service-worker.js`, `vite.config.ts`

---

## 현재 동작

- 수기 작성 `service-worker.js`(레거시 앱, 루트/www)와 `vite-plugin-pwa`(`registerType: 'autoUpdate'`, React 빌드) 전략이 동시에 존재.
- 같은 스코프를 두 SW가 제어하면 캐시 무효화/업데이트 충돌 위험.
- `vite.config.ts`의 PWA `manifest.icons: []` — 설치형 PWA인데 아이콘 미정의.

## 기대 동작

1. 배포 형태별로 SW 소유권을 명확히 분리(레거시=수기 SW, React 빌드=vite-plugin-pwa) 또는 하나로 통일.
2. Vite PWA manifest에 아이콘 정의(기존 `icons/icon-192/512`).

---

## 우선순위

* [ ] 높음
* [x] 보통
* [ ] 낮음

## 영향 범위

* [x] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [ ] Documentation

## 완료 조건

* [ ] 단일 SW 소유권/스코프 명확화로 캐시 충돌 방지
* [ ] PWA manifest 아이콘 정의

---

## 추가 참고자료

* `vite.config.ts`(VitePWA 설정)
