# 코드 점검 리포트 — 문제점·기능 오류 (2026-08-18)

> **범위**: 코드를 고치지 않고 정적 검토 + 기존 하네스 실행 + 별도 프로브 테스트로 결함을 확인한 기록입니다.
> **대상 커밋**: `48eda8e` (branch `claude/code-issues-error-report-wj5222`, main과 동일)
> **환경**: Node 22 / `npm ci` 후 실행. 프로브 테스트는 저장소 밖(임시 설정)에서 돌렸고 작업 트리에는 남기지 않았습니다.

---

> ## ✅ F-1 ~ F-4는 이 브랜치에서 **수정 완료** (갱신: 2026-08-19)
>
> 아래 본문은 **수정 전 시점의 조사 기록**을 그대로 보존합니다. "재현 확인"·"잠복"이라는
> 서술은 당시 사실이며, 지금은 아래 표대로 바뀌었습니다.
>
> | # | 조치 | 결함을 고정한 검사 |
> |---|---|---|
> | F-1 | `saveUiState`·`saveAnswers`가 **예약 시점의 제품**으로 키를 만든다. `flushPersist`는 `activeProduct`가 비어도 대기 중인 저장을 내보낸다 | `src/utils/storage.gateexit.test.ts` (신설 6건) |
> | F-2 | `clearAnswers`·`resetProgressForSets`가 지운 답안과 **같은 범위의 `quickGraded`**를 함께 비운다(`dropQuickGraded`) | `useQuizStore.test.ts` — `clearAnswers — 퀵 채점 표시…` |
> | F-3 | 가중 점수를 호출부가 넘기지 않는다. `buildRoundHistory`가 **회차의 `questions`로 직접** 계산해 `correct`·`total`과 모집단이 갈릴 수 없다(`weighted` 플래그) | `roundHistory.test.ts` — `가중 점수의 모집단은 total과 같다` |
> | F-4 | 오답 대상 키에 챕터를 붙인다(`reviewKeyFor` → `A-random#챕터`). 읽는 쪽(`reviewTargetIds`)은 base·챕터 키를 **합집합**으로 본다 | `answerKey.test.ts` · `useQuestions.review.test.ts` · `useQuizStore.test.ts` |
> | F-5 | **미조치**(요청 범위 밖) — 제품 결함이 아닌 검사 결함입니다. 다만 이번 검증 중에 **같은 결함이 두 번째 스펙(`react-quick-ux`)에서도** 드러났고 발생률을 실측했습니다 — F-5 절의 갱신 참고 |  |
>
> 추가한 검사는 전부 **대상 결함을 되돌려 빨간불을 확인한 뒤** 원복했습니다(F-1 4건 / F-2·F-4 4건 / F-3 2건 / F-4 읽기 1건).
> 검증 결과는 §2를 이 수정 이후 값으로 갱신했습니다.

---

## 0. 요약

정적 게이트(`lint` · `typecheck` · `typecheck:test`)와 유닛 696건, 데이터 검증 626문항은 **전부 통과**합니다.
데이터 계층은 하네스와 별개로 직접 스캔해도 이상이 없었습니다(§2.2).
React E2E 410건은 **409 통과 / 1 실패**인데, 그 1건은 제품이 아니라 검사 쪽 결함입니다(F-5).

아래 5건 중 F-1·F-2는 프로브 테스트로, F-5는 스위트 실행으로 **재현을 확인**했고,
F-3·F-4는 코드 경로가 명확해 정적 확인만 했습니다.

| # | 결함 | 심각도 | 상태 | 계층 |
|---|---|---|---|---|
| F-1 | 제품 게이트 복귀 시 디바운스 저장이 **다른 제품 키로 새거나 통째로 유실**된다 | **High** | 재현 확인 | `utils/storage.ts` |
| F-2 | 퀵 모드 초기화가 반쪽 — `quickGraded`가 남아 **답이 없는 문항이 '오답' 상태로 잠긴다** | **High** | 재현 확인 | `store/useQuizStore.ts` |
| F-3 | 퀵 회차의 `cstsWeighted`가 **채점 범위와 다른 모집단**으로 기록된다 | Medium | 코드 확인(잠복) | `hooks/useQuizSession.ts` |
| F-4 | 챕터 미니 시험 채점이 **세트 전체 랜덤의 오답 대상을 덮어쓴다** | Medium | 코드 확인 | `hooks/useQuizSession.ts` |
| F-5 | E2E `react-pairwise` 가 **약 9% 확률로 무작위 실패**한다(제품 결함 아님, 검사 결함) | Medium | 실측 재현 | `e2e/react-pairwise.spec.ts` |

F-5는 제품이 아니라 **검사 쪽 결함**이지만, CI의 `E2E smoke` 잡을 간헐적으로 빨갛게 만들므로 함께 올립니다.
부수 관찰 4건은 §3에 따로 적었습니다(결함으로 보지 않음).

---

## 1. 확인된 결함

### F-1 · 제품 게이트로 돌아갈 때 디바운스 저장이 새거나 사라진다 — **High**

**위치**
- `src/utils/storage.ts` — `saveUiState`(디바운스 500ms), `saveAnswers`(디바운스 500ms), `flushPersist`
- `src/store/useQuizStore.ts` — `resetToGate`
- 트리거 경로: `src/components/modals/AppModals.tsx:506` (시험 응시 중 뒤로가기 → "시험 화면 나가기" → **나가기**) → `resetToGate()`

**원인 — 가드와 키가 서로 다른 시점을 본다**

```ts
export const saveUiState = debounce((state: Partial<QuizState>) => {
  if (!state.activeProduct) return;            // ← 예약 '당시' 스냅샷으로 가드
  ...
  localStorage.setItem(uiStorageKey(), ...);   // ← 실행 '시점' store로 키 생성
  localStorage.setItem(persistenceKey(), ...);
}, 500);
```

`uiStorageKey()` / `persistenceKey()`의 기본값은 `getActiveProduct()`이고, 그 구현은
`useQuizStore.getState().activeProduct || 'istqb'`입니다. 즉 **`activeProduct`가 null이면 조용히 ISTQB로 떨어집니다.**
디바운스는 트레일링이라, 예약 후 500ms 안에 `resetToGate()`가 `activeProduct`를 null로 만들면
가드는 (옛 스냅샷을 보고) 통과하고 키만 남의 제품 것이 됩니다.

이 저장소는 **같은 결함 유형을 이미 한 번 잡아 뒀습니다.** `restorePersistentSnapshot`에는
"await를 건너는 코드는 반드시 인자로 제품을 넘겨야 한다"는 주석과 `storage.gaterace.test.ts`가 붙어 있습니다.
디바운스 저장 경로에만 같은 규칙이 서 있지 않습니다.

**재현 (프로브)** — CSTS 상태로 저장을 예약하고 100ms 뒤 `resetToGate()`, 디바운스 만료:

