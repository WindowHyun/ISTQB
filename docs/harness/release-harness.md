# 릴리스 하네스

## 적용 범위

릴리스 준비, 넓은 범위의 변경, 또는 앱의 여러 영역을 동시에 건드리는 작업에는 이 하네스를 사용합니다.

> 이 문서는 **전달 전 검증**을 다룹니다. 검증을 마친 뒤 실제로 내보내는 절차(버전·태그, Vercel/Firebase 배포, 실기기 스모크, 데이터 정정 배포, 롤백)는 [`../release-playbook.md`](../release-playbook.md)에 있습니다.

## 목표

릴리스 하네스는 전달 전 최종 신뢰도를 확보하기 위해 관련 영역 하네스를 조합해야 합니다.

## 릴리스 체크리스트

### 1. 변경 영역 분류

diff를 검토하고 릴리스에 다음 영역이 포함되는지 확인합니다.

- 데이터 변경
- UI/렌더링 변경
- 앱 로직 변경
- Android/패키징 변경
- 문서 전용 변경

### 2. 관련 하네스 실행

항상 다음을 실행합니다(CI가 같은 것을 게이트로 돌리지만, 릴리스 전에는 손으로 한 번 통과시켜 둡니다).

```bash
npm run lint && npm run typecheck && npm run typecheck:test   # 정적 게이트
npm run verify                                                # 문제 데이터·콘텐츠 감사
npm test                                                      # 유닛
npm run test:e2e                                              # React 기능 E2E
```

영향 범위에 따라 추가로 실행합니다.

```bash
npm run test:nf                # 성능·오프라인·타이머·저장 내구성을 건드렸다면
npm run test:apk               # 모바일 레이아웃·안전영역·터치 타깃을 건드렸다면
npm run test:mutation          # 채점·통계 순수 로직을 고쳤다면 (break 85)
npm run test:mutation:storage  # storage.ts·useQuizStore.ts를 고쳤다면 (break 68, 약 12분)
python3 scripts/verify-pdf-data.py   # www/data/** 를 수정했다면 (원본 PDF 대조)
```

> Playwright 스위트는 **한 번에 하나씩** 돌립니다. 여러 개가 필요하면 `npm run test:e2e:all`로
> 한 번에 호출하세요 — 이유는 [`README.md`](./README.md)의 동시 실행 주의사항 참고.

눈에 보이는 UI 변경이 있다면 `ui-render-harness.md`의 시각 감사를 실행합니다.

Android 패키징 변경이 있다면 `android-build-harness.md`의 점검을 실행합니다.

의존성을 추가했다면 `dependencies` / `devDependencies` 분류를 확인합니다 — 빌드·테스트 전용은
`devDependencies`입니다. 잘못 넣으면 `audit` 게이트가 배포되지도 않는 패키지 때문에 막힙니다.

### 3. 생성 산출물 확인

생성 파일 또는 로컬 전용 파일이 실수로 커밋되지 않았는지 확인합니다.

- `node_modules/`
- `android/**/build/`
- `android/local.properties`
- `*.apk`
- `*.aab`
- `*.jks`
- `*.keystore`

### 4. 사용자 관점 동작 검토

릴리스에 영향을 주는 변경이라면 다음을 확인합니다.

- 앱이 로컬 서버에서 로드되는지 확인합니다.
- 예상 문제 세트가 표시되는지 확인합니다.
- 연습 모드와 시험 모드의 기본 동작이 유지되는지 확인합니다.
- 대표 문제의 이미지와 표가 정상 렌더링되는지 확인합니다.
- 오프라인/PWA 동작이 의도치 않게 변경되지 않았는지 확인합니다.
- **IndexedDB·Blob 다운로드·서비스워커·Date 파싱 등 엔진 계층이나 렌더링을 크게 건드렸다면,
  실기기 Safari(아이폰·맥)로 30초 직접 확인합니다.** 자동 Safari 게이트는 투자 대비 효과로
  제거했으므로 이 수동 점검이 그 자리를 대신합니다(알려진 렌더 비용은 `ui-render-harness.md`).

## 보고 체크리스트

최종 응답 또는 릴리스 노트에는 다음을 포함합니다.

- 변경 영역
- 실행한 하네스
- 명령과 결과
- 알려진 한계 또는 생략한 점검
- 아직 권장되는 수동 검토
