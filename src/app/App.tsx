import React, { useEffect, useState, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { restorePersistentSnapshot, flushPersist } from '../utils/storage';
import { safeSetItem } from '../utils/safeStorage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { UserGuide } from '../components/common/UserGuide';
import { FEEDBACK_SHEET_URL } from '../utils/links';
import { MobileTopBar } from '../components/layout/MobileTopBar';
import { AppModals } from '../components/modals/AppModals';
import { MODE_LABEL } from '../utils/modeLabel';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { BACK_PRIORITY, initHardwareBackButton } from '../utils/backGuard';
import { watchSystemBarColors } from '../utils/nativeSystemBars';

const Sidebar = React.lazy(() => import('../components/layout/Sidebar').then(module => ({ default: module.Sidebar })));
const QuestionWorkspace = React.lazy(() => import('../components/quiz/QuestionWorkspace').then(module => ({ default: module.QuestionWorkspace })));
const WrongViewScreen = React.lazy(() => import('../components/quiz/WrongViewScreen').then(module => ({ default: module.WrongViewScreen })));

// 모드 전환 라이브 알림(B4) — 모드 버튼의 aria-pressed로는 전달되지 않는 프로그램적
// 전환(챕터 집중 연습 진입 등)도 스크린리더가 인지하게 한다. 시각적으로는 숨김.
const ModeAnnouncer = () => {
  const mode = useQuizStore((s) => s.mode);
  const label = MODE_LABEL[mode];
  return <span className="sr-only" role="status">{label ? `${label} 모드` : ''}</span>;
};

export const App = () => {
  // 슬라이스 구독(O1) — 앱 셸이 타이머 틱·답안 변경에 리렌더되지 않는다.
  const { mode, activeProduct, drawerOpen, wrongView, setMode, setActiveProduct, setDrawerOpen, resetToGate } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, activeProduct: s.activeProduct, drawerOpen: s.drawerOpen,
      // 오답 보기는 풀이 화면을 **대신** 차지한다(팝업이 아니다).
      wrongView: s.wrongView,
      setMode: s.setMode, setActiveProduct: s.setActiveProduct,
      setDrawerOpen: s.setDrawerOpen, resetToGate: s.resetToGate,
    })));
  const [isRestored, setIsRestored] = useState(false);
  // 사용설명서 — 게이트 화면은 앱 셸(AppModals) 밖이라 로컬 상태로 연다.
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    // 진입 시 항상 제품 선택 화면(게이트)을 먼저 보여준다(#5).
    // 저장된 답안/진행 상태는 제품을 선택하는 순간 복원한다(handleProductSelect).
    setIsRestored(true);
    // 안드로이드 하드웨어 뒤로가기 연결(웹에서는 no-op).
    void initHardwareBackButton();
  }, []);

  // 테마를 앱 바깥 크롬 색에 잇는다 — APK 네이티브 시스템 바 + PWA theme-color.
  // 셸이 아니라 여기 두는 이유는 nativeSystemBars의 주석 참고 — 게이트 화면이 셸 밖이다.
  useEffect(() => watchSystemBarColors(), []);

  // 뒤로가기로 닫히는 오버레이 — 드로어는 그 위에 열린 모달이 먼저 닫히도록 최하위.
  useBackDismiss(drawerOpen, () => setDrawerOpen(false), BACK_PRIORITY.drawer);
  useBackDismiss(guideOpen, () => setGuideOpen(false), BACK_PRIORITY.confirm);

  // 페이지가 닫혔다 다시 열릴 때(bfcache 복원 포함) 이전 화면이 남아도 항상 최초 화면으로 되돌린다.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetToGate();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [resetToGate]);

  // 모바일 드로어: Esc로 닫기.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  // 드로어를 연 채 뷰포트가 데스크톱 폭(>880px)이 되면 닫는다 — 상시 사이드바로 전환된
  // 뒤에도 dialog/포커스 트랩·백드롭이 남는 잔존 상태를 방지(CSS 브레이크포인트와 동일 기준).
  useEffect(() => {
    if (!drawerOpen) return;
    const mq = window.matchMedia('(min-width: 881px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false); };
    if (mq.matches) { setDrawerOpen(false); return; }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [drawerOpen, setDrawerOpen]);

  // 복원이 끝날 때까지 게이트가 그대로 보인다(mode는 아래 await 뒤에야 바뀐다).
  // 그래서 "반응이 없네" 하고 다른 제품을 누르면 복원이 겹친다 — 저장 계층에서 키 오염은
  // 막았지만(storage.gaterace.test.ts), 겹치면 늦게 끝난 쪽이 최종 제품이 되어
  // **누른 것과 다른 자격증으로 들어간다.** 진행 중임을 보여 주고 재진입을 막는다.
  const [selecting, setSelecting] = useState<'istqb' | 'csts' | null>(null);

  const handleProductSelect = async (product: 'istqb' | 'csts') => {
    if (selecting) return; // 재진입 차단 — 첫 클릭이 이긴다.
    setSelecting(product);
    // finally로 푸는 이유: 성공하면 mode가 바뀌어 게이트가 사라지므로 해제가 무의미하지만,
    // 앞단(flushPersist 등)이 던지면 게이트가 영구히 잠긴 채 남는다.
    try {
      // 제품을 바꾸기 전에 이전 제품의 대기 중 저장을 지금 flush한다(#P1-1 방어).
      // 디바운스 저장은 실행 시점의 activeProduct로 키를 정하므로, 남은 저장이 새 제품 키에
      // 잘못 기록되는 경합 창을 없앤다. 최초 진입(activeProduct=null) 시에는 내부에서 no-op.
      flushPersist();
      safeSetItem("istqb-fl-v4-sample-last-product", product);
      setActiveProduct(product);
      await restorePersistentSnapshot(product);
      // 저장된 모드(시험 등)를 그대로 이어간다. 게이트 모드('home')/무효면 연습으로 폴백(#1).
      const restoredMode = useQuizStore.getState().mode;
      setMode(restoredMode && restoredMode !== 'home' ? restoredMode : 'practice');
    } finally {
      setSelecting(null);
    }
  };

  if (!isRestored) {
    return <div className="loading">앱 로딩 중...</div>;
  }

  if (mode === 'home' || !activeProduct) {
    return (
      // 게이트도 경계 안에 둔다 — 종전에는 워크스페이스만 감싸서, 제품 선택 화면에서
      // 렌더 예외가 나면 폴백 없이 백지가 됐다(재시도 버튼조차 없다).
      <ErrorBoundary>
      <section className="product-gate" aria-labelledby="productGateTitle">
        <div className="product-gate-stack">
        <div className="product-gate-inner">
          <p className="product-eyebrow">Practice App</p>
          <h1 id="productGateTitle">학습할 자격증을 선택하세요</h1>
          <p className="product-gate-sub">12세트 · 626문항 전체 무료 · 회원가입 없이 바로 풀이</p>
          <div className="product-actions">
            {/* 복원 중에는 둘 다 잠근다 — 아무 반응이 없으면 사용자는 다시 누르고,
                그 연타가 복원 겹침을 만든다(핸들러 가드와 이중 방어). */}
            <button
              className="product-button primary"
              disabled={selecting !== null}
              aria-busy={selecting === 'istqb'}
              data-testid="gate-istqb"
              onClick={() => handleProductSelect('istqb')}
            >
              {selecting === 'istqb' ? '불러오는 중…' : (
                <span className="product-button-label">
                  <span className="product-button-name">ISTQB</span>
                  <span className="product-button-meta">5세트 · 186문항</span>
                </span>
              )}
            </button>
            <button
              className="product-button"
              disabled={selecting !== null}
              aria-busy={selecting === 'csts'}
              data-testid="gate-csts"
              onClick={() => handleProductSelect('csts')}
            >
              {selecting === 'csts' ? '불러오는 중…' : (
                <span className="product-button-label">
                  <span className="product-button-name">CSTS</span>
                  <span className="product-button-meta">7세트 · 440문항</span>
                </span>
              )}
            </button>
          </div>
          {/* 첫 방문자용 사용설명서·제보 채널 — 제품 선택 전에도 접근할 수 있게 게이트 하단에 둔다. */}
          <div className="gate-links">
            <button
              type="button"
              className="gate-guide-btn"
              aria-haspopup="dialog"
              data-testid="guide-open"
              onClick={() => setGuideOpen(true)}
            >
              📖 사이트 사용법
            </button>
            <a
              className="gate-guide-btn feedback-link"
              href={FEEDBACK_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="feedback-link-gate"
            >
              📝 이슈·보완점 제보
            </a>
          </div>
        </div>

        <section className="gate-info-card" aria-label="제공 콘텐츠">
          <h2>제공 콘텐츠</h2>
          <ul className="gate-content-list">
            <li><span className="gci-bullet" aria-hidden="true">·</span><span><strong>기출·예제 626문항</strong> — ISTQB FL v4.0 샘플문제 5세트, CSTS 기출·예제 7세트 전체 수록</span></li>
            <li><span className="gci-bullet" aria-hidden="true">·</span><span><strong>연습·시험·랜덤·오답·퀵 5가지 모드</strong> — 즉시 채점 연습부터 제한시간이 있는 실전 CBT형 시험까지</span></li>
            <li><span className="gci-bullet" aria-hidden="true">·</span><span><strong>챕터별 약점 분석</strong> — ISTQB 6챕터·CSTS 6도메인 단위 정답률과 회차별 성장 추이</span></li>
            <li><span className="gci-bullet" aria-hidden="true">·</span><span><strong>오답노트 자동 누적</strong> — 세트별 전 회차 오답 합집합, 퀵 모드 오답은 24시간 임시 목록</span></li>
            <li><span className="gci-bullet" aria-hidden="true">·</span><span><strong>오프라인 PWA</strong> — 설치 후 인터넷 없이 전 세트 풀이, 진행 상태 자동 저장</span></li>
          </ul>
        </section>

        <section className="gate-info-card" aria-label="다루는 주요 챕터">
          <h2>다루는 주요 챕터</h2>
          <div className="gate-chapter-grid">
            <div>
              <p className="gate-chapter-cert">ISTQB Foundation Level v4.0</p>
              <p className="gate-chapter-list">테스트 기초, SDLC 전반의 테스트, 정적 테스트, 테스트 분석 및 설계, 테스트 활동 관리, 테스트 도구</p>
            </div>
            <div>
              <p className="gate-chapter-cert">CSTS Foundation/일반등급</p>
              <p className="gate-chapter-list">소프트웨어 테스트 기초, 개발과 테스트, 정적 테스트, 테스트 기법, 테스트 관리, 프로세스와 도구</p>
            </div>
          </div>
        </section>

        <section className="gate-info-card" aria-label="세트별 문항 구성">
          <h2>세트별 문항 구성</h2>
          <ul className="gate-set-list">
            <li><span className="gs-title">ISTQB FL v4.0 샘플문제 A~E</span><span className="gs-count">5세트 · 186문항</span></li>
            <li><span className="gs-title">CSTS 기출·예제 세트 1~7</span><span className="gs-count">7세트 · 440문항</span></li>
          </ul>
        </section>

        <section className="gate-info-card gate-info-card-muted" aria-label="자격증 안내">
          <h2>자격증 안내</h2>
          <p className="gate-cert-note">
            ISTQB(International Software Testing Qualifications Board) Foundation Level은 국제 표준 소프트웨어 테스트 자격이며,
            CSTS(SW 테스트 전문가)는 한국정보통신기술협회(TTA)가 시행하는 국내 자격입니다.
            ISTQB는 정답률 65% 이상, CSTS는 검정방법별 배점 합산 75점 이상(100점 만점)이면 합격입니다.
          </p>
        </section>

        <footer className="gate-footer">
          <span>문제 콘텐츠 © ISTQB® / 한국정보통신기술협회(TTA) — 개인 학습 목적, 재배포·상업적 이용 불가</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="gate-footer-link" onClick={() => setGuideOpen(true)}>사용법</button>
          <span aria-hidden="true">·</span>
          <a
            className="gate-footer-link"
            href={FEEDBACK_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            이슈 제보
          </a>
        </footer>
        </div>
        {guideOpen && <UserGuide onClose={() => setGuideOpen(false)} />}
      </section>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="loading">워크스페이스 로딩 중...</div>}>
        {/* 키보드 사용자용 본문 바로가기(B3) — 포커스될 때만 보인다. */}
        <a className="skip-link" href="#questionStem">본문 바로가기</a>
        <MobileTopBar />
        <main className="app-shell" data-drawer={drawerOpen ? 'open' : 'closed'} aria-label={`${activeProduct.toUpperCase()} 문제풀이 앱`}>
          <ModeAnnouncer />
          <Sidebar />
          {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
          {/* 오답 보기가 열려 있으면 그 문항 하나를 본문에 펼친다 — 풀이 상태(모드·위치·
              답안)는 그대로 두고 화면만 바꾼다. '풀이로 돌아가기'가 원래 자리로 돌린다. */}
          {wrongView ? <WrongViewScreen /> : <QuestionWorkspace />}
        </main>
        <AppModals />
      </Suspense>
    </ErrorBoundary>
  );
};