```
ISTQB UI key   = {"mode":"exam","setId":"CSTS-SET-1","index":7, ... ,"reviewedOk":{"CSTS-SET-1":[3,5]}, ...}
CSTS  UI key   = null
ISTQB snapshot = {"answers":{"CSTS-SET-1-exam-Q1":["a"],"CSTS-SET-1-exam-Q2":["b"]}, "uiState":{ ...CSTS... }}
```

CSTS의 모드·세트·위치·복습 진척이 ISTQB 키에 기록되고, **CSTS 답안이 ISTQB 스냅샷의 `answers`로 들어갑니다**
(스냅샷은 복원이 우선해서 읽는 소스입니다).

**반대 방향 — 같은 창에서 데이터가 사라진다**

`saveAnswers`는 가드를 **실행 시점 store**로 봅니다(`if (!useQuizStore.getState().activeProduct) return;`).
그래서 같은 상황에서 아무것도 쓰지 않습니다. 워크스페이스 언마운트 cleanup의 `flushPersist()`도
`if (!state.activeProduct) return;`이라 구제하지 못합니다.

```
// 답안 선택 → 100ms 후 resetToGate → flushPersist → 디바운스 만료
CSTS answers key  = null
CSTS snapshot key = null
```

즉 **나가기 직전 500ms 안에 고른 답은 디스크에 남지 않습니다.** 메모리에는 남아 있지만,
같은 제품을 다시 고르면 `restorePersistentSnapshot`이 디스크 값으로 hydrate하므로 그대로 유실됩니다.

**사용자에게 보이는 모습**
- ISTQB를 다시 고르면 존재하지 않는 CSTS 세트 id로 복원됩니다. `Sidebar`의 자동 세트 보정 effect가
  첫 세트로 되돌려 주지만, **`mode`·`index`·`reviewedOk`·`examStartedAt`·`quickRounds`는 CSTS 값 그대로** 남습니다.
- 원래 ISTQB에 저장돼 있던 UI 상태와 스냅샷 답안이 덮입니다.
- 시험 중 나가기 직전에 고른 답 한두 개가 사라집니다.

**제안 (택1 또는 병행)**
1. `saveUiState`/`saveAnswers`가 키를 **스냅샷의 product**로 만들도록 인자화 — `restorePersistentSnapshot`이 이미 쓰는 규칙과 일치.
2. `resetToGate` 직전(또는 액션 안)에서 `saveUiState.flush()` / `saveAnswers.flush()`.
3. `flushPersist`가 `activeProduct`가 비어도 **마지막으로 활성이었던 product**로 flush.
4. 회귀 고정: `storage.gaterace.test.ts` 옆에 "게이트 복귀 시 저장 경합" 케이스 추가.

---

### F-2 · 퀵 모드 초기화가 `quickGraded`를 남긴다 — **High**

**위치** — `src/store/useQuizStore.ts`

| 액션 | 지우는 것 | 안 지우는 것 |
|---|---|---|
| `clearAnswers(setId, mode)` | `answers`(접두), `graded`, `examStarted`, `examStartedAt` | **`quickGraded`**, `quickDraw`, `quickRoundId` |
| `resetProgressForSets(setIds)` | `answers`, `graded`, `reviewIds`, `examStarted`, `examStartedAt`, `reviewedOk` | **`quickGraded`**, `quickDraw`, `quickRoundId` |
| `startQuick(size)` | `answers`(QUICK 접두), **`quickGraded`**, `graded`, `quickRoundId`, `quickDraw` | — |

`startQuick`만 규칙이 완전하고, **초기화 경로 전부가 `quickGraded`를 빠뜨립니다.**

**도달 경로**
- 설정 → *현재 모드 답안 초기화* (`AppModals.handleResetMode` → `clearAnswers`)
- 통계 → *이력 비우기* (`AppModals.handleClearHistories` → `resetProgressForSets([...세트, QUICK_SET_ID])`)
- 결과 모달 *다시 풀기*, 이어풀기 모달 *새로 풀기*, *처음부터 풀기* 확인 (모두 `clearAnswers`)

**재현 (프로브)**

```
after clearAnswers  → answers: {} | quickGraded: {"QUICK-quick-A-001":true,"QUICK-quick-A-002":true}
after resetProgress → quickGraded: {"QUICK-quick-A-001":true,...} | quickDraw: {...} | quickRoundId: r1
```

**사용자에게 보이는 모습**

`QuestionCard`는 퀵의 공개·잠금을 `quickGraded[answerKey]` 하나로 판정합니다
(`quickGradedHere` → `reveal` + `locked`). 초기화 뒤 그 문항은

- 선택이 비었는데도 **"❌ 오답입니다 · 정답 …"** 과 해설이 펼쳐진 채로 뜨고,
- 보기 버튼과 서답형 입력이 `disabled`라 **다시 풀 수 없습니다.**

반면 `QuickScoreboard`는 `isQuickCommitted`(답이 있어야 참) 기준이라 **진행·정답·오답이 0으로 리셋**됩니다 —
같은 화면 안에서 점수판과 문항 상태가 어긋납니다. 탈출구는 *다시 섞어 시작*(`startQuick`)뿐입니다.

**제안** — `quickGraded`(그리고 퀵 스코프인 `quickDraw`·`quickRoundId`)를 `clearAnswers`/`resetProgressForSets`의
지움 대상에 포함. `startQuick`이 이미 단일 원천을 갖고 있으므로 그 목록을 공유하는 형태가 자연스럽습니다.

---

### F-3 · 퀵 회차의 `cstsWeighted`가 채점 범위와 다른 모집단으로 기록된다 — Medium (잠복)

**위치** — `src/hooks/useQuizSession.ts` · `gradeCurrentQuestion`

```ts
const cstsWeighted = useMemo(
  () => computeCstsWeightedScore(currentQuestions, answers, answerKeyOf),  // ← 추첨된 전 문항
  [currentQuestions, answers, answerKeyOf],
);
...
addQuickRound(buildRoundHistory({
  questions: gradedQs,      // ← 지금까지 '채점한' 문항만 (예: 3문항)
  ...
  cstsWeighted: snapshot.activeProduct === 'csts' ? cstsWeighted : undefined,  // ← 전 문항 기준 그대로
}));
```

퀵의 추첨 규모는 `QUICK_ALL`(사실상 전부)이라 CSTS에서는 `currentQuestions`가 **440문항**입니다.
그래서 한 회차 레코드 안에 `correct/total = 3/3`과 `cstsWeighted = { score: 4.5, maxScore: ~640 }`이
**서로 다른 모집단으로 공존**합니다.

`attemptRatePercent`는 "`cstsWeighted`가 있으면 그것을 쓴다"가 명시된 단일 원천이므로,
이 값이 화면에 닿는 순간 3/3짜리 회차가 **0~1%** 로 표시됩니다.

