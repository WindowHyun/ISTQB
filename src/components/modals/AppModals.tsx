import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, ExamHistory, QUICK_SET_ID, freshQuickRounds } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { gradeKeyFor } from '../../utils/answerKey';
import { useTheme, ThemePref } from '../../hooks/useTheme';
import { exportUserData, importUserData, removeHistoriesEverywhere } from '../../utils/storage';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';
import { showToast } from '../../utils/toast';
import { isDebugEnabled, setDebugEnabled } from '../../utils/debugLog';
import { Modal } from '../common/Modal';
import { ConfirmButtons } from '../common/ConfirmButtons';
import { UserGuide } from '../common/UserGuide';
import { StatsDashboard } from '../stats/StatsDashboard';
import { latestAttemptComparison } from '../../utils/attemptStats';
import { buildWrongNoteBySet, WrongNoteSetView } from '../../utils/wrongNote';
import { ResultSummary } from '../quiz/ResultSummary';
import { QuestionPalette } from '../quiz/QuestionPalette';
import { Question } from '../../hooks/useQuestions';
import { loadSetQuestions, peekSetQuestions } from '../../utils/questionLoader';
import { RichText } from '../../utils/parser';
import { MODE_LABEL } from '../../utils/modeLabel';
import { formatAnswerList } from '../../utils/answerDisplay';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import { BACK_PRIORITY } from '../../utils/backGuard';

// 오답노트 3단계(문항 보기)용 세트 문항 로더 — 본문(useQuestions)과 같은 공용
// 로더(questionLoader)를 사용해 같은 세트를 다시 내려받지 않는다.
// 이미 로드된 세트는 peek로 동기 렌더해 재진입 시 로딩 프레임이 깜빡이지 않는다.
function useWrongNoteQuestions(path: string | null, setId: string | null): Question[] | null {
  const [questions, setQuestions] = useState<Question[] | null>(
    () => (path && peekSetQuestions(path)) || null,
  );
  useEffect(() => {
    if (!setId || !path) { setQuestions(null); return; }
    const cached = peekSetQuestions(path);
    if (cached) { setQuestions(cached); return; }
    let cancelled = false;
    loadSetQuestions(path)
      .then((qs) => { if (!cancelled) setQuestions(qs); })
      .catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, [path, setId]);
  return questions;
}

const FONT_SIZES: { value: 'small' | 'normal' | 'large'; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'normal', label: '기본' },
  { value: 'large', label: '크게' },
];

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

type FontSize = 'small' | 'normal' | 'large';

