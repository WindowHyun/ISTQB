# 실 배포 플레이북

**대상 독자**: 이 저장소를 실제 사용자에게 내보내는 사람.
**기존 문서와의 관계**: [`harness/release-harness.md`](./harness/release-harness.md)가 "전달 전 무엇을 검증할 것인가"라면, 이 문서는 **"검증이 끝난 뒤 실제로 어떻게 내보내는가"** 를 다룹니다. 하네스가 끝나는 지점에서 이 문서가 시작합니다.

배포 대상은 둘이고 **서로 독립**입니다.

| 대상 | 채널 | 산출물 | 트리거 |
| --- | --- | --- | --- |
| 웹 | Vercel | `dist/` 정적 빌드 | `main` 푸시 시 자동 |
| Android | Firebase App Distribution | `app-debug.apk` | 수동 실행 또는 `v*` 태그 |

> ⚠️ **저작권 — 공개 배포 금지**
> ISTQB®/TTA 기출은 제3자 저작권물입니다. 공개 스토어·공개 링크 배포는 부적절합니다.
> 웹은 Basic Auth로 잠그고, APK는 비공개 테스터 그룹에만 배포합니다. 이 제약은 선택이 아니라 **배포의 전제**입니다.

---

## 0. Go / No-Go 체크리스트

배포를 시작하기 전에 **전부** 통과해야 합니다. 하나라도 아니면 배포하지 않습니다.

```bash
npm ci                  # 락파일 고정 설치 (install 아님)
npm run lint            # ESLint
npm run typecheck       # 앱 타입
npm run typecheck:test  # 테스트·e2e 타입
npm test                # 단위 (커버리지 게이트)
npm run verify          # 데이터 정합성 (정답·이미지·스키마·재수록 표)
npm run build           # tsc → dist
npm run size            # 번들 크기 예산
```

원본 PDF 대조까지 돌리려면(`pymupdf` 필요):

```bash
python3 scripts/verify-pdf-data.py
```

E2E는 시간이 걸리므로 **CI 결과로 갈음**합니다. 로컬에서 굳이 돌린다면:

```bash
npm run test:e2e    # 기능 (Chromium)
npm run test:apk    # Pixel 7 + WebView UA
npm run test:nf     # 비기능
```

### 판단 기준

