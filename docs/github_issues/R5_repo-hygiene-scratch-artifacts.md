## 개요

스크래치/디버그 산출물이 git에 추적되어 저장소를 부풀리고 있습니다.

- 등급: **High** (위생/유지보수)
- 대상: 저장소 루트 및 `tmp/`, `docs/`

---

## 현재 동작

다음 파일들이 추적됨:

- `prompt-dump.txt`, `report-dump.txt`
- `test-bug.js`
- `qa_1000_audit_result.json`, `anomalies.json`, `validation_report.json`
- `tmp/**` (디버그 PNG, `tmp/visual-audit/*`, `tmp/marker-proof/*`)
- `docs/ISTQB_CBT_QA_Report.docx` (바이너리 문서)
- 일회성 스크립트 다수: `scripts/fix-csts-2402.js`, `fix-csts-2404.js`, `fix-csts-2405.js`, `fix-csts-formats.js`, `fix-subagent-csts.js` 등

`.vercelignore`가 `tmp/`를 배포에서만 제외할 뿐, git 추적은 그대로 남아 있음.

## 기대 동작

1. `.gitignore`에 `tmp/`, `*-dump.txt`, 임시 감사 결과 JSON 등을 추가.
2. 이미 추적 중인 산출물은 `git rm --cached`로 추적 해제.
3. 일회성 마이그레이션 스크립트는 `scripts/oneoff/`로 격리하거나 제거.

---

## 우선순위

* [x] 높음
* [ ] 보통
* [ ] 낮음

## 영향 범위

* [ ] Frontend
* [ ] Backend
* [ ] Database
* [ ] API
* [ ] Design
* [ ] Test
* [x] Documentation

## 완료 조건

* [ ] 스크래치/디버그 산출물 추적 해제 및 `.gitignore` 반영
* [ ] 일회성 스크립트 격리/정리

---

## 추가 참고자료

* `.vercelignore`(현재 `tmp/`, `docs/` 등 배포 제외)