// 앱 루트에 렌더되는 모든 오버레이(설정·통계·오답노트·결과·문항이동).
// 드로어(transform)의 자식이 아니어서 position:fixed 오버레이가 정상 동작한다.
export const AppModals = () => {
  // 슬라이스 구독(O1). elapsedSeconds는 결과 모달이 열려 있을 때만 반영해
  // 닫혀 있는 동안 타이머 틱으로 리렌더되지 않게 한다(열려 있으면 기존처럼 초 단위 갱신).
  const {
    setId, mode, activeProduct, histories, quickRounds, resultElapsedSeconds, chapterFilter,
    settingsOpen, statsOpen, wrongNoteOpen, resultOpen, paletteOpen, confirmGradeOpen, resumePrompt,
    quitExamOpen, gradedResume, pendingSetChange,
    setSettingsOpen, setStatsOpen, setWrongNoteOpen, setResultOpen, setPaletteOpen, setDrawerOpen, setConfirmGradeOpen,
    setMode, beginSession, clearAnswers, setReviewIds, setSetId, setChapterFilter, setResumePrompt,
    resetProgressForSets, clearQuickRounds,
    setQuitExamOpen, setGradedResume, setRandomDraw,
    setPendingSetChange, commitSetChange, reviewedOk,
    pendingRedraw, setPendingRedraw, pendingRestart, setPendingRestart, setResumeNotice,
    confirmExitExam, setConfirmExitExam,
    redrawRandom, resetToGate,
  } = useQuizStore(useShallow((s) => ({
    setId: s.setId, mode: s.mode, activeProduct: s.activeProduct, histories: s.histories,
    quickRounds: s.quickRounds, clearQuickRounds: s.clearQuickRounds,
    resultElapsedSeconds: s.resultOpen ? s.elapsedSeconds : 0,
    chapterFilter: s.chapterFilter,
    settingsOpen: s.settingsOpen, statsOpen: s.statsOpen, wrongNoteOpen: s.wrongNoteOpen,
    resultOpen: s.resultOpen, paletteOpen: s.paletteOpen, confirmGradeOpen: s.confirmGradeOpen,
    resumePrompt: s.resumePrompt,
    quitExamOpen: s.quitExamOpen, gradedResume: s.gradedResume,
    pendingSetChange: s.pendingSetChange,
    setSettingsOpen: s.setSettingsOpen, setStatsOpen: s.setStatsOpen, setWrongNoteOpen: s.setWrongNoteOpen,
    setResultOpen: s.setResultOpen, setPaletteOpen: s.setPaletteOpen, setDrawerOpen: s.setDrawerOpen,
    setConfirmGradeOpen: s.setConfirmGradeOpen, setMode: s.setMode, beginSession: s.beginSession,
    clearAnswers: s.clearAnswers, setReviewIds: s.setReviewIds, setSetId: s.setSetId,
    resetProgressForSets: s.resetProgressForSets,
    setChapterFilter: s.setChapterFilter, setResumePrompt: s.setResumePrompt,
    setQuitExamOpen: s.setQuitExamOpen, setGradedResume: s.setGradedResume,
    setRandomDraw: s.setRandomDraw,
    setPendingSetChange: s.setPendingSetChange, commitSetChange: s.commitSetChange,
    reviewedOk: s.reviewedOk,
    pendingRedraw: s.pendingRedraw, setPendingRedraw: s.setPendingRedraw,
    pendingRestart: s.pendingRestart, setPendingRestart: s.setPendingRestart,
    setResumeNotice: s.setResumeNotice,
    confirmExitExam: s.confirmExitExam, setConfirmExitExam: s.setConfirmExitExam,
    redrawRandom: s.redrawRandom, resetToGate: s.resetToGate,
  })));
  // examLocked — useQuizSession이 단일 원천(게이트·사이드바 잠금과 동일 규칙 집합).
  const { appData, total, answered, correctCount, cstsWeighted, gradeAndShow, examLocked } = useQuizSession();
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (safeGetItem('istqb-q-font') as FontSize) || 'normal',
  );
  const [debugOn, setDebugOn] = useState(() => isDebugEnabled());
  // 오답 노트 팝업에서 선택한 세트(null이면 세트 목록 화면).
  const [wrongNoteSetId, setWrongNoteSetId] = useState<string | null>(null);
  // 오답 노트 3단계: 선택한 오답 문항 번호(null이면 오답 목록 화면). 팝업 안에서 문제를 다시 본다.
  const [wrongNoteQuestionNo, setWrongNoteQuestionNo] = useState<number | null>(null);
  // 응시 중 '처음 화면으로' 확인 — 잠금을 옆문으로 조용히 우회하지 않게 명시적 확인을 거친다
  // (답안은 저장되므로 파괴적이지 않음 → 로컬 상태로 충분, 다른 컴포넌트가 열 일 없음).
  const [confirmHomeOpen, setConfirmHomeOpen] = useState(false);
  // 사용설명서 — 게이트 하단 버튼과 동일한 문서를 설정에서도 연다(풀이 중 재열람 경로).
  const [guideOpen, setGuideOpen] = useState(false);
  // 가져오기는 저장소마다 정책이 다르다 — 이력은 합쳐지고(put) 답안·UI 상태는 통째로
  // 교체된다. 결과를 예측할 수 없으면 되돌릴 수 없는 손실이 되므로, 적용 전에 명시한다.
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  // 뒤로가기(브라우저·안드로이드 하드웨어)로 오버레이 닫기.
  // 확인 대화상자·사용설명서는 주 모달 위에서 열리므로 먼저 닫히게 우선순위를 높인다.
  useBackDismiss(settingsOpen, () => setSettingsOpen(false), BACK_PRIORITY.modal);
  useBackDismiss(statsOpen, () => setStatsOpen(false), BACK_PRIORITY.modal);
  useBackDismiss(resultOpen, () => setResultOpen(false), BACK_PRIORITY.modal);
  useBackDismiss(paletteOpen, () => setPaletteOpen(false), BACK_PRIORITY.modal);
  useBackDismiss(resumePrompt, () => setResumePrompt(false), BACK_PRIORITY.modal);
  useBackDismiss(Boolean(gradedResume), () => setGradedResume(null), BACK_PRIORITY.modal);
  useBackDismiss(confirmGradeOpen, () => setConfirmGradeOpen(false), BACK_PRIORITY.confirm);
  useBackDismiss(quitExamOpen, () => setQuitExamOpen(false), BACK_PRIORITY.confirm);
  useBackDismiss(confirmHomeOpen, () => setConfirmHomeOpen(false), BACK_PRIORITY.confirm);
  useBackDismiss(guideOpen, () => setGuideOpen(false), BACK_PRIORITY.confirm);
  // 뒤로가기 = 취소(계속 풀기) — 확인 모달의 안전한 기본값이다.
  useBackDismiss(Boolean(pendingSetChange), () => setPendingSetChange(null), BACK_PRIORITY.confirm);
  useBackDismiss(pendingRedraw, () => setPendingRedraw(false), BACK_PRIORITY.confirm);
  useBackDismiss(pendingRestart, () => setPendingRestart(false), BACK_PRIORITY.confirm);
  useBackDismiss(Boolean(pendingImport), () => setPendingImport(null), BACK_PRIORITY.confirm);
  useBackDismiss(confirmExitExam, () => setConfirmExitExam(false), BACK_PRIORITY.confirm);
  // 오답노트는 3단계(세트 → 오답 목록 → 문항)라 뒤로가기가 한 단계씩 되돌아간다 —
  // 문항을 보다 뒤로가기를 눌렀을 때 노트가 통째로 닫히면 되짚어 들어가야 한다.
  useBackDismiss(
    wrongNoteOpen,
    () => {
      if (wrongNoteQuestionNo != null) { setWrongNoteQuestionNo(null); return; }
      if (wrongNoteSetId != null) { setWrongNoteSetId(null); return; }
      setWrongNoteOpen(false);
    },
    BACK_PRIORITY.modal,
  );

  useEffect(() => {
    document.body.dataset.qfont = fontSize;
    safeSetItem('istqb-q-font', fontSize);
  }, [fontSize]);

  // useMemo: 아래 productHistories 메모의 의존성이라 참조가 렌더마다 바뀌면 안 된다.
  const sets = React.useMemo(
    () => (appData ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct) : []),
    [appData, activeProduct],
  );
  const currentSet = sets.find((s) => s.id === setId);

  // 통계·오답노트·이력 비우기는 현재 제품(ISTQB/CSTS) 이력만 대상으로 한다.
  // IndexedDB 스토어는 두 제품이 공유하므로 필터 없이는 다른 제품 기록이 섞여 보인다.
  // 신규 기록은 certification 필드로 판별하고, 필드가 없는 과거 기록만 setId로 추론한다.
  // useMemo: 결과 모달이 열린 동안 매초(타이머 틱) 리렌더돼도 재계산·참조 변경을 막아
  // StatsDashboard의 useMemo가 실효를 갖게 한다.
  const productHistories = React.useMemo(() => {
    const productSetIds = new Set(sets.map((s) => s.id));
    const out: Record<string, ExamHistory> = {};
    for (const [id, h] of Object.entries(histories)) {
      const owns = h.certification ? h.certification === activeProduct : productSetIds.has(h.setId);
      if (owns) out[id] = h;
    }
    return out;
  }, [histories, sets, activeProduct]);
  // Phase 2 — 결과 모달의 "직전 회차 대비" 비교(현재 세트·모드의 최신 회차 기준).
  // productHistories(메모화·제품 필터)를 입력으로 써 다른 제품 이력 변경에는 재계산하지 않는다.
  // 챕터 미니 시험(랜덤+필터)은 같은 챕터 미니 회차끼리만 비교한다(표본 불일치 왜곡 방지).
  const compareChapter = mode === 'random' ? (chapterFilter ?? null) : null;
  const attemptCompare = React.useMemo(
    () => latestAttemptComparison(Object.values(productHistories), setId, mode, compareChapter),
    [productHistories, setId, mode, compareChapter],
  );
  const fmtAns = (arr: string[]) => formatAnswerList(arr, '미응답');
  // 세트별 "전 회차 오답의 합집합" — 최신 회차만 보여주면 같은 세트를 랜덤으로
  // 재채점했을 때 이전 시험 회차의 오답이 노트에서 사라진다(QA 지적 해소).
  // 같은 문항이 여러 회차에서 틀렸으면 가장 최근 회차의 내 답을 대표로 쓴다.
  // 전용 뷰 타입(WrongNoteSetView) — 도메인 ExamHistory를 가짜 id(merged-*)로 위조하지 않는다.
  // useMemo: AppModals는 answers를 구독(useQuizSession)해 답안 클릭마다 리렌더되므로,
  // 메모 없이는 오답노트가 닫혀 있어도 매 클릭 전체 이력 정렬·병합을 재계산한다.
  // 현재 제품의 유효(미만료) 퀵 회차 — 오답노트와 통계가 같은 모집단을 본다.
  // 제품 필터가 빠지면 CSTS에서 푼 퀵이 ISTQB 챕터 통계에 남의 챕터로 끼어든다.
  const productQuickRounds = React.useMemo(
    () => freshQuickRounds(quickRounds).filter((r) => !r.certification || r.certification === activeProduct),
    [quickRounds, activeProduct],
  );

  /**
   * 최근 퀵 오답 — 세트 그룹과 섞지 않는다(퀵은 세트를 다 푼 것이 아니다).
   * 보기 전용이라 상세 진입을 두지 않는다: 퀵은 여러 세트에서 뽑히므로 문항 번호가
   * 겹치는데(A세트 3번·B세트 3번), 번호로 상세를 찾는 기존 경로로는 구분할 수 없다.
   */
  const quickWrongs = React.useMemo(() => {
    const rounds = [...productQuickRounds]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); // 최신 회차가 대표
    const seen = new Map<string, { setId: string; setTitle: string; item: NonNullable<ExamHistory['wrongItems']>[number] }>();
    for (const r of rounds) {
      for (const it of r.wrongItems ?? []) {
        const sid = it.setId ?? r.setId;
        const key = `${sid}:${it.number}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          setId: sid,
          setTitle: appData?.sets.find((x) => x.id === sid)?.title ?? sid,
          item: it,
        });
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.setTitle.localeCompare(b.setTitle, 'ko') || a.item.number - b.item.number);
  }, [productQuickRounds, appData]);

  // 세트별 오답 합집합 — 순수 로직은 utils/wrongNote로 꺼냈다(유닛으로 고정 가능).
  // useMemo: AppModals는 answers를 구독(useQuizSession)해 답안 클릭마다 리렌더되므로,
  // 메모 없이는 오답노트가 닫혀 있어도 매 클릭 전체 이력 정렬·병합을 재계산한다.
  const wrongNoteBySet: WrongNoteSetView[] = React.useMemo(
    () => buildWrongNoteBySet(
      Object.values(productHistories),
      (sid) => appData?.sets.find((s) => s.id === sid)?.title,
    ),
    [productHistories, appData],
  );
  const selectedWrong = wrongNoteSetId
    ? wrongNoteBySet.find((h) => h.setId === wrongNoteSetId) ?? null
    : null;
  // 3단계 문항 보기: 선택한 세트의 문항을 로드해 해당 번호의 문제를 찾는다.
  const wrongNoteSetPath = selectedWrong
    ? appData?.sets.find((s) => s.id === selectedWrong.setId)?.path ?? null
    : null;
  const wrongNoteQuestions = useWrongNoteQuestions(wrongNoteSetPath, selectedWrong?.setId ?? null);
  const selectedWrongItem = selectedWrong && wrongNoteQuestionNo != null
    ? (selectedWrong.wrongItems ?? []).find((it) => it.number === wrongNoteQuestionNo) ?? null
    : null;
  const selectedWrongQuestion = selectedWrongItem
    ? wrongNoteQuestions?.find((q) => q.number === selectedWrongItem.number) ?? null
    : null;
  // 3단계 ‹ › 이동: 같은 회차의 오답 목록 안에서 이전/다음 오답 문항으로 넘긴다.
  const wrongItems = selectedWrong?.wrongItems ?? [];
  const wrongItemIndex = selectedWrongItem
    ? wrongItems.findIndex((it) => it.number === selectedWrongItem.number)
    : -1;
  const gotoWrongItem = (delta: number) => {
    const next = wrongItems[wrongItemIndex + delta];
    if (next) setWrongNoteQuestionNo(next.number);
  };

  const handleHome = () => {
    // 응시 중(잠금)에는 바로 이동하지 않고 확인을 거친다 — 사이드바 잠금과의 일관성.
    // 답안은 저장되며 시험 탭 복귀 시 이어풀 수 있으므로 안내만 하고 막지는 않는다.
    if (examLocked) {
      // 설정 모달을 먼저 닫는다 — JSX 뒤에 렌더되는 설정 모달이 확인 모달 위를 덮는다.
      setSettingsOpen(false);
      setConfirmHomeOpen(true);
      return;
    }
    setSettingsOpen(false);
    setDrawerOpen(false);
    setMode('home');
  };

  // 응시 포기(확인 후) — 답안·시작 상태를 지우고 시작 게이트로 되돌린다. 회차 기록 없음.
  const confirmQuitExam = () => {
    clearAnswers(setId, 'exam');
    beginSession();
    setQuitExamOpen(false);
    showToast('응시를 포기했습니다 — 회차 기록은 남지 않았어요.', 'info');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    // 실패 후 같은 파일을 다시 선택해도 onChange가 발화하도록 값을 리셋한다.
    e.target.value = '';
    setPendingImport(file);
  };

  const runImport = async (file: File) => {
    setPendingImport(null);
    const result = await importUserData(file);
    // 실패 사유를 그대로 노출한다 — 종전에는 어떤 실패든 같은 문구라 무엇을 고칠지 알 수 없었고,
    // 제품이 다른 백업은 데이터를 덮어쓴 뒤 '복원했습니다'라고 알리기까지 했다.
    showToast(
      result.ok ? '백업 파일을 복원했습니다.' : (result.reason ?? '파일 복원에 실패했습니다.'),
      result.ok ? 'success' : 'error',
    );
  };

  const unanswered = total - answered;
  const confirmGrade = () => {
    setConfirmGradeOpen(false);
    gradeAndShow();
  };

  // 회차 1건 삭제 — 잘못 제출한 회차(미응답 제출 등) 때문에 이력을 통째로 버리지
  // 않아도 되게 한다. 삭제가 DB에 커밋된 뒤에만 메모리에서 지운다(removeHistoriesEverywhere).
  const handleDeleteRound = async (id: string) => {
    const ok = await removeHistoriesEverywhere([id]);
    if (ok) showToast('회차 기록 1건을 삭제했습니다.', 'success');
  };

  const handleClearHistories = async () => {
    // 현재 제품 이력만 지운다 — 전체 clear면 다른 제품(ISTQB↔CSTS) 기록까지 사라진다.
    // 어느 제품 세트에도 속하지 않는 고아 이력(세트 제거/구버전 백업 유래)은 화면에
    // 보이지 않아 다른 삭제 경로가 없으므로 이때 함께 지워 영구 잔존을 막는다.
    const allKnownSetIds = new Set((appData?.sets ?? []).map((s) => s.id));
    const orphanIds = appData
      ? Object.values(histories)
          .filter((h) => !h.certification && !allKnownSetIds.has(h.setId))
          .map((h) => h.id)
      : [];
    // 파괴적 액션의 완료 피드백 — 없으면 "정말 삭제"를 눌러도 됐는지 알 수 없다.
    // 삭제가 실제로 커밋된 뒤에만 완료를 알린다(실패 시엔 removeHistoriesEverywhere가
    // 오류 토스트를 띄우고 화면의 이력도 그대로 남는다).
    const ok = await removeHistoriesEverywhere([...Object.keys(productHistories), ...orphanIds]);
    if (!ok) return;
    // 이력만 지우면 답안·채점 상태·오답 대상이 남아, 오답노트에는 없는 오답이 오답 모드에
    // 계속 출제되고 그 세트를 다시 채점하면 같은 기록이 그대로 되살아난다("초기화했는데
    // 이전 기록이 재생성됨"). 이력과 그 이력에서 파생된 상태를 함께 비운다.
    // 퀵 회차의 setId는 실재 세트가 아닌 센티넬이라 목록에 따로 넣어야 한다.
    resetProgressForSets([...sets.map((x) => x.id), QUICK_SET_ID]);
    // 퀵 임시 회차는 이력이 아니라 별도 보관이라 위 삭제에 걸리지 않는다 — 함께 지우지
    // 않으면 "이력 비우기" 직후에도 오답노트에 퀵 오답이 그대로 남는다(초기화 미완).
    clearQuickRounds(activeProduct);
    showToast('현재 자격증의 응시 이력과 풀이 기록을 모두 삭제했습니다.', 'success');
  };

  // 약점 챕터 집중 세션(Phase 3): 통계에서 챕터를 고르면 그 챕터로 필터해 진입한다.
  // - 연습(practice): 즉시 피드백, 통계 무기록.
  // - 미니 시험(random): 챕터 문항 10개 추첨, 채점 시 챕터 통계에 반영 — 약점
  //   "발견→보완→재측정" 루프의 재측정 단계를 담당한다.
  // 진단은 전 세트 합산이므로, 현재 세트에 해당 챕터 문항이 없으면 그 챕터가 있는
  // 세트로 자동 전환한다(빈 필터 화면 착지 방지). setMode가 필터를 초기화하므로 필터는 그 뒤에 건다.
  const startChapterSession = async (chapter: string, target: 'practice' | 'random') => {
    // 응시 중 잠금 — 학습 통계 버튼은 잠금 중에도 열리므로, 여기서 막지 않으면
    // setMode+beginSession으로 잠금을 우회해 시험 타이머가 소실된다(버튼 disabled와 이중 방어).
    if (examLocked) {
      showToast('시험 응시 중에는 챕터 세션을 시작할 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    setStatsOpen(false);
    try {
      const hasChapter = async (path?: string) => {
        if (!path) return false;
        const qs = peekSetQuestions(path) ?? (await loadSetQuestions(path));
        return qs.some((q) => q.chapter === chapter);
      };
      if (!(await hasChapter(sets.find((s) => s.id === setId)?.path))) {
        for (const s of sets) {
          if (s.id === setId) continue;
          if (await hasChapter(s.path)) {
            setSetId(s.id);
            showToast(`'${chapter}' 문항이 있는 ${s.title}(으)로 이동했습니다.`, 'info');
            break;
          }
        }
      }
    } catch { /* 세트 로드 실패 시 현재 세트 유지 — 빈 필터 안내가 그레이스풀 처리 */ }
    if (target === 'random') {
      // 미니 시험은 새 추첨으로 시작 — 세트가 방금 바뀌었을 수 있어 현재 setId를 다시 읽는다.
      // 저장된 추첨을 비워 useQuestions가 이번 챕터로 새로 뽑게 한다(이전 미니 추첨 복원 방지).
      clearAnswers(useQuizStore.getState().setId, 'random');
      setRandomDraw(null);
    }
    setMode(target);
    setChapterFilter(chapter);
    beginSession();
  };
  const handlePracticeChapter = (chapter: string) => startChapterSession(chapter, 'practice');
  const handleMiniTestChapter = (chapter: string) => startChapterSession(chapter, 'random');

  const handleResetMode = async () => {
    clearAnswers(setId, mode);
    // 이 세트/모드의 오답(review) 대상도 비운다 — 남기면 삭제된 회차의 오답이
    // 오답 모드에 유령처럼 남는다(오답 노트에는 없는데 오답 풀이엔 나오는 불일치).
    setReviewIds(gradeKeyFor(setId, mode), []);
    const ids = Object.values(histories)
      .filter((h) => h.setId === setId && h.mode === mode)
      .map((h) => h.id);
    // 이력 삭제가 커밋된 뒤에만 완료를 알린다(답안 초기화는 메모리라 즉시 반영).
    const ok = await removeHistoriesEverywhere(ids);
    // 파괴적 액션의 완료 피드백 — 없으면 "정말 삭제"를 눌러도 됐는지 알 수 없다.
    if (ok) showToast(`${MODE_LABEL[mode] ?? mode} 모드의 답안과 이력을 초기화했습니다.`, 'success');
  };

  return (
    <>
      {resumePrompt && (
        <Modal title="이어풀기" onClose={() => setResumePrompt(false)}>
          <div className="modal-body confirm-body" data-testid="resume-prompt-modal">
            <p>
              이전에 풀던 <strong>{MODE_LABEL[mode] ?? mode}</strong> 기록이 남아 있습니다.
              이어서 풀까요, 아니면 처음부터 새로 풀까요?
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                data-testid="resume-fresh"
                onClick={() => {
                  clearAnswers(setId, mode);
                  beginSession();
                  setResumePrompt(false);
                }}
              >
                새로 풀기
              </button>
              <button
                type="button"
                className="primary"
                data-testid="resume-keep"
                onClick={() => setResumePrompt(false)}
              >
                이어풀기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingSetChange && (
        <Modal title="세트 변경" onClose={() => setPendingSetChange(null)}>
          <div className="modal-body confirm-body" data-testid="pending-set-change-modal">
            <p>
              랜덤 모드로 <strong>{answered}문항</strong>을 푸는 중입니다.
              세트를 바꾸면 <strong>지금 뽑힌 문항과 답안이 사라집니다</strong>
              (랜덤은 세트별로 보관하지 않습니다).
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="pending-set-change-cancel" onClick={() => setPendingSetChange(null)}>
                계속 풀기
              </button>
              <button
                type="button"
                className="danger"
                data-testid="pending-set-change-confirm"
                onClick={() => commitSetChange(pendingSetChange)}
              >
                세트 바꾸기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingRestart && (
        <Modal title="처음부터 풀기" onClose={() => setPendingRestart(false)}>
          <div className="modal-body confirm-body" data-testid="pending-restart-modal">
            <p>
              지금까지 고른 <strong>{answered}문항</strong>의 답이 지워지고 1번 문항부터 다시 시작합니다.
              이어서 풀려면 &lsquo;계속 풀기&rsquo;를 누르세요.
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="pending-restart-cancel" onClick={() => setPendingRestart(false)}>
                계속 풀기
              </button>
              <button
                type="button"
                className="danger"
                data-testid="pending-restart-confirm"
                onClick={() => {
                  // 이름이 약속한 대로 실제로 초기화한다 — 종전에는 setIndex(0)뿐이라
                  // 답 선택이 그대로 남았다. beginSession이 위치·타이머를 함께 되돌린다.
                  clearAnswers(setId, mode);
                  beginSession();
                  setResumeNotice(false);
                  setPendingRestart(false);
                }}
              >
                처음부터 풀기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingRedraw && (
        <Modal title="새 문제 뽑기" onClose={() => setPendingRedraw(false)}>
          <div className="modal-body confirm-body" data-testid="pending-redraw-modal">
            <p>
              지금까지 푼 <strong>{answered}문항</strong>이 사라지고 새 문항으로 다시 뽑습니다.
              (랜덤은 이전 추첨을 보관하지 않습니다)
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="pending-redraw-cancel" onClick={() => setPendingRedraw(false)}>
                계속 풀기
              </button>
              <button
                type="button"
                className="danger"
                data-testid="pending-redraw-confirm"
                onClick={() => {
                  clearAnswers(setId, 'random');
                  redrawRandom();
                  beginSession();
                  setPendingRedraw(false);
                }}
              >
                새로 뽑기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmExitExam && (
        <Modal title="시험 화면 나가기" onClose={() => setConfirmExitExam(false)}>
          <div className="modal-body confirm-body" data-testid="confirm-exit-exam-modal">
            <p>
              시험 응시 중입니다. 나가도 답안은 저장되지만
              {' '}<strong>제한시간은 계속 흐릅니다</strong>.
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="confirm-exit-cancel" onClick={() => setConfirmExitExam(false)}>
                계속 응시
              </button>
              <button
                type="button"
                className="danger"
                data-testid="confirm-exit-go"
                onClick={() => { setConfirmExitExam(false); resetToGate(); }}
              >
                나가기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {quitExamOpen && (
        <Modal title="응시 포기" onClose={() => setQuitExamOpen(false)}>
          <div className="modal-body confirm-body" data-testid="quit-exam-modal">
            <p>
              응시를 포기할까요? 지금까지의 답안은 삭제되고 <strong>회차 기록은 남지 않습니다</strong>.
              다음에 시험을 시작하면 처음부터 진행됩니다.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setQuitExamOpen(false)}>계속 응시</button>
              <button type="button" className="danger" data-testid="quit-exam-confirm" onClick={confirmQuitExam}>
                포기하기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmHomeOpen && (
        <Modal title="처음 화면으로" onClose={() => setConfirmHomeOpen(false)}>
          <div className="modal-body confirm-body" data-testid="confirm-home-modal">
            <p>
              시험 응시 중입니다. 이동해도 답안은 저장되며, 시험 탭으로 돌아오면
              <strong> 이어풀 수 있어요</strong>. 이동할까요?
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirmHomeOpen(false)}>계속 응시</button>
              <button
                type="button"
                className="primary"
                data-testid="confirm-home-go"
                onClick={() => {
                  setConfirmHomeOpen(false);
                  setSettingsOpen(false);
                  setDrawerOpen(false);
                  setMode('home');
                }}
              >
                이동
              </button>
            </div>
          </div>
        </Modal>
      )}

      {gradedResume && (
        <Modal title="채점 완료된 회차" onClose={() => setGradedResume(null)}>
          <div className="modal-body confirm-body" data-testid="graded-resume-modal">
            <p>
              이 시험은 <strong>이미 채점을 마친 회차</strong>예요
              {gradedResume.correct != null && gradedResume.total != null
                ? ` (${gradedResume.correct} / ${gradedResume.total})`
                : ''}.
              같은 답안을 다시 채점하면 회차가 중복으로 쌓여 통계가 왜곡됩니다.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                data-testid="graded-resume-view"
                onClick={() => { setGradedResume(null); setResultOpen(true); }}
              >
                지난 결과 보기
              </button>
              <button
                type="button"
                className="primary"
                data-testid="graded-resume-fresh"
                onClick={() => {
                  clearAnswers(setId, 'exam');
                  beginSession();
                  setGradedResume(null);
                }}
              >
                새 회차 시작
              </button>
            </div>
          </div>
        </Modal>
      )}

      {paletteOpen && (
        <Modal title="문항 이동" onClose={() => setPaletteOpen(false)}>
          <div className="modal-body" data-testid="palette-jump">
            <QuestionPalette onJump={() => setPaletteOpen(false)} />
          </div>
        </Modal>
      )}

      {wrongNoteOpen && (
        <Modal title="오답 노트" onClose={() => { setWrongNoteOpen(false); setWrongNoteSetId(null); setWrongNoteQuestionNo(null); }}>
          <div className="modal-body" data-testid="wrong-note">
            {wrongNoteBySet.length === 0 && quickWrongs.length === 0 ? (
              <p>표시할 오답이 없습니다. (시험·랜덤 모드에서 채점하면 기록됩니다)</p>
            ) : !selectedWrong ? (
              // 1단계: 오답이 있는 세트 선택
              <>
              {/* 퀵 오답 — 세트 그룹과 분리해 먼저 보여준다. 만료가 있는 임시 목록이라
                  "언제 사라지는가"를 문구로 밝힌다. 보기 전용(상세 진입 없음). */}
              {quickWrongs.length > 0 && (
                <section className="quick-wrong-note" data-testid="quick-wrong-note">
                  <h4>⚡ 최근 퀵 오답 {quickWrongs.length}개</h4>
                  <p className="stats-hint">
                    퀵은 회차 기록을 남기지 않습니다. 이 목록은 채점 후 24시간 뒤 자동으로 사라져요.
                  </p>
                  <ul className="quick-wrong-list">
                    {quickWrongs.map(({ setId: sid, setTitle, item }) => (
                      <li key={`${sid}:${item.number}`} data-testid="quick-wrong-item">
                        <span className="qw-src">{setTitle}</span>
                        <span className="qw-no">{item.number}번</span>
                        <span className="qw-ans">
                          내 답 <b>{fmtAns(item.myAnswer)}</b> · 정답 <b>{fmtAns(item.correctAnswer)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {wrongNoteBySet.length === 0 && (
                <p>세트별 오답은 아직 없습니다. (시험·랜덤 모드에서 채점하면 기록됩니다)</p>
              )}
              {/* 노트(전 회차 누적)와 '오답 다시 풀기'(최근 채점 기준)의 범위 차이 안내(A4). */}
              <p className="stats-hint">
                오답 노트는 전 회차 누적 기록이에요. 사이드바의 ‘오답 다시 풀기’는 최근 채점 기준으로 출제됩니다.
              </p>
              <ul className="wrong-note-sets" data-testid="wrong-note-sets">
                {wrongNoteBySet.map((h) => (
                  <li key={h.setId}>
                    <button
                      type="button"
                      className="wrong-note-set-btn"
                      data-testid="wrong-note-set-btn"
                      onClick={() => setWrongNoteSetId(h.setId)}
                    >
                      <span className="wns-title">{h.setTitle || h.setId}</span>
                      {/* 합산 뷰 라벨 — 최신 회차의 모드를 그대로 쓰면 시험+랜덤 합집합이
                          단일 모드 출처처럼 오표기된다. 회차 수 + 최근 날짜로 중립 표기. */}
                      <span className="wns-meta">
                        전 회차 합산({h.attemptCount}회) · 오답 {h.wrongItems?.length ?? 0}
                        {h.latestCreatedAt ? ` · 최근 ${new Date(h.latestCreatedAt).toLocaleDateString('ko-KR')}` : ''}
                      </span>
                      <span className="wns-arrow" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            ) : selectedWrongItem ? (
              // 3단계: 선택한 오답 문항 보기(지문·보기 + 내 답/정답 하이라이트, 읽기 전용)
              <div data-testid="wrong-note-question">
                <div className="wrong-note-question-head">
                  <button
                    type="button"
                    className="wrong-note-back"
                    data-testid="wrong-note-question-back"
                    onClick={() => setWrongNoteQuestionNo(null)}
                  >
                    ← 오답 목록
                  </button>
                  {/* 같은 회차의 이전/다음 오답 문항으로 이동. 끝에서는 비활성. */}
                  <div className="wn-nav" role="group" aria-label="오답 문항 이동">
                    <button
                      type="button"
                      className="wn-nav-btn"
                      data-testid="wrong-note-prev"
                      aria-label="이전 오답 문항"
                      disabled={wrongItemIndex <= 0}
                      onClick={() => gotoWrongItem(-1)}
                    >
                      ‹
                    </button>
                    <span className="wn-nav-pos" data-testid="wrong-note-pos">
                      {wrongItemIndex + 1} / {wrongItems.length}
                    </span>
                    <button
                      type="button"
                      className="wn-nav-btn"
                      data-testid="wrong-note-next"
                      aria-label="다음 오답 문항"
                      disabled={wrongItemIndex >= wrongItems.length - 1}
                      onClick={() => gotoWrongItem(1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <h4 className="wrong-note-set">
                  문제 {selectedWrongItem.number}
                  <small>
                    내 답 {fmtAns(selectedWrongItem.myAnswer)} · 정답 {fmtAns(selectedWrongItem.correctAnswer)}
                  </small>
                </h4>
                {!selectedWrongQuestion ? (
                  <p className="wn-loading">{wrongNoteQuestions === null ? '문제 불러오는 중…' : '문항을 찾을 수 없습니다.'}</p>
                ) : (
                  <div className="wrong-note-view">
                    <div className="question-stem">
                      <RichText content={selectedWrongQuestion.stem} />
                    </div>
                    {selectedWrongQuestion.options.length > 0 ? (
                      <div className="options wrong-note-options">
                        {selectedWrongQuestion.options.map((opt) => {
                          const mine = selectedWrongItem.myAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
                          const correct = selectedWrongItem.correctAnswer.some((a) => a.toLowerCase() === opt.key.toLowerCase());
                          let cls = 'option';
                          if (correct) cls += ' correct';
                          else if (mine) cls += ' selected wrong';
                          return (
                            <div key={opt.key} className={cls} data-mine={mine || undefined} data-correct={correct || undefined}>
                              <span className="option-key">{opt.key.toUpperCase()}</span>
                              <span className="option-text"><RichText content={opt.text} inline /></span>
                              {(mine || correct) && (
                                <span className="wn-tag">{correct ? (mine ? '내 답 · 정답' : '정답') : '내 답'}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // 단답형·진위형 등 보기 없는 문항: 내 답/정답 텍스트로 표시.
                      <dl className="wrong-note-short">
                        <div><dt>내 답</dt><dd>{fmtAns(selectedWrongItem.myAnswer)}</dd></div>
                        <div><dt>정답</dt><dd>{fmtAns(selectedWrongItem.correctAnswer)}</dd></div>
                      </dl>
                    )}
                    {/* 해설 — 오답 노트의 목적이 "왜 틀렸는지" 복습인데 종전에는 지문·보기·
                        내 답·정답만 보여 정작 이유를 볼 수 없었다(연습 모드 피드백에는 이미 노출). */}
                    <div className="wrong-note-explain" data-testid="wrong-note-explain">
                      <h5>해설</h5>
                      <RichText content={selectedWrongQuestion.explanation || '해설이 없습니다.'} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // 2단계: 선택한 세트의 오답 목록(문항을 누르면 팝업 안에서 해당 문제를 본다)
              <div data-testid="wrong-note-detail">
                <button
                  type="button"
                  className="wrong-note-back"
                  data-testid="wrong-note-back"
                  onClick={() => { setWrongNoteSetId(null); setWrongNoteQuestionNo(null); }}
                >
                  ← 세트 목록
                </button>
                <h4 className="wrong-note-set">
                  {selectedWrong.setTitle || selectedWrong.setId}
                  <small>
                    전 회차 합산({selectedWrong.attemptCount}회) · 오답 {selectedWrong.wrongItems?.length ?? 0}
                  </small>
                </h4>
                {selectedWrong.overcome.size > 0 && (
                  // 극복 문항이 실제로 있을 때만 범례를 노출한다(항상 보이면 소음).
                  <p className="stats-hint" data-testid="wrong-note-overcome-hint">
                    ✓ 극복 = 최근 시험 2회 연속 정답 — 목록에는 남지만 흐리게 표시돼요.
                  </p>
                )}
                <ul className="wrong-note-list">
                  {(selectedWrong.wrongItems ?? []).map((it, idx) => {
                    const overcome = selectedWrong.overcome.has(it.number);
                    const reviewedSet = new Set(reviewedOk[selectedWrong.setId] ?? []);
                    return (
                    <li key={`${it.number}-${idx}`} className={overcome ? 'wn-overcome' : undefined}>
                      <button
                        type="button"
                        className="wrong-note-item wrong-note-item-btn"
                        data-testid="wrong-note-item-btn"
                        onClick={() => setWrongNoteQuestionNo(it.number)}
                      >
                        <span className="wn-num">문제 {it.number}</span>
                        {/* 내 답·정답을 한 덩어리로 묶는다 — 서답형은 값이 길어 줄바꿈이
                            필요한데, 형제로 두면 문항 번호·화살표까지 같이 밀려 무너진다. */}
                        <span className="wn-answers">
                          <span className="wn-mine">내 답 {fmtAns(it.myAnswer)}</span>
                          <span className="wn-correct">정답 {fmtAns(it.correctAnswer)}</span>
                        </span>
                        {overcome && (
                          <span className="wn-overcome-tag" data-testid="wrong-note-overcome-tag">✓ 극복</span>
                        )}
                        {/* 오답 모드에서 다시 풀어 맞힌 문항 — 목록에는 남기되 상태를 구분한다.
                            '극복'(시험 2회 연속 정답)보다 약한 근거라 별도 표기. */}
                        {!overcome && reviewedSet.has(it.number) && (
                          <span className="wn-reviewed-tag" data-testid="wrong-note-reviewed-tag">복습함</span>
                        )}
                        <span className="wn-arrow" aria-hidden="true">›</span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="설정" onClose={() => setSettingsOpen(false)}>
          <div className="modal-body settings-body">
            <section className="settings-group">
              <h4>테마</h4>
              <div className="segmented" role="group" aria-label="테마">
                {THEMES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={themePref === value ? 'active' : ''}
                    aria-pressed={themePref === value}
                    data-theme-option={value}
                    onClick={() => setThemePref(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group">
              <h4>앱 이동</h4>
              <button type="button" className="settings-action" onClick={handleHome}>
                처음 화면으로 (ISTQB/CSTS 선택)
              </button>
              <button
                type="button"
                className="settings-action"
                data-testid="guide-open-settings"
                onClick={() => { setSettingsOpen(false); setGuideOpen(true); }}
              >
                📖 사이트 사용법
              </button>
            </section>

            <section className="settings-group">
              <h4>글자 크기</h4>
              <div className="segmented" role="group" aria-label="문제 글자 크기">
                {FONT_SIZES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={fontSize === value ? 'active' : ''}
                    aria-pressed={fontSize === value}
                    onClick={() => setFontSize(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group">
              <h4>기록 관리</h4>
              <div className="settings-actions">
                <button type="button" className="settings-action" onClick={exportUserData}>
                  기록 내보내기
                </button>
                <label className="settings-action file-import">
                  <span>기록 가져오기</span>
                  <input type="file" accept=".json" aria-label="백업 파일 가져오기" onChange={handleFileImport} />
                </label>
              </div>
            </section>

            <section className="settings-group">
              <h4>초기화</h4>
              <div className="settings-actions" data-testid="confirm-reset-mode">
                <ConfirmButtons
                  label="현재 모드 답안 초기화"
                  confirmLabel="정말 삭제 (답안·이력)"
                  confirmTestId="confirm-reset-yes"
                  buttonClassName="settings-action"
                  onConfirm={handleResetMode}
                />
              </div>
            </section>

            {/* '화면 콘솔' 토글은 설정에서 뺐다 — 개발자용 도구인데 일반 사용자에게 노출돼
                있었고, 켜면 문제 화면 위에 떠다니는 버튼이 생겨 풀이를 가렸다.
                기능 자체는 남아 있다: 주소에 ?debug 를 붙이면 켜지고 ?debug=0 이면 꺼진다
                (debugLog.ts init). 이미 켜 둔 사용자는 아래 안내로 끌 수 있다. */}
            {debugOn && (
              <section className="settings-group">
                <h4>화면 콘솔</h4>
                <p className="settings-hint">
                  개발자용 로그 창이 켜져 있습니다(화면 우하단 <code>&lt;/&gt;</code> 버튼).
                </p>
                <button
                  type="button"
                  className="settings-action"
                  data-testid="settings-debug-off"
                  onClick={() => { setDebugEnabled(false); setDebugOn(false); }}
                >
                  화면 콘솔 끄기
                </button>
              </section>
            )}
          </div>
        </Modal>
      )}

      {statsOpen && (
        <StatsDashboard
          histories={productHistories}
          sets={sets}
          duplicateGroups={appData?.duplicateGroups}
          duplicateChapters={appData?.duplicateChapters}
          quickRounds={productQuickRounds}
          onClose={() => setStatsOpen(false)}
          onClear={handleClearHistories}
          onPracticeChapter={handlePracticeChapter}
          onMiniTestChapter={handleMiniTestChapter}
          practiceLocked={examLocked}
          certification={activeProduct}
          onDeleteRound={handleDeleteRound}
        />
      )}

      {confirmGradeOpen && (
        <Modal title="제출 전 검토" onClose={() => setConfirmGradeOpen(false)}>
          <div className="modal-body confirm-body" data-testid="confirm-grade-modal">
            {answered === 0 ? (
              // 0문항 채점은 0점 회차가 통계·타임라인·오답노트에 영구 기록된다 —
              // "미응답 N개"로만 알리면 무엇이 남는지 알 수 없다.
              <p data-testid="grade-zero-warning">
                <strong>한 문항도 풀지 않았습니다.</strong> 지금 채점하면
                {' '}<strong>0점 회차로 기록</strong>되고 전 문항이 오답 노트에 쌓입니다.
                그만두려면 사이드바의 ‘응시 포기’를 쓰세요 — 회차가 남지 않습니다.
              </p>
            ) : (
              <p>
                아직 답하지 않은 문항이 <strong>{unanswered}개</strong> 있습니다.
                그대로 채점할까요? (미응답은 오답 처리됩니다)
              </p>
            )}
            <p className="review-hint">아래에서 미응답(빈 칸) 문항을 눌러 이동해 마저 풀 수 있습니다.</p>
            <div className="review-palette" data-testid="review-palette">
              <QuestionPalette onJump={() => setConfirmGradeOpen(false)} />
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className={answered === 0 ? 'primary' : undefined}
                onClick={() => setConfirmGradeOpen(false)}
              >
                계속 풀기
              </button>
              {/* 0문항이면 되돌릴 수 없는 쪽(채점)에서 강조를 빼 안전한 기본값이 앞서게 한다. */}
              <button
                type="button"
                className={answered === 0 ? 'danger' : 'primary'}
                data-testid="confirm-grade"
                onClick={confirmGrade}
              >
                채점하기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 설정 모달에서 열리는 확인이라 설정보다 뒤에 렌더해야 위에 깔린다 —
          앞에 두면 설정 모달에 가려 버튼을 누를 수 없다(E2E가 실제로 잡아냄). */}
      {pendingImport && (
        <Modal title="백업 가져오기" onClose={() => setPendingImport(null)}>
          <div className="modal-body confirm-body" data-testid="import-confirm-modal">
            <p><strong>{pendingImport.name}</strong></p>
            <p>
              적용하면 <strong>지금 풀던 답안과 진행 위치는 백업본으로 교체</strong>되고,
              <strong> 응시 이력은 기존 기록과 합쳐집니다</strong>. 교체된 답안은 되돌릴 수 없습니다.
            </p>
            <div className="confirm-actions">
              <button type="button" data-testid="import-cancel" onClick={() => setPendingImport(null)}>
                취소
              </button>
              <button
                type="button"
                className="danger"
                data-testid="import-confirm"
                onClick={() => void runImport(pendingImport)}
              >
                가져오기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {guideOpen && <UserGuide onClose={() => setGuideOpen(false)} />}

      {resultOpen && (
        <ResultSummary
          setTitle={mode === 'quick' ? '퀵 랜덤' : (currentSet?.title || '')}
          certification={activeProduct}
          correct={correctCount}
          total={total}
          cstsWeighted={cstsWeighted}
          elapsedSeconds={resultElapsedSeconds}
          attemptRound={attemptCompare.round}
          previousRate={attemptCompare.previousRate}
          // 챕터 미니 시험(랜덤+필터)은 회차 라벨도 구분 — "랜덤 N회차"로 표기하면
          // 세트 전체 랜덤과 섞여 보인다(회차 번호는 같은 챕터 미니끼리만 센다).
          modeLabel={compareChapter ? `${compareChapter} 미니` : (MODE_LABEL[mode] ?? mode)}
          // 퀵은 세트 전체를 푼 것이 아니라 합격 판정의 근거가 없다.
          hidePassVerdict={mode === 'quick'}
          // 퀵의 오답은 회차 단위로 모이지 않고 각 문항의 출처 세트별로 흩어져 노트에
          // 들어간다. 결과 모달에서 바로 열면 방금 푼 회차의 오답만 보일 것이라
          // 기대하게 되는데 실제로는 세트별 전 회차 합산이 뜬다 — 진입로를 두지 않는다.
          hideWrongNote={mode === 'quick'}
          onClose={() => setResultOpen(false)}
          onOpenWrongNote={() => { setResultOpen(false); setWrongNoteOpen(true); }}
          onRetry={() => {
            // 원클릭 재응시(A3) — 답안 초기화 후 시험은 시작 게이트부터, 랜덤은 같은 추첨을 새로 푼다.
            clearAnswers(setId, mode);
            beginSession();
            setResultOpen(false);
          }}
        />
      )}
    </>
  );
};
