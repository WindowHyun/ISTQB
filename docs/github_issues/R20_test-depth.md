## 개요

자동화 테스트가 얕아 "동작한다"는 거짓 안심 위험.

- 등급: **Medium** (진행 중 — GitHub #76)

---

## 공백
- React E2E가 렌더-온리(답선택·채점·모드 미검증).
- 핵심 로직(store/storage/QuestionCard/useQuestions) 유닛 미테스트.
- 레거시 `script.js`(3500줄) 테스트 0건(별도).

## 진행 (commit `11d4a8b`)
- ✅ react-grade E2E(답선택→채점→점수).
- ✅ `useQuizStore.test.ts`(채점/타이머/clear) 5건.

## 남은 후속
- [ ] `utils/storage` 유닛 테스트
- [ ] `QuestionCard`/`useQuestions` 테스트
- [ ] (선택) 커버리지 임계 게이트

관련: #75, #68