**지금 드러나지 않는 이유** — 퀵 회차는 `histories`가 아니라 `quickRounds`에 들어가고,
`attemptRatePercent`/`weightedRatePercent`의 호출부(`StatsDashboard`의 요약·타임라인, `buildMiniTestRounds`,
`latestAttemptComparison`)는 모두 `histories`만 봅니다. 챕터 통계는 `chapterQuestions`만 읽습니다.
즉 **현재는 잘못된 값이 localStorage에 쌓이기만 하고 표시되지는 않습니다.**

같은 모양이 `handleGrade`의 `mode === 'quick'` 분기에도 있습니다. 다만 그 분기는 현재 도달 경로가 없습니다
(`requestGrade`가 퀵을 `gradeCurrentQuestion`으로 보내고, 사이드바 채점 버튼은 `mode !== 'quick'` 조건).
**도달 불가 분기가 잘못된 계약을 그대로 담고 있다**는 점 자체가 위험 요소입니다.

**제안** — `gradeCurrentQuestion`에서 `computeCstsWeightedScore(gradedQs, ...)`로 그 회차 범위만 계산하거나,
퀵 회차에는 `cstsWeighted`를 아예 싣지 않기(퀵은 합격 판정 대상이 아님). 유닛으로
"회차의 `total`과 `cstsWeighted.maxScore`가 같은 문항 집합에서 나온다"를 고정하면 클래스가 닫힙니다.

---

### F-4 · 챕터 미니 시험 채점이 세트 전체 랜덤의 오답 대상을 덮어쓴다 — Medium

**위치** — `src/hooks/useQuizSession.ts` · `handleGrade`

```ts
const gradeKey = gradeKeyFor(setId, mode);      // 미니 시험도 mode === 'random'
...
setReviewIds(gradeKey, wrongIds);               // 통째로 교체
```

챕터 미니 시험은 `mode === 'random'` + `chapterFilter`라 **채점 키가 세트 전체 랜덤과 같습니다.**
저장소는 다른 곳에서는 이 둘을 일관되게 분리합니다.

| 소비처 | 미니/전체 분리 |
|---|---|
| `isSetLevelRound` (요약·타임라인) | `h.chapter`로 분리 ✅ |
| `latestAttemptComparison` (직전 회차 대비) | `chapter` 인자로 분리 ✅ |
| `findGradedRoundMatch` (복원 시 중복 채점 방지) | `chapter` 인자로 분리 ✅ |
| `buildMiniTestRounds` (미니 회차 목록) | `h.chapter`로 분리 ✅ |
| **`reviewIds` (오답 모드 출제 대상)** | **분리 없음 — 같은 키를 덮어씀 ❌** |

**시나리오**
1. 세트 A에서 랜덤 40문항을 채점 → 오답 12개가 `reviewIds["A-random"]`에 기록.
2. 통계에서 약한 챕터의 *미니 시험*(10문항)을 한 번 채점.
3. `reviewIds["A-random"]`이 **그 미니 회차의 오답 2~3개로 교체**됩니다.

오답노트는 `histories`의 합집합이라 12개가 그대로 보이는데, 사이드바의 *오답 다시 풀기*는
2~3개만 출제합니다 — 이 저장소가 여러 번 이름 붙여 막아 온
**"오답 노트에는 있는데 오답 풀이에는 안 나온다"** 와 같은 모양입니다.

`recomputeReviewTargets`(회차 삭제 후 재계산)도 gradeKey 단위라 같은 혼합이 일어납니다.

**제안** — 채점 키에 챕터를 반영(`gradeKeyFor(setId, mode, chapter)`)하거나,
`reviewTargetIds`가 미니 회차 키까지 **합집합**으로 읽도록 규칙을 맞추기.
어느 쪽이든 `reviewIds`가 다른 네 소비처와 같은 분리 기준을 갖게 하는 것이 핵심입니다.

### F-5 · `react-pairwise` E2E가 약 9% 확률로 무작위 실패한다 (검사 결함) — Medium

**실측** — 이번 점검의 `npx playwright test --project=react` 전수 실행(410건)에서 **1건 실패**했습니다.

```
✗ ISTQB/quick/desktop/graded=yes: 답을 골라도 진행이 그대로 (0)
   e2e/react-pairwise.spec.ts:214
1 failed · 409 passed (14.2m)
```

같은 스펙만 `--repeat-each=5`로 다시 돌리면 **5/5 통과**합니다 — 즉 결정적 실패가 아닙니다.

**원인** — 스펙이 보기를 **하나만** 고른 뒤 진행 수가 오르기를 기대합니다.

```ts
const opt = page.locator("#options .option").first();
if (await opt.count()) {
  await opt.click();
  await gradeQuickIfNeeded(page);   // 복수정답이면 버튼이 disabled → 조용히 return
  ...
  if (before === after && /^0(\s|$)/.test(...)) problems.push(`${label}: 답을 골라도 진행이 그대로`);
}
```

퀵은 `isQuickCommitted`가 **복수정답을 전부 골라야** 확정으로 봅니다(사양이고 유닛으로 고정돼 있습니다).
그래서 그 문항에서는 채점 버튼이 `disabled`이고, `gradeQuickIfNeeded`는 그대로 돌아오며, 점수판은 0에 머뭅니다.

같은 저장소의 `e2e/helpers.ts`는 **이 경우를 이미 처리합니다** — 제목의 "복수정답" 표기를 보고 나머지 보기를 마저 고릅니다.
`react-pairwise`만 그 헬퍼를 쓰지 않고 `.first()` 하나로 끝냅니다.

**확률** — 퀵 추첨은 시드 없는 `Math.random`이라 실행마다 첫 문항이 달라집니다.

| 값 | 실측 |
|---|---|
| ISTQB 퀵 풀(재수록 중복 제거 후) | 186문항 |
| 그중 복수정답 | 9문항 (4.8%) |
| 커버링 배열의 `ISTQB/quick` 케이스 | 2건 (16케이스 중) |
| **실행당 실패 확률** | **약 9.4%** |

CSTS는 복수정답이 0건이라 `CSTS/quick` 케이스는 절대 걸리지 않습니다 — ISTQB 조합에서만 터지는 것이 이 설명과 일치합니다.

**왜 중요한가** — `AGENTS.md`가 경고하는 "테스트 플래키로 오인되기 쉬운" 상황과 정확히 같은 모양입니다.
CI의 `E2E smoke`는 재시도 1회(`retries: 1`)라 대개는 가려지지만, **열 번에 한 번은 첫 시도가 빨갛고
그 원인이 로그에서 제품 결함처럼 읽힙니다**("답을 골라도 진행이 그대로"). 실제로는 검사가 사양을 안 지킨 것입니다.

