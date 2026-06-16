## 개요

빌드/감사 스크립트 전용 패키지가 `dependencies`에 분류되어 프로덕션 설치에 포함됩니다.

- 등급: **Low**
- 대상 파일: `package.json`

---

## 현재 동작

`dependencies`에 다음 빌드/도구 전용 패키지 존재:

- `playwright`, `jsdom`, `canvas`, `pdfjs-dist` — PDF 추출·시각 감사 스크립트(`scripts/*`)에서만 사용.
- 앱 런타임 의존(`react`, `react-dom`, `zustand`, `react-window`, `lodash-es`)과 빌드 도구(`vite`, `typescript`, `@vitejs/plugin-react`)가 한데 섞여 있음.

## 기대 동작

1. 스크립트 전용 패키지를 `devDependencies`로 이동.
2. 앱 런타임 의존과 빌드 도구를 명확히 구분.

---

## 우선순위

* [ ] 높음
* [ ] 보통
* [x] 낮음

## 영향 범위

* [ ] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [x] Documentation

## 완료 조건

* [ ] 빌드/감사 전용 패키지 `devDependencies` 이동
* [ ] 프로덕션 설치 용량 감소 확인

---

## 추가 참고자료

* `package.json` dependencies / devDependencies
