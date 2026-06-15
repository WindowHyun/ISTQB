## 버그 개요

문제 데이터가 **세 곳에 중복 저장**되어 있고 내용이 서로 **다릅니다(동기화 안 됨)**. 이로 인해 한 곳을 수정해도 다른 진입점에는 반영되지 않으며, 웹/APK가 서로 다른 데이터를 보게 됩니다.

- 등급: **Critical (데이터 정합성 / 아키텍처)**

---

## 현재 상태

| 경로 | 사용처 | 비고 |
|------|--------|------|
| `www/data/**` | Capacitor APK (`www/script.js` → `./data/index.json`) | 가장 완전(최신) |
| `public/data/**` | 웹 운영 (루트 `script.js`, React loader `/data/index.json`) | 뒤처진 복사본 |
| `dist/data/**` | Vite 빌드 산출물 | 또 다른 복사본 |

### 근거
- 세 폴더 모두 각 626문항이나, 12개 파일 **전부** `www/data`가 `public/data`보다 줄 수가 많음 (예: `sample-b` www 2135줄 vs public 2019줄, `csts-2402` 3089 vs 3030). → `www/data`가 더 완전한 최신본, `public/data`는 과거 버전.
- 운영 경로 분석:
  - Vercel은 저장소 루트를 서빙(`outputDirectory: "."`). 루트 `./data`는 실제로 `DATA/`(원본 PDF 폴더)라 `index.json`이 없음 → 루트 `script.js`의 폴백 `./public/data/index.json`이 사용됨.
  - React loader(`src/features/quiz/quiz.loader.ts`)도 `/data/index.json`(= `public/data`)을 사용.
- 따라서 **웹 사용자는 `public/data`(뒤처진 데이터)를 보고**, APK 사용자는 `www/data`를 본다.

### 영향
- PDF 대조로 발견·수정한 데이터 오염(#46~#50)을 `www/data`에 적용해도 **웹에는 반영되지 않음**.
- `public/data`의 오염 상태는 별도이며 아직 검증되지 않음(www와 내용이 달라 동일하지 않을 수 있음).

---

## 기대 동작 / 해결 방향(논의)

1. **단일 정본(single source of truth) 확립**: 데이터 폴더를 하나로 정하고 나머지는 빌드/동기화 산출물로 처리(추적 제외 또는 자동 복사).
2. 후보: `www/data`를 정본으로 삼아 `public/data`(및 `dist/data`)를 동기화. (`www/data`가 가장 완전하므로)
3. 빌드/배포 파이프라인에서 정본 → 배포 경로로 자동 복사하도록 구성(수동 중복 관리 제거).

## 완료 조건

* [ ] 데이터 정본 경로 확정
* [ ] 나머지 경로를 정본과 동기화(또는 추적 제외)
* [ ] 웹/APK가 동일 데이터를 사용함을 확인
* [ ] #46~#50 수정이 운영 경로에 반영됨

---

## 추가 참고자료

* 관련 이슈: #46~#50 (데이터 오염) — 본 이슈 해결 없이는 웹에 반영되지 않음