**제안** — 스펙의 답 선택을 `helpers.ts`의 복수정답 처리 경로(제목 표기 확인 후 나머지 보기 선택)로 교체.
헬퍼가 이미 있으므로 중복 구현이 아니라 **중복 제거**입니다.

#### 갱신 (2026-08-19) — 같은 결함이 두 번째 스펙에도 있고, 발생률을 실측했습니다

F-1~F-4 수정 뒤 전수 실행을 두 번 돌렸더니 **1회는 410 전부 통과**, **1회는 다른 스펙 1건이 실패**했습니다.

```
✗ e2e/react-quick-ux.spec.ts:344 › 퀵: 한 문항을 채점하면 …
  expect(locator).toBeEnabled() failed — getByTestId('quick-grade-btn') 이 disabled
  e2e/react-quick-ux.spec.ts:360
```

원인이 같습니다 — `#options .option` **하나만** 누르고 채점 버튼이 열리기를 기대하는데,
그 문항이 복수정답이면 `isQuickCommitted`가 확정으로 보지 않아 버튼이 잠긴 채입니다.

**이 실패가 F-1~F-4 수정 때문이 아님을 같은 조건에서 재서 확인했습니다.**

| 코드 | `--repeat-each=25` 결과 |
|---|---|
| 수정 전 (`80f2862`) | **2 실패 / 23 통과** |
| 수정 후 (`e6d21ba`) | **3 실패 / 22 통과** |

같은 스펙·같은 실패 지점(`:360`)이고 발생률도 구분되지 않습니다. 수정 diff는
`isQuickCommitted`·`quickGraded` 적재·버튼 `disabled` 조건 어디도 건드리지 않습니다.

즉 F-5는 스펙 한 곳의 문제가 아니라 **"퀵에서 보기를 하나만 누른다"는 패턴이 퍼져 있는 것**입니다.
고칠 자리는 두 곳(`react-pairwise` · `react-quick-ux`)이며, 둘 다 `helpers.ts`에 이미 있는
복수정답 처리로 바꾸면 됩니다.

---

## 2. 검증 결과 (실행한 명령과 결과)

점검 시점(수정 전)과 F-1~F-4 수정 후를 함께 적습니다.

| 명령 | 점검 시점 | 수정 후 |
|---|---|---|
| `npx tsc --noEmit` | 통과 | 통과 |
| `npx tsc --noEmit -p tsconfig.test.json` | 통과 | 통과 |
| `npx eslint .` | 통과 | 통과 |
| `npx vitest run` | 44파일 / **696 통과** | 45파일 / **712 통과** (+16, 신규 검사) |
| `node scripts/verify.js` | 12파일 626문항 · 오류 0 · 경고 0 | (데이터 무변경) |
| `npx playwright test --project=react` | 409 통과 / **1 실패**(F-5 플래키) | 2회 실행 — **410 전부 통과** / 409 통과·1 실패(F-5 플래키, §1의 F-5 갱신 참고) |
| `npx stryker run` (코어, break 85) | 92.30%(문서값) | **92.44%** ✓ |
| `npx stryker run stryker.storage.config.json` (break 67) | **69.53%**(직접 실측) | **69.92%** ✓ |
| `npm audit --omit=dev --audit-level=high` | **0건** | 0건 |
| `npm audit` (dev 포함) | high 4건(`undici` · `js-yaml` · `fast-uri`) — 빌드·테스트 전용, 배포 번들에는 없음 | 동일 |

> E2E는 이 환경에 Playwright 1.61이 요구하는 chromium 빌드(1228)가 없어, 미리 설치된 chromium(1194)을
> `launchOptions.executablePath`로 지정한 **임시 설정 파일**로 실행했습니다. 스펙·프로젝트 정의는 저장소 것 그대로이며
> 임시 설정은 작업 트리에 남기지 않았습니다.

실행하지 않은 점검과 사유:

- `scripts/verify-pdf-data.py` — 원본 PDF와 `pymupdf`가 이 환경에 없어 생략(CI `pdf-data` 잡이 담당). 문제 데이터는 이번 수정에서 한 줄도 바뀌지 않았습니다.
- `npm run test:nf` / `test:apk` — 수정 범위가 영속화·상태·순수 로직이라 레이아웃·안전영역과 무관하고, 단일 `webServer`를 공유해 react 스위트와 동시 실행이 불가합니다. **저장 내구성은 `test:nf`의 영역과 겹치므로, 배포 전 이 스위트를 한 번 돌리는 것을 권합니다.**
- 실기기 Safari 확인 — IndexedDB·Blob·서비스워커 계층은 건드리지 않았고 변경은 `localStorage` 키 선택과 순수 로직에 한정됩니다. 다만 `AGENTS.md`의 기준상 영속화 계층을 고쳤으므로 배포 전 30초 실기기 확인은 남겨 둡니다.

### 2.1 뮤테이션 게이트 — 문서값과 실측이 어긋나 있었다

수정 전 점수를 **직접 재서** 비교했습니다(수정 후 값만 보고 "떨어졌다/올랐다"를 말할 수 없어서).
`docs/harness/README.md`의 래칫 기록은 2026-08-13의 **71.37%**인데, 같은 설정으로 지금 main을
재면 **69.53%**입니다 — 그 사이 들어온 기능(퀵 문항 단위 채점·`wrongView` 등)이
`useQuizStore.ts`에 검사 없는 코드를 더한 결과입니다. 즉 71.37은 이미 낡은 값이었습니다.

| 대상 | 수정 전(실측) | 수정 후 | 차이 |
|---|---:|---:|---:|
| 전체 | 69.53% | **69.92%** | +0.39 |
| `useQuizStore.ts` | 82.59% | **83.87%** | +1.28 |
| `storage.ts` | 65.79% | 65.65% | −0.14 |
| no-coverage(전체) | 88건 | 88건 | ±0 |

`break 67`은 그대로 둡니다 — 0.39pp는 이 계층의 검출력을 유의미하게 끌어올린 폭이 아니라
래칫을 올릴 근거가 되지 못합니다. 다만 문서의 71.37은 실측으로 갱신했습니다
(낡은 기준값을 남겨 두면 다음 사람이 "내가 떨어뜨렸다"고 오판합니다).

### 2.2 데이터 계층 독립 스캔 (하네스와 별개로 직접 확인)

626문항 전수에 대해 다음을 확인했고 **위반 0건**입니다.

- 세트 내 문항 `id`·`number` 중복
- `answer`가 `options`의 키 집합에 없는 경우 / 보기 키 중복
- `chapter`·`explanation`·`answer` 결측
- `true_false` 정답이 `o`/`x`가 아닌 경우, 유형과 `options` 유무의 모순
- `answerParts`의 형태(라벨·정답 배열)
- `figure` 및 지문 내 `assets/…` 참조 파일의 실제 존재
- `index.json`의 `questionCount` 와 실제 문항 수 일치

