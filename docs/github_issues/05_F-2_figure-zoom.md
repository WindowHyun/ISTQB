## 버그 개요

그림(figure) 확대 버튼이 가로 스크롤 컨테이너 밖으로 밀려 접근이 어렵고, hover 시 참조하는 CSS 변수(`--hover`)가 정의되어 있지 않습니다.

- 등급: **High**
- 대상 파일: `www/style.css`

---

## 재현 절차

1. 큰 그림이 포함된 문항을 연다 (특히 모바일/좁은 화면).
2. 확대 버튼의 위치와 hover 시 배경색을 확인한다.

## 현재 동작 (버그)

- `.question-figure`가 `overflow-x: auto`로 설정됨 (`style.css` 약 line 592).
- `.figure-zoom-btn`이 이미지 다음 `margin-top: 8px`로 배치되어, 넓은 이미지의 경우 스크롤 영역 밖으로 밀릴 수 있음 (약 line 625).
- `.figure-zoom-btn:hover { background: var(--hover); }`(약 line 633)에서 **`--hover` 변수가 `:root` 및 다크모드 블록 어디에도 정의되어 있지 않음** → hover 배경색이 적용되지 않음.

## 기대 동작

1. 확대 버튼이 항상 화면 안 접근 가능한 위치에 표시된다.
2. hover 시 정의된 색상으로 배경이 변경된다 (라이트/다크 모드 모두).

---

## 우선순위

* [x] 높음
* [ ] 보통
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

* [ ] 확대 버튼이 가로 스크롤과 무관하게 접근 가능함
* [ ] `--hover` 변수가 라이트/다크 모드에 정의됨
* [ ] 모바일 / 데스크톱 화면에서 정상 동작함
* [ ] 다크모드 대응됨

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` ([F-2])
* 관련 이슈: 다크모드 색상 누락 / 고아 CSS ([F-3])
