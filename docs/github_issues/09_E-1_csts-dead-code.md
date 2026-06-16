## 버그 개요

CSTS 관련 코드가 사실상 동작하지 않는 dead code 상태입니다. `index.html`에 대응 DOM(`#cstsPage`)이 없는데도 `script.js`에 다량의 CSTS DOM 참조·렌더링 코드가 남아 있습니다.

- 등급: **Medium**
- 대상 파일: `www/script.js`, `www/index.html`

---

## 현재 동작 (버그)

- `#cstsPage` DOM 요소가 `www/index.html`에 존재하지 않음.
- 그러나 `script.js`에 `cstsPage`, `cstsSetSelect`, `cstsSummary`, `cstsQuestionMeta` 등 CSTS 관련 참조·렌더링 함수가 대규모로 남아 있음 (약 line 337~910).
- 해당 DOM 조작이 optional chaining으로 null에 대해 조용히 실패 중 → 완전한 dead code는 아니나 유지보수 부담·혼란 유발.

## 기대 동작

1. CSTS 기능을 정식 지원하거나, 미지원이면 관련 dead code를 정리한다.
2. 어느 방향이든 코드와 DOM 구조가 일치한다.

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

* [ ] CSTS 코드의 지원/제거 방향이 결정됨
* [ ] 코드와 DOM 구조가 일치함
* [ ] 잔존 dead code가 정리됨

---

## 추가 참고자료

* 참고 문서: `docs/ISTQB_CBT_QA_Report.docx` ([E-1])
