## 버그 개요

다크모드에서 일부 색상 변수가 누락되어 있고, 사용되지 않는 고아(orphan) CSS가 잔존합니다.

- 등급: **Medium**
- 대상 파일: `www/style.css`

---

## 현재 동작 (버그)

- `@media (prefers-color-scheme: dark)` 블록(`style.css` 약 line 1999~2102)에서 CSS 변수를 재정의하나, `--hover` 등 일부 변수가 라이트/다크 양쪽 모두 누락됨 (`.figure-zoom-btn:hover`에서 참조).
- 사용처 없는 고아 CSS 규칙이 다수 잔존 (리포트 기준 약 40줄 규모, 정확한 범위는 정리 시 확인 필요).

## 기대 동작

1. 다크모드에서 사용되는 모든 색상 변수가 정의된다.
2. 사용되지 않는 고아 CSS를 제거해 유지보수성을 높인다.

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
* [x] Design
* [ ] Test
* [ ] Documentation

## 완료 조건

* [ ] 누락 변수(`--hover` 등)가 정의됨
* [ ] 고아 CSS가 제거됨
* [ ] 라이트/다크 모드 모두 시각적 회귀 없음

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` ([F-3])
* 관련 이슈: 그림 확대 버튼 / `--hover` 변수 ([F-2])