| 항목 | 기준 |
| --- | --- |
| CI 14 job | **전부 green**. 하나라도 red면 배포 중단 |
| 배포 대상 커밋 | `main`에 있고, CI가 **그 커밋에서** 통과했을 것 |
| 생성 산출물 미커밋 | `node_modules/` · `android/**/build/` · `android/local.properties` · `*.apk` · `*.aab` · `*.jks` · `*.keystore` |
| 알려진 이슈 | 아래 [6. 현재 알려진 이슈](#6-현재-알려진-이슈와-배포-판단) 확인 |

`git status`가 깨끗한지 확인하고, **PR CI가 아니라 `main`의 CI**를 봅니다. PR CI는 병합 결과가 아니라 브랜치를 검증합니다.

---

## 1. 버전 올리기

`package.json`의 `version`은 현재 `1.0.2-dev`입니다. 실 배포에는 `-dev`를 뗍니다.

```bash
# 1) 버전 수정 (package.json)
#    1.0.2-dev  →  1.0.2

# 2) 커밋
git add package.json package-lock.json
git commit -m "release: v1.0.2"

# 3) main에 병합 후 태그
git tag v1.0.2
git push origin main
git push origin v1.0.2
```

> **태그를 밀면 Android 워크플로가 자동으로 돕니다**(`v*` 트리거). 웹만 배포하고 APK는 나중에 하려면 **태그를 밀지 말고** `main` 푸시만 합니다.

현재 저장소에는 태그가 하나도 없습니다. 첫 태그를 만드는 것이라면 위 순서가 그대로 첫 릴리스가 됩니다.

---

## 2. 웹 배포 (Vercel)

### 자동

`main`에 푸시하면 Vercel이 자동 배포합니다. 설정은 `vercel.json`에 있습니다.

```json
{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }
```

`.vercelignore`가 `android/` · `docs/` · `tmp/` · `.gemini/`를 제외하므로 배포 번들에는 앱만 들어갑니다.

### 최초 1회만 — 사이트 잠금 설정

`middleware.ts`(Vercel Edge Middleware)가 사이트 전체를 HTTP Basic Auth로 잠급니다. 페이지뿐 아니라 `/data/*.json`·이미지까지 전부 이 관문을 지납니다.

Vercel 대시보드 → **Settings → Environment Variables**:

| 변수 | 값 |
| --- | --- |
| `SITE_USER` | 공유할 아이디 |
| `SITE_PASS` | 공유할 비밀번호 |

등록 후 **재배포해야 반영**됩니다.

> **fail-closed**: 환경변수가 없으면 사이트가 열리는 대신 **503으로 차단**됩니다. 보호가 조용히 풀리는 것을 막기 위한 의도된 동작이므로, 배포 후 503이 뜨면 먼저 이 변수를 확인합니다.

비밀번호에 **한글·이모지 등 비ASCII 문자를 써도 됩니다.** 종전에는 `btoa`가 Latin-1만 받아
그런 값에서 미들웨어가 예외로 죽고 **모든 요청이 500**이 됐습니다(첫 화면조차 안 뜨고 원인은
응답에 안 드러남 — fail-closed가 아니라 fail-broken). 지금은 UTF-8로 인코딩해 비교하며,
401에 광고하는 `charset="UTF-8"`과도 일치합니다.

> `middleware.ts`는 Vercel이 별도로 번들하므로 **앱 빌드(`npm run build`)에서 안 걸립니다.**
> 종전에는 앱 `tsconfig`의 `include`가 `src`뿐이라 타입 검사도 유닛도 없었습니다 — 운영 접근을
> 결정하는 파일이 어떤 게이트에도 안 걸려 있었습니다. 지금은 `npm run typecheck:test`가 타입을
> 보고 `middleware.test.ts`(14건)가 통과·차단·503·비ASCII 경로를 고정합니다.

### 캐시 헤더

`vercel.json`이 `sw.js` · `service-worker.js` · `registerSW.js`에 `Cache-Control: no-cache`를 겁니다. **이 설정을 지우면 사용자가 새 버전을 영영 못 받을 수 있습니다** — 서비스워커 자신이 캐시되면 갱신 경로가 막히기 때문입니다.

---

## 3. APK 배포 (Firebase App Distribution)

상세 설정(Firebase 프로젝트 생성, 서비스 계정 키 발급)은 [`firebase-app-distribution.md`](./firebase-app-distribution.md)에 있습니다. 여기서는 **배포 실행**만 다룹니다.

### 방법 A — GitHub Actions (권장, Android SDK 불필요)

Actions 탭 → **"Android → Firebase App Distribution"** → Run workflow

| 입력 | 기본값 |
| --- | --- |
| 릴리스 노트 | `새 빌드` |
| 테스터 그룹 | `WiseStoneT` |

또는 `v*` 태그를 밀면 자동 실행됩니다.

필요한 Secrets (Settings → Secrets and variables → Actions):

| Secret | 값 |
| --- | --- |
| `FIREBASE_ANDROID_APP_ID` | `1:1234567890:android:abcdef…` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 서비스 계정 키 JSON 전체 |

### 방법 B — 로컬 (Android SDK 보유 시)

```bash
npm run build
npm run cap:sync

cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

firebase appdistribution:distribute \
  android/app/build/outputs/apk/debug/app-debug.apk \
  --app "<FIREBASE_ANDROID_APP_ID>" \
  --groups "WiseStoneT" \
  --release-notes "v1.0.2"
```

> debug APK는 디버그 키로 서명됩니다. App Distribution 테스터 배포에는 충분합니다. 배포 채널을 넓히려면 `assembleRelease` + keystore가 필요합니다.

---

## 4. 배포 후 스모크 (실기기)

자동화가 잡지 못하는 것만 손으로 봅니다. **5분**이면 됩니다.

### 웹

- [ ] Basic Auth 창이 뜨고, 아이디/비밀번호로 들어가진다
- [ ] 제품 게이트(ISTQB / CSTS)가 뜬다
- [ ] 세트를 골라 문항이 뜨고, 이미지·표가 깨지지 않는다
- [ ] 답을 고르면 진행률이 오르고, 채점이 된다
- [ ] 새로고침해도 진행이 남아 있다
- [ ] **비행기 모드로 바꿔도 계속 풀린다** (PWA 오프라인)
- [ ] 통계 화면에 챕터 분석이 뜬다

### APK

- [ ] 테스터에게 알림이 갔고 설치된다
- [ ] 상단 상태바에 콘텐츠가 가리지 않는다 (안전영역)
- [ ] 하단 액션바가 시스템 제스처와 겹치지 않는다
- [ ] 오프라인에서 동작한다 (데이터가 번들돼 있어야 함)

### 갱신 확인 (웹, 재배포한 경우)

- [ ] 기존 사용자에게 하단 **"새 버전이 있습니다"** 배너가 뜬다
- [ ] 배너를 누르면 새 버전으로 갱신된다

---

## 5. 롤백

### 웹 — 즉시 가능

Vercel 대시보드 → Deployments → 직전 정상 배포 → **Promote to Production**.
빌드 없이 즉시 전환되므로 가장 빠른 수습 경로입니다.

코드로 되돌릴 때:

```bash
git revert <bad-commit>
git push origin main       # 자동 재배포
```

> **주의**: 서비스워커 때문에 이미 새 버전을 받은 사용자는 롤백 후에도 한 번 더 갱신을 거쳐야 합니다. 캐시 헤더(`no-cache`)가 살아 있으면 자동으로 풀립니다.

### APK — 재배포만 가능

App Distribution에는 "내리기"가 없습니다. **직전 정상 버전을 다시 올려** 덮습니다. 이미 설치한 테스터에게는 새 알림이 갑니다.

---

## 6. 현재 알려진 이슈와 배포 판단

배포 시점에 반드시 확인합니다. 아래는 **2026-08-01 기준**입니다.

| 이슈 | 내용 | 배포 영향 |
| --- | --- | --- |
| [#169](https://github.com/WindowHyun/ISTQB/issues/169) | Safari 문항 렌더마다 ~1초 블록 (레이아웃·페인트) | **판단 보류** — 아래 참고 |
| [#171](https://github.com/WindowHyun/ISTQB/issues/171) | Safari 검증 범위 | **자동 게이트 제거** — 투자 대비 효과 판단(2026-08-07). 배포 전 실기기 Safari 수동 확인으로 대체 |
| [#170](https://github.com/WindowHyun/ISTQB/issues/170) | 퀵 저장 디바운스 flaky | 해소됨(`expect.poll`) |
| [#173](https://github.com/WindowHyun/ISTQB/issues/173) | 분할 파싱 시도 기록 | 되돌림 — 재시도 전 필독 |

### #169에 대한 배포 판단

**측정 근거는 리눅스 헤드리스 CI 러너뿐이며, 실기기 macOS·iOS Safari에서 재현되는지는 확인되지 않았습니다.** 원인이 레이아웃·페인트로 좁혀졌는데, 그 계층이 바로 CI 환경과 실기기의 차이가 가장 큰 부분입니다(소프트웨어 래스터 vs GPU 합성).

배포 전에 **아이폰이나 맥 Safari로 30초만** 확인하십시오.

- 문항마다 눈에 띄게 버벅이면 → 실제 결함. 배포는 가능하나 우선순위를 올려야 합니다
- 매끄러우면 → CI 환경 아티팩트. 앱을 고칠 것이 아니라 계측을 고쳐야 합니다

어느 쪽이든 **기능 결함은 아니었습니다**(제거 시점까지 WebKit 스위트 전부 통과). 사용자가 못 쓰는 상태는 아닙니다.

> 자동 Safari 게이트는 제거했습니다. 렌더링을 크게 건드린 릴리스에서는 이 항목이 **수동 점검**입니다.

---

## 7. 자주 틀리는 것

실제로 이 저장소에서 겪은 것들입니다.

| 함정 | 증상 | 대응 |
| --- | --- | --- |
| **서비스워커 잔존** | 새 버전을 배포했는데 사용자에게 옛 화면이 보임 | `vercel.json`의 `no-cache` 헤더를 지우지 말 것. 과거 레거시 SW 때문에 실제로 겪었고 자가 해제 tombstone으로 해소했음 |
| **`SITE_USER`/`SITE_PASS` 미등록** | 배포 후 사이트 전체 503 | fail-closed 동작. Vercel 환경변수 등록 후 **재배포** |
| **`npm install`로 배포 빌드** | 로컬은 되는데 CI/배포에서 깨짐 | 반드시 `npm ci`(락파일 고정) |
| **데이터만 고치고 `verify` 생략** | 재수록 표가 낡아 챕터 통계 분모가 부풀음 | `npm run verify`가 `build-duplicate-groups --check`로 막아 줌. 문항을 고쳤으면 `npm run data:dupes` 후 커밋 |
| **`android/` 산출물 커밋** | 저장소 비대·CI 실패 | `android-build` job의 "Fail if committed Android project is stale"이 잡아 줌 |
| **태그를 먼저 밀어 APK가 의도치 않게 배포** | 테스터에게 검증 안 된 빌드가 감 | 웹만 낼 때는 태그를 밀지 말 것 |
| **PR CI만 보고 배포** | 병합 결과가 아니라 브랜치를 본 것 | `main`의 CI가 green인지 확인 |

---

## 8. 배포 기록 남기기

배포 후 다음을 남깁니다. 다음 사람이 "무엇이 언제 나갔는가"를 재구성할 수 있어야 합니다.

- 배포한 커밋 SHA와 태그
- 웹/APK 중 무엇을 냈는지
- 실기기 스모크 결과 (통과/미실시)
- 알면서 안고 간 이슈 (있다면 번호와 이유)
- 생략한 점검이 있다면 무엇을 왜

`npm run verify`나 CI가 잡아 주지 못하는 것은 **사람이 봤다는 기록**뿐입니다. 위 4번 스모크를 실제로 했는지 여부를 반드시 적으십시오 — "했겠지"는 기록이 아닙니다.