유형 분포: `multiple_choice` 501 · `true_false` 62 · `short_answer` 63.
CSTS 배점표(`CSTS_TYPE_POINTS`)로 계산한 세트별 만점도 코드 주석과 일치합니다
(2402/2403/2404/2405/2019/예제 = 100점, EL-2018 = 29점).

또한 ISTQB 합격 기준 라벨(`Math.ceil(total * 0.65)`)과 실제 판정(`rate >= 65`)이
문항 수 1~80 전 구간에서 **어긋나지 않음**을 수치로 확인했습니다(부동소수 경계 포함).

---

## 3. 부수 관찰 (결함으로 보지 않음)

| # | 위치 | 내용 |
|---|---|---|
| O-1 | `components/common/Modal.tsx` | 본문 넘침 감지 `useEffect`에 의존성 배열이 없어 **매 렌더** `ResizeObserver`를 재생성합니다. 결과 모달이 열려 있으면 타이머 틱으로 초당 1회. 기능 영향은 없고 비용도 작지만, 의도한 동작(내용 변경 시 재측정)은 `[children]` 정도로 충분합니다. |
| O-2 | `hooks/useTheme.ts` | `useTheme()`는 `AppModals`에서만 호출됩니다. 제품 게이트 화면에는 `AppModals`가 없어 `index.vite.html`의 프리페인트 스크립트에만 의존하는데, 그쪽은 `matchMedia` 변경을 구독하지 않습니다 — **게이트에 머무는 동안 OS 테마를 바꾸면 즉시 반영되지 않습니다.** |
| O-3 | `utils/toast.ts` | `remove`가 클릭과 타임아웃으로 두 번 호출될 수 있습니다(`el.remove()`가 멱등이라 무해). 클릭 제거 시 duration 타이머를 정리하지 않습니다. |
| O-4 | 의존성 | `npm audit` dev 트리에 high 4건. 배포 게이트(`--omit=dev`)는 0건이라 CI 정책과 일치하지만, `undici`/`js-yaml`은 `npm audit fix` 범위 안입니다. |

---

## 4. 하네스 관점 — 왜 기존 게이트가 F-1·F-2를 놓쳤나

두 결함 모두 **"상태 A에서 상태 B로 넘어가는 사이"** 에 있습니다.

- **F-1**: `activeProduct`가 값 → null로 바뀌는 순간과 디바운스 만료가 겹치는 500ms 창.
  기존 `storage.gaterace.test.ts`는 *게이트 진입(null → 값, 두 복원의 겹침)* 만 다루고,
  **게이트 복귀(값 → null)** 는 다루지 않습니다.
- **F-2**: 스토어 액션 세 개(`clearAnswers` · `resetProgressForSets` · `startQuick`)가
  "퀵 세션을 비운다"는 같은 일을 하는데 **지움 목록이 갈려 있습니다.**
  각 액션 단위 유닛은 자기 목록을 검사하므로 셋 사이의 어긋남은 잡히지 않습니다.

보강안 제안:

1. `storage` 유닛에 **게이트 복귀 경합** 케이스 추가 — "제품 키에는 그 제품 값만 쓰인다"를 불변식으로.
2. 퀵 스코프 필드 목록을 `sessionScopeDefaults()`처럼 **단일 원천 상수**로 뽑고,
   세 초기화 액션이 그것을 공유하는지 계약 테스트로 고정.
3. 회차 레코드에 대해 **`total`과 `cstsWeighted.maxScore`가 같은 문항 집합에서 나온다**는 불변식 유닛(F-3 차단).
4. `reviewIds` 키가 다른 네 소비처(`isSetLevelRound`·`latestAttemptComparison`·`findGradedRoundMatch`·`buildMiniTestRounds`)와
   **같은 분리 기준(chapter)** 을 쓰는지 계약 테스트로 고정(F-4 차단).

---

## 5. 권고 순서

1. **F-2** — 사용자가 즉시 막히고(다시 풀 수 없는 문항), 수정 범위가 스토어 액션 두 개로 작습니다.
2. **F-1** — 데이터 오염과 유실을 함께 일으키며, 이미 있는 규칙(제품을 인자로 넘긴다)을 한 곳에 더 적용하면 됩니다.
3. **F-4** — 학습 루프(오답 재풀이)가 조용히 끊깁니다. 키 설계 변경이라 F-1·F-2보다 판단이 필요합니다.
4. **F-3** — 지금은 표시되지 않지만 저장되는 값이 이미 틀렸습니다. 소비처가 하나만 늘어도 드러납니다.
5. **F-5** — 제품 위험은 없지만 CI 신뢰도를 갉아먹습니다. 헬퍼 재사용 한 줄이라 비용이 가장 작습니다.

---

# 2차 점검 (2026-08-19) — 1차에서 읽지 않은 범위

1차 점검은 하네스 문서가 위험 구간으로 지목한 곳(상태·영속화·채점·통계)에 집중했고,
비테스트 소스 9,293줄 중 약 80%만 직접 읽었습니다. 남은 범위를 세 갈래로 나눠 마저 읽은 기록입니다.

| 범위 | 분량 | 결과 |
|---|---:|---|
| ① 미열람 컴포넌트 7개 + 큰 컴포넌트의 JSX 블록 | ~1,900줄 | 결함 2 · 경미 3 |
| ② `parser.tsx`의 표/코드 정규화기 | ~370줄 | **결함 1(사용자에게 보임)** · 잠복 1 |
| ③ `scripts/` 전체(Python 포함) | 2,095줄 | 결함 2 · 경미 3 · 게이트 한계 1 |

**남은 미열람**: `src/styles/globals.css`(2,182줄) · `e2e/*.spec.ts`(9,544줄) · `src/**/*.test.ts`(7,066줄) · `android/`.

---

## ② R-1 · `stripPdfNoise`의 `할 인` 규칙이 정상 문장을 깨뜨린다 — **High**

**위치** — `src/utils/parser.tsx` · `stripPdfNoise()`

```ts
.replace(/할\s+인/g, "할인")
```

PDF 추출에서 한 낱말이 갈라진 것을 되붙이는 규칙인데, **조건 없는 전역 치환**이라
`할`로 끝나는 관형형 + `인`으로 시작하는 명사를 만나면 정상 문장을 붙여 버립니다.

**실측** — 626문항 전수에서 이 규칙은 6곳에서 발동하고, 그중 **4곳이 오작동**입니다.

