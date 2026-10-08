import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { useWrongNote } from '../../hooks/useWrongNote';
import { TimerClock } from '../common/TimerClock';
import { MODE_LABEL } from '../../utils/modeLabel';
import { BRAND_LOGO_SRC } from '../../utils/brandLogo';
import { setDisplay } from '../../utils/setSheet';
import { clampIndex } from '../../utils/sessionDerive';
import { showToast } from '../../utils/toast';

// 모바일 전용 상단바(CSS로 ≤880px에서만 노출).
//
// 두 줄이다. 윗줄은 '무엇을 풀고 있는가'(세트) + 메뉴, 아랫줄은 '지금 어디쯤인가'(모드·위치·시간)
// + 오답 노트 진입이다. 세트 이름을 누르면 세트 선택 시트가 열린다 — 세트를 바꾸려고 ☰를 열어
// 시스템 select를 찾던 길이 한 번의 탭으로 줄어든다.
//
// 진행(푼 수)은 여기서 말하지 않는다. 위치와 푼 수를 한 줄에 같이 두면 "3 / 40"이 둘 중 무엇인지
// 읽는 쪽이 매번 풀어야 해서, 위치(현재 / 전체)만 두고 진행은 하단 바의 진행 스트립과 문항 목록이
// 맡는다.
export const MobileTopBar = () => {
  // 슬라이스 구독(O1) — 타이머는 TimerClock이 단독 구독한다.
  const { mode, setId, activeProduct, chapterFilter, index, drawerOpen, setDrawerOpen, setSetSheetOpen, setWrongNoteOpen } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, setId: s.setId, activeProduct: s.activeProduct,
      chapterFilter: s.chapterFilter, index: s.index, drawerOpen: s.drawerOpen,
      setDrawerOpen: s.setDrawerOpen, setSetSheetOpen: s.setSetSheetOpen,
      setWrongNoteOpen: s.setWrongNoteOpen,
    })));
  const { appData, total, isGraded, examLocked } = useQuizSession();
  const { total: wrongTotal } = useWrongNote(appData);

  const product = (activeProduct || '').toUpperCase();
  const isQuick = mode === 'quick';
  const currentSet = appData?.sets.find((s) => s.id === setId);
  // 퀵의 setId는 센티넬('QUICK')이라 세트 목록에서 찾히지 않는다. 폴백에 맡기면
  // 모바일 상단바만 '문제 풀이'로 뜨고 데스크톱 사이드바는 '퀵 랜덤'이라 라벨이 갈린다.
  const display = currentSet ? setDisplay(currentSet) : null;
  const title = isQuick ? '퀵 랜덤' : display?.name || '문제 풀이';
  const context = isQuick ? product : display?.context || product;

  // 세트를 바꿀 수 없는 때 — 사이드바의 세트 select가 잠기거나 사라지는 것과 같은 규칙이다.
  // 눌러도 아무 일이 없는 버튼이 되지 않게 막힌 이유를 말해 준다.
  const openSetSheet = () => {
    if (isQuick) {
      showToast('퀵은 모든 세트를 섞어 냅니다. 세트를 고르려면 연습·시험·오답 모드로 바꾸세요.', 'info');
      return;
    }
    if (examLocked) {
      showToast('시험 응시 중에는 세트를 바꿀 수 없습니다. 먼저 채점하세요.', 'info');
      return;
    }
    setSetSheetOpen(true);
  };

  const timerLabel = mode === 'exam' && !isGraded ? '남은 시간' : '경과 시간';

  // 드로어가 열려 있으면 뒤의 상단바는 조작할 수 없다(백드롭이 덮는다). 접근성 트리와 Tab 순서에서도
  // 뺀다 — 안 그러면 드로어의 '오답 노트' 버튼과 같은 이름의 버튼이 하나 더 남는다.
  //
  // **☰는 뺀 대상에서 제외한다.** 드로어가 닫힐 때 포커스가 돌아갈 자리(Sidebar의 B1 계약)인데, 그
  // 버튼이 든 영역을 열리는 같은 렌더에서 inert로 만들면 포커스가 body로 밀려난 뒤에야 드로어가 '연
  // 요소'를 기록할 수 있다(effect가 브라우저의 포커스 정리보다 먼저 도느냐에 기대는 순서다).
  // 그래서 헤더 통째가 아니라 드로어와 겹치는 두 덩어리(세트 이름·상태 줄)에만 건다.
  const behindDrawer = drawerOpen || undefined;

  return (
    <header className="mobile-topbar" aria-label="시험 정보">
      <div className="mtb-row">
        <div className="mtb-brand" inert={behindDrawer} aria-hidden={behindDrawer}>
          <img src={BRAND_LOGO_SRC} alt="" />
          <button
            type="button"
            className="mtb-title"
            data-testid="set-sheet-open"
            aria-haspopup="dialog"
            aria-disabled={isQuick || examLocked || undefined}
            onClick={openSetSheet}
          >
            <span className="sr-only">세트 선택: </span>
            <span className="mtb-sub">{context}</span>
            <span className="mtb-ttl"><span>{title}</span><i aria-hidden="true" /></span>
          </button>
        </div>
        <button
          type="button"
          className="mtb-menu"
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          data-testid="drawer-open"
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
      </div>
      <div className="mtb-status" inert={behindDrawer} aria-hidden={behindDrawer}>
        {/* 챕터 미니 시험(랜덤+필터)은 일반 랜덤과 구분해 표기 — 결과 모달 라벨과 일관. */}
        <span className="mtb-chip">
          {mode === 'random' && chapterFilter ? '미니 시험' : (MODE_LABEL[mode] || mode)}
        </span>
        {/* 퀵에서는 위치·시간을 함께 내린다 — 사이드바가 같은 자리를 비우는 것과 같은 이유다
            (끝을 정해 놓지 않아 분모가 없고, 기록을 남기지 않으니 시간을 잴 이유도 없다).
            여기만 남겨 두면 "0 / 186"처럼 전 세트 크기가 분모로 떠서, 끝이 없다는 모드의 성격과
            정면으로 어긋나는 숫자를 보게 된다. 그 값은 문제 헤더의 퀵 점수판이 맡는다. */}
        {!isQuick && (
          <>
            <span className="mtb-pos" data-testid="mtb-pos">
              <span className="sr-only">문항 </span>{total === 0 ? 0 : clampIndex(index, total) + 1} / {total}
            </span>
            <span className="mtb-time"><span className="sr-only">{timerLabel} </span><TimerClock /></span>
          </>
        )}
        {/* 시험 응시 중에는 내린다 — 오답 노트에는 같은 세트의 이전 회차 오답과 **정답**이 있어, 응시 중에
            한 번의 탭으로 열리는 입구가 되면 안 된다(기획서 R1-3). 채점하면 다시 나타난다. */}
        {!examLocked && (
          <button
            type="button"
            className="mtb-wrong"
            data-testid="wrong-note-chip"
            aria-haspopup="dialog"
            onClick={() => setWrongNoteOpen(true)}
          >
            오답 노트
            {/* 배지는 노트가 나열하는 문항의 총수다(useWrongNote) — 현재 세트의 오답만 세면
                "4라더니 열어 보니 17개"가 된다. 0이면 숫자 없이 입구만 남긴다. */}
            {wrongTotal > 0 && <b aria-label={`${wrongTotal}문항`}>{wrongTotal}</b>}
          </button>
        )}
      </div>
    </header>
  );
};