| 문항 | 데이터(정상) | 화면(깨짐) | 판정 |
|---|---|---|---|
| ISTQB-FL-V4-B #18 | 리뷰에 참여**할 인**력 | 참여**할인**력 | ❌ 오작동 |
| CSTS-FL-2402 #38 | 진행**할 인**력과 조직 | 진행**할인**력과 | ❌ 오작동 |
| CSTS-FL-2402 #48 | 수행**할 인**적 자원 | 수행**할인**적 자원 | ❌ 오작동 |
| CSTS-FL-2403 #48 | 〃 | 〃 | ❌ 오작동 |
| CSTS-FL-2404 #48 | 〃 | 〃 | ❌ 오작동 |
| ISTQB-FL-V4-D #20 | 같이 **할 인** 유형 | **할인** 유형 | ✅ 의도대로 |
| ISTQB-FL-V4-EXTRA #22 | 너무 높은 **할 인**을 | **할인**을 | ✅ 의도대로 |

**저장소가 스스로 반대로 일하고 있습니다.** `scripts/normalize-utils.js`에는 이런 하드코딩 치환이 있습니다.

```js
text = text.replace('… 리뷰에 참여할인력, 리뷰 시간 …', '… 리뷰에 참여할 인력, 리뷰 시간 …');
```

즉 **데이터 쪽에서 일부러 띄어쓰기를 복원해 둔 것을 렌더러가 다시 붙입니다.** 같은 문장을
두 계층이 반대 방향으로 고치고 있고, 최종 승자는 렌더러입니다.

**왜 어떤 게이트도 못 잡았나** — `scripts/verify-pdf-data.py`의 `norm()`이 비교 전에
`re.sub(r"\s+", "", s)`로 **공백을 전부 제거**합니다. 띄어쓰기 차이는 원리적으로 이 게이트의
검출 대상이 아닙니다. E2E도 이 문자열을 단언하지 않습니다.

**제안** (둘 다 PDF 게이트에 안전 — 공백은 어차피 정규화됨)

1. 규칙을 좁힌다: `/할\s+인(?=[을를])/` — 진짜 아티팩트 2건만 잡고 오작동 4건이 사라집니다.
2. 또는 규칙을 지우고 데이터 2곳(ISTQB-D #20 · EXTRA #22)의 공백을 제거한다 —
   렌더러에서 문항별 특례를 없애는 방향.

같은 함수의 다른 결합 규칙(`시 간`·`실 무`·`실행 하는`·`테스트 케이 스`)은 발동 7건 전부 정상이었습니다.

## ② R-2 · 코드블록 판정이 과하게 넓다 — Low(잠복)

`normalizeGenericCodeBlocks`의 `isCodeLine`은 `/[;{}]/` 로 **줄 어디에든** 세미콜론·중괄호가
있으면 코드 줄로 봅니다. 테스팅 교재라 동등 분할의 집합 표기(`{0, 1, 2}`)가 산문에 흔합니다.

**실측**: 현재 626문항에서 3줄 연속으로 걸려 코드블록이 만들어지는 구간은 **0건**입니다
(단독으로 걸리는 줄은 177건이지만 3줄 미만이라 일반 텍스트로 남습니다). 즉 데이터가 조금만
바뀌면 산문이 어두운 고정폭 블록으로 그려집니다.

`validate-questions.js`에는 이미 반대 방향 검사가 있습니다(해설의 1줄 `code` 블록에 한글 15자 이상이면 ERROR).
같은 규칙을 지문에도 걸면 이 클래스가 닫힙니다.

---

## ① R-3 · 이미지 라이트박스가 뒤로가기 가드에 등록되지 않는다 — Medium

`src/utils/backGuard.ts`가 존재하는 이유는 주석에 그대로 적혀 있습니다 —
*"오답노트를 보다 하드웨어 뒤로가기를 누르면 모달이 닫히는 게 아니라 앱이 그대로 종료됐다."*

그런데 `registerBackGuard`를 부르는 곳을 전수 조사하면 **오버레이 중 라이트박스만 빠져 있습니다.**

| 오버레이 | 가드 등록 |
|---|---|
| 설정·통계·오답노트·결과·팔레트·확인 대화상자 12종 (`AppModals`) | ✅ |
| 모바일 드로어 · 사용설명서 (`App`) | ✅ |
| 시험 응시 중 이탈 (`QuestionWorkspace`) | ✅ |
| **이미지 라이트박스** (`utils/lightbox.ts`) | ❌ |
| **오답 보기 전체화면** (`WrongViewScreen`) | ❌ |

- **라이트박스**: 그림을 확대한 상태에서 안드로이드 뒤로가기를 누르면, 라이트박스가 아니라
  그 아래 모달이 닫히거나(겹친 경우) 앱을 벗어납니다. Esc·배경 탭은 정상이라 **웹에서는 드러나지 않고 APK에서만** 나타납니다.
- **오답 보기 화면**: `wrongView`가 켜지면 `QuestionWorkspace`가 언마운트되면서 그쪽 가드도 함께 사라집니다.
  화면에 '풀이로 돌아가기'·'← 오답 노트' 버튼은 있지만 하드웨어 뒤로가기는 잡히지 않습니다.

두 경우 모두 `useBackDismiss` 한 줄(라이트박스는 `registerBackGuard` 직접 호출)로 닫힙니다.
우선순위는 `BACK_PRIORITY.confirm`보다 높은 값이 필요합니다 — 라이트박스는 모달 위에 뜨기 때문입니다.

## ① R-4 · 경미 3건

| # | 위치 | 내용 |
|---|---|---|
| R-4a | `MobileTopBar.tsx` | 퀵에서 세트 제목이 `'문제 풀이'`로 뜹니다. `Sidebar`는 `mode === 'quick' ? '퀵 랜덤' : …`로 처리하는데 이쪽만 분기가 없습니다(센티넬 `QUICK`이라 조회 실패 → 폴백). 정보 누출은 아니고 데스크톱과 라벨만 갈립니다. |
| R-4b | `attemptStats.buildMiniTestRounds` ↔ `StatsDashboard` | `MiniTestRound.title`을 계산해 담지만 화면은 `m.chapter`만 렌더합니다. 같은 챕터를 세트 A·B에서 각각 미니 시험하면 목록에서 구분할 수 없습니다. |
| R-4c | `AppModals` 오답 목록 | `const reviewedSet = new Set(...)`이 `.map()` **안에** 있어 항목마다 새로 만들어집니다. 기능 영향 없음. |

읽고 이상 없던 것: `ConfirmButtons` · `ErrorState` · `TimerClock` · `UserGuide` · `DebugConsole` ·
`WrongQuestionView` · `lightbox`(가드 외) · `modeLabel` · `time` · `links` · `brandLogo`,
그리고 `AppModals`·`QuestionWorkspace`·`Sidebar`·`StatsDashboard`의 나머지 JSX 전량.

---

## ③ R-5 · `fix-questions.js`가 검증 대상 디렉터리에 산출물을 쓴다 — Medium

```js
const outPath = path.join(absDir, file.replace('.json', '.normalized.json'));
```

`absDir`은 `www/data/istqb` · `www/data/csts`입니다. 그 결과:

- `validate-questions.js`가 그 디렉터리의 `.json`을 **전부 문항 세트로 검증**합니다.
- `sync-assets.js`가 `www/data` 전체를 `public/`·`dist/`로 복제해 **사용자에게 배포**합니다.
- `.gitignore`에 `*.normalized.json`이 없어 실수로 커밋될 수 있습니다.

`build-duplicate-groups.js`의 주석은 이 위험을 이미 명시합니다 —
*"validate-questions.js가 www/data/istqb·csts 하위의 .json을 전부 문항 세트로 검증한다.
새 파일을 두면 그 검증이 깨진다."* 규칙은 문서화돼 있는데 이 스크립트만 어깁니다.

현재 저장소에는 해당 파일이 0건이라 아직 밟지 않았습니다. 출력 경로를 `reports/`(이미 gitignore됨)로
옮기면 닫힙니다.

## ③ R-6 · `normalize-utils.js`가 보기 키를 재배정하면서 정답을 옮기지 않는다 — Medium

```js
q.options = extracted.map((ext, i) => ({ key: String.fromCharCode(97 + i), text: `${ext.label} ${ext.text}` }));
```

보기 키를 **위치 기준 a·b·c·d로 재부여**하는데 `q.answer`는 손대지 않습니다.
새 키 집합에 없으면 `requiresManualReview`로 표시되지만, 원래 정답이 `'a'`였고 재부여 뒤에도
`'a'`가 존재하면 **뜻이 바뀌었는데 검토 대상으로도 뜨지 않습니다.**

덧붙여 `text`에 원본 마커(`가.` `①`)를 다시 심는데, `validate-questions.js`는 바로 그 형태를
경고 대상으로 봅니다 — **도구가 자기 검증기가 싫어하는 데이터를 만듭니다.**

산출물이 `.normalized.json`이라 자동 반영되지는 않지만(R-5와 겹침), "이 도구의 출력은 그대로 쓰면 안 된다"는
사실이 코드 어디에도 적혀 있지 않습니다.

## ③ R-7 · 경미 3건 + 게이트 한계

| # | 위치 | 내용 |
|---|---|---|
| R-7a | `validate-questions.js` | 누락번호 검사가 **Windows에서 조용히 꺼집니다.** 키가 `${filePath}:${q.number}`인데 `n.split(':')[1]`로 번호를 되찾습니다 — `C:\…` 경로에서는 `[1]`이 경로 조각이라 `parseInt` → `NaN`, 전부 걸러져 검사 자체가 skip됩니다(실측: POSIX `40` / Windows `NaN`). CI는 ubuntu라 정상. |
| R-7b | `validate-questions.js` | id 중복 검사가 **파일 단위**입니다(`allIds`를 `validateFile`마다 새로 생성). 세트 간 충돌은 검출 불가 — 실측 전역 중복 0건이라 지금은 무해하지만, 재수록 그룹표의 전제("같은 문제가 세트마다 다른 id")와 짝이 맞지 않습니다. |
| R-7c | `build-duplicate-groups.js` | `buildChapters`가 `if (canonical)`로 거르므로, 그룹 **대표(첫 id)만 미태깅**이면 챕터 통일 항목이 누락돼 집계가 풀이 순서에 좌우됩니다. 실측: 챕터가 갈리는 3그룹 모두 대표가 태깅돼 있어 현재 0건. |

**게이트 한계 (결함 아님 — 설계상 범위)** — `verify-pdf-data.py`가 실제로 보는 것:

| 항목 | 실측 |
|---|---:|
| PDF와 대조되는 stem 조각 | 1,135 |
| 정규화 후 8자 미만이라 건너뛰는 조각 | 168 |
| 블록 유형 때문에 제외되는 stem 블록(table·code 등) | 63 (table/code 32) |
| **해설(explanation) — 전량 미대조** | **65,578자** |

또한 `norm()`이 공백·문장부호·괄호·기호를 모두 제거하므로 **띄어쓰기·문장부호 오류는 원리적으로 검출 불가**입니다(R-1이 정확히 여기 해당). "PDF 대조 통과"가 무엇을 보증하고 무엇은 아닌지가 문서에 없어 과신하기 쉬운 상태입니다.

읽고 이상 없던 것: `verify.js` · `build-duplicate-groups.js`(union-find·`--check`) · `lib/stemKey.cjs` ·
`check-bundle-size.js` · `sync-assets.js`(임시 폴더 → rename 원자적 교체) · `audit-phase3-content.js` ·
`audit-classification-markers.js` · `tag-questions.js`.

> `tag-questions.js`는 재실행 시 기존 챕터를 `null`로 되돌릴 위험이 있어 보였지만,
> `--dry` 실측 결과 **626/626이 `chapter-overrides.json`으로 덮여 있어 손실 0**입니다(자동 추론 0건).

---

## 2차 점검 권고 순서

1. **R-1** — 유일하게 지금 사용자 화면에 보이는 결함이고, 정규식 한 줄로 닫힙니다.
2. **R-3** — APK에서만 드러나 리포트가 잘 안 들어오는 자리입니다. 기존 `useBackDismiss` 재사용이라 비용이 작습니다.
3. **R-5 / R-6** — 도구를 한 번 쓰면 데이터·배포가 오염됩니다. 출력 경로 이동 + 경고 주석.
4. **R-2 / R-7** — 전부 잠복입니다. 검사를 붙여 두면 데이터가 바뀌는 시점에 잡힙니다.

---

# 3차 점검 (2026-08-19) — 남은 4개 영역

2차까지도 손대지 않은 CSS·E2E·테스트·Android를 마저 읽었습니다. 이로써 저장소의 모든 코드 파일을 최소 1회 열람했습니다.

| 범위 | 분량 | 방식 | 결과 |
|---|---:|---|---|
| `android/` | 715줄 | 정독 | 결함 1 · 경미 1 · 정보 1 |
| `src/styles/globals.css` | 2,182줄 | 정독 + 죽은 셀렉터 계량 | 결함 1 · 경미 2 · 정보 1 |
| `e2e/*.spec.ts` (439 테스트) | 9,544줄 | 전수 계량 + 후보 정독 | 결함 1(F-5 3번째 지점) · 주의 1 |
| `src/**/*.test.ts` (126 테스트) | 7,066줄 | 전수 계량 | **결함 없음** |

## AN-1 · 다크 모드 APK에서 시스템 바만 흰색으로 남는다 — Medium

`android/…/MainActivity.java`의 `configureSystemBars()`가 상태바·내비게이션 바를
`Color.rgb(255,255,255)` + `SYSTEM_UI_FLAG_LIGHT_STATUS_BAR`로 **하드코딩**합니다.

앱은 다크 테마를 지원하고(`body[data-theme]`) `index.vite.html`은 `theme-color`를 라이트/다크로
나눠 두었지만, **Capacitor WebView의 네이티브 바에는 그 meta가 적용되지 않습니다.**
`@capacitor/status-bar` 플러그인도 의존성에 없어 웹에서 네이티브로 테마를 알릴 경로가 없습니다.

결과: 다크 모드 APK는 본문만 어둡고 위아래 시스템 바가 흰색으로 남습니다.
`setDecorFitsSystemWindows(false)`(API 30+)로 edge-to-edge를 켜 두어 더 눈에 띕니다.

**AN-2 (Low)** — `AndroidManifest.xml`의 FileProvider가 `<external-path path="."/>`(외부 저장소 루트 전체)로
선언돼 있으나 앱 어디에서도 쓰이지 않습니다(백업은 MediaStore 경로). Capacitor 템플릿 잔재이고
`exported="false"`라 직접 악용은 안 되지만, 죽은 설정에 넓은 경로가 붙어 있습니다.

**AN-3 (정보)** — `addJavascriptInterface(BackupBridge, "AndroidBackup")`은 WebView의 모든 JS에 노출됩니다.
`capacitor.config.json`에 `server.url`이 없어 로컬 번들만 로드하므로 현재는 안전합니다. 다만 브리지에
출처 검사가 없어, 라이브 리로드용 `server.url`이 추가되면 원격 콘텐츠에 그대로 노출됩니다.

> 잘 되어 있는 것: `allowBackup="false"`, release 서명 env 누락 시 빌드를 명시적으로 실패시키는 가드,
> `sanitizeFileName`, safe-area 주입의 3중 재시도 + `onApplyWindowInsets` 연동.

## CS-1 · 죽은 CSS 규칙 하나 — 되살리는 순간 모바일 퀵이 깨진다 — Medium

`src/styles/globals.css:2181`

```css
.app-shell[data-mode="quick"] { padding-bottom: calc(16px + var(--safe-bottom)); }
```

`App.tsx:247`은 `.app-shell`에 `data-drawer`만 붙입니다 — 코드베이스에서 `data-mode`는
사이드바의 모드 버튼(`Sidebar.tsx:350`)에만 있습니다. **셀렉터가 아무것도 잡지 못합니다.**

문제는 그 규칙에 달린 주석입니다 — *"퀵에는 하단 고정 액션바가 없으므로"* 는 **사실이 아닙니다.**
`QuestionWorkspace`는 `.mobile-actionbar`를 무조건 렌더하고, 퀵에서는 그 안에
`renderQuickMain('ab-main', '-m')`(채점/다음 버튼)을 넣습니다.

지금은 죽어 있어 무해합니다. 그러나 누군가 "왜 안 먹지" 하고 `data-mode`를 붙이는 순간
하단 여백이 96px → 16px로 줄어 **본문 마지막이 78px짜리 고정 액션바에 가려집니다.**

**CS-2 (Low)** — 죽은 규칙 8묶음(~30줄): `.wrong-note-group` · `.table-image`/`.table-image-frame`(다크 대응 포함) ·
`.quick-label` · `.settings-toggle` · `.quick-next-bar`(반응형 포함) · `.quick-done`/`-title`/`-body`.
소스 참조 전부 0건입니다. `.quick-done`은 *"전 세트를 다 본 뒤의 종착 화면"* 이라는
**존재하지 않는 기능**을 설명합니다.

**CS-3 (Low)** — `:root` 주석이 `MainActivity.injectStatusBarHeight()`를 가리키는데 실제 메서드명은
`injectSafeAreaInsets()` / `evaluateSafeAreaJs()`입니다.

**CS-4 (정보)** — `theme-color` meta가 `prefers-color-scheme`(OS)만 따르므로, 앱 내 테마를 OS와 다르게
고른 사용자는 브라우저 크롬 색이 어긋납니다(PWA 한정).

> 잘 되어 있는 것: 대비 수치를 실측과 함께 주석에 남긴 토큰 설계, `--primary` ↔ `--primary-solid` 분리로
> 다크 대비 미달 15곳 일괄 해소, 44px 터치 타깃, 드로어의 `visibility` 차단, `prefers-reduced-motion`.

## E-1 · F-5 클래스의 세 번째 지점 — Medium

`react-transition-quick.spec.ts:194`가 퀵에서 보기를 하나만 누르고
`page.getByTestId("quick-grade-btn").click()`을 호출합니다. 복수정답 문항이 뽑히면 버튼이 `disabled`라
Playwright가 actionability를 기다리며 **스펙 예산(300초)을 통째로 태우고 타임아웃**합니다 —
앞선 두 지점(단언 실패)보다 진단이 어렵습니다.

| 위치 | 실패 방식 | `--repeat-each=25` 실측 |
|---|---|---|
| `react-pairwise.spec.ts:166` | 단언 실패 | 3 / 25 |
| `react-quick-ux.spec.ts:360` | 단언 실패 | 3 / 25 |
| `react-transition-quick.spec.ts:194` | **예산 소진 후 타임아웃** | 미실측(기전 동일) |

**저장소에 이미 해법이 둘 있습니다** — `helpers.answerCurrent`(제목의 '복수정답' 표기를 보고 나머지를 고름)와
`react-quick-ux.spec.ts:244`의 결정적 `quickDraw` 시딩. 세 지점만 그 해법을 쓰지 않습니다.

**E-2 (주의)** — `react-study-ux.spec.ts`의 "랜덤 채점이 시험 오답 목록을 덮어쓰지 않는다(오답 모드 합집합)"는
이름이 F-4와 겹치지만 **다른 축**(시험 키 ↔ 랜덤 키)을 검사합니다. 그 둘은 원래 키가 달라 덮어쓰지 않으므로
이 테스트는 **F-4 수정 전후 모두 통과**합니다. 이름이 비슷한 검사가 있으면 "이미 덮여 있다"고 오판하기 쉬운 자리입니다.

## 검사 품질 — 565개 테스트 전수 계량

| 항목 | 유닛 126 | E2E 439 |
|---|---:|---:|
| 단언이 없는 테스트 | 0 | 0 |
| 무의미 단언(`true === true`) | 0 | 0 |
| `.skip` / `.todo` | 0 | 0 |
| `.only`(스위트 무력화) | 0 | 0 |
| 지문 가시성만으로 상태 단언(하네스 README 금지) | — | 0 |

후보로 잡힌 2건(`react-back-dismiss` · `react-state-matrix`)은 각각 `toHaveCount(0)`와
누적 `bad()` + 최종 `expect(problems).toEqual([])`로 **실제 상태를 재고 있어** 위반이 아닙니다.

---

## HTML 리포트

3회차 전체를 한 장으로 정리한 HTML 리포트를 `docs/code-audit-report.html`에 두었습니다
(기존 `docs/qa-report.html`의 토큰 체계를 그대로 따릅니다).
