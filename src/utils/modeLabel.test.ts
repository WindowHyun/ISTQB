import { describe, it, expect } from 'vitest';
import { GRADED_MODES, MODE_LABEL, MODE_CAPTION, isGradedMode } from './modeLabel';
import { HISTORY_MODES } from './storage';

/**
 * modeLabel은 커버리지 0%였다 — 컴포넌트가 쓰니 E2E가 밟기는 하지만, 유닛 레벨에서는
 * 이 파일의 배열에서 모드가 하나 사라져도 400개 넘는 테스트가 전부 통과한다.
 *
 * 이 파일이 정하는 건 두 가지다:
 *   - isGradedMode: '채점하기'가 보이는가(Sidebar:218)와 눌러서 채점이 되는가
 *     (useQuizSession:72)를 한 규칙으로 묶는다. 둘이 갈리면 버튼은 보이는데 안 눌리거나
 *     그 반대가 된다 — 실제로 퀵을 붙일 때 났던 결함이다.
 *   - MODE_LABEL: 사용자에게 보이는 모드 이름의 단일 원천.
 */

describe('isGradedMode', () => {
  it('채점 회차가 남는 모드만 참이다', () => {
    expect(isGradedMode('exam')).toBe(true);
    expect(isGradedMode('random')).toBe(true);
    expect(isGradedMode('quick')).toBe(true);
  });

  // 연습·오답은 즉시 피드백이라 채점 개념이 없다. 참이 되면 채점 버튼이 떠서
  // 이미 정답을 본 문항으로 회차가 기록된다.
  it('즉시 피드백 모드와 게이트는 거짓이다', () => {
    expect(isGradedMode('practice')).toBe(false);
    expect(isGradedMode('review')).toBe(false);
    expect(isGradedMode('home')).toBe(false);
  });

  // includes를 startsWith/정규식으로 바꾸면 조용히 새는 지점 — 못 박아 둔다.
  it('부분 일치나 대소문자 변형으로 새지 않는다', () => {
    expect(isGradedMode('')).toBe(false);
    expect(isGradedMode('Exam')).toBe(false);
    expect(isGradedMode('exams')).toBe(false);
    expect(isGradedMode('exa')).toBe(false);
    expect(isGradedMode('quick-random')).toBe(false);
  });

  it('GRADED_MODES의 모든 원소가 참이고, 그 밖은 전부 거짓이다', () => {
    expect([...GRADED_MODES]).toEqual(['exam', 'random', 'quick']);
    for (const m of GRADED_MODES) expect(isGradedMode(m)).toBe(true);
    const others = HISTORY_MODES.filter((m) => !(GRADED_MODES as readonly string[]).includes(m));
    for (const m of others) expect(isGradedMode(m), `${m}`).toBe(false);
  });
});

describe('MODE_LABEL', () => {
  it('모드별 라벨이 고정돼 있다', () => {
    expect(MODE_LABEL).toEqual({
      practice: '연습', exam: '시험', random: '랜덤', review: '오답', quick: '퀵',
    });
  });

  // App.tsx:22·MobileTopBar:43 등은 라벨이 없으면 모드 id를 그대로 노출한다
  // ('quick'이 화면에 영문으로 뜨는 식). 이력에 남는 모드는 전부 라벨이 있어야 한다.
  it('이력에 남는 모든 모드에 라벨이 있다', () => {
    for (const m of HISTORY_MODES) {
      expect(MODE_LABEL[m], `${m} 라벨 없음`).toBeTruthy();
    }
  });

  // 게이트는 사용자에게 보여줄 모드가 아니다 — 라벨이 생기면 상단바에 '홈'이 뜬다.
  it('게이트 모드(home)에는 라벨을 주지 않는다', () => {
    expect(MODE_LABEL.home).toBeUndefined();
  });
});

/**
 * MODE_CAPTION — 이 파일에서 **유일하게 검사가 닿지 않던 자리**였다.
 * 뮤테이션 실측 58.33%(7 kill / 5 survived)의 생존분이 전부 여기였다: 캡션 문자열을
 * 통째로 비워도 400개 넘는 검사가 전부 통과했다. 사용자가 읽는 안내문이므로
 * 내용까지 값으로 고정한다(MODE_LABEL과 같은 방식).
 */
describe('MODE_CAPTION', () => {
  it('모드별 캡션이 고정돼 있다', () => {
    expect(MODE_CAPTION).toEqual({
      practice: '즉시 정답·해설이 보여요. 기록되지 않습니다.',
      exam: '채점 후 정답이 공개돼요. 응시 중에는 세트·모드 변경이 잠깁니다.',
      random: '통계의 챕터 미니 시험으로 들어오는 모드예요. 채점하면 챕터 통계에 반영됩니다.',
      review: '틀린 문항만 모아 즉시 피드백으로 다시 풉니다.',
    });
  });

  // Sidebar는 `MODE_CAPTION[mode] && <p>`로 그린다 — 빈 문자열이면 캡션이 사라지는 게
  // 아니라 **빈 문단이 남는다**(레이아웃에 빈 줄). 값이 있으면 내용도 있어야 한다.
  it('캡션이 있으면 빈 문자열이 아니다', () => {
    for (const [mode, caption] of Object.entries(MODE_CAPTION)) {
      expect(caption.trim(), `${mode} 캡션이 비었다`).not.toBe('');
    }
  });

  // 게이트는 세그먼트가 뜨지 않는 화면이다 — 캡션이 생기면 그릴 자리가 없다.
  it('게이트 모드(home)에는 캡션을 주지 않는다', () => {
    expect(MODE_CAPTION.home).toBeUndefined();
  });

  /**
   * ⚠ 지금의 사실을 고정한다 — **퀵만 캡션이 없다.**
   *
   * 사이드바 세그먼트의 네 버튼은 practice·exam·quick·review인데(Sidebar.tsx:17),
   * 그중 퀵에서만 세그먼트 아래가 빈다. random은 반대로 세그먼트에 버튼이 없는데도
   * 캡션이 있고, 그 이유는 파일 주석에 적혀 있다(통계의 챕터 미니 시험으로 진입).
   * 퀵의 부재에는 그런 근거가 없어 **의도인지 누락인지 코드만으로는 알 수 없다.**
   *
   * 그래서 값을 바꾸지 않고 현재 상태만 못 박는다. 캡션을 채우기로 정하면 이 검사가
   * 먼저 빨간불이 되고, 그때 위 `toEqual`과 함께 고치면 된다.
   */
  it('세그먼트 모드 중 퀵만 캡션이 없다(현재 상태 고정)', () => {
    const segmentModes = ['practice', 'exam', 'quick', 'review'];
    const withCaption = segmentModes.filter((m) => MODE_CAPTION[m]);
    expect(withCaption).toEqual(['practice', 'exam', 'review']);
    expect(MODE_CAPTION.quick).toBeUndefined();
  });

  // 캡션이 붙은 모드는 사용자에게 이름으로도 불린다 — 라벨 없이 캡션만 있으면
  // 상단바엔 모드 id가 영문으로 뜨는데 사이드바엔 한국어 설명이 붙는 꼴이 된다.
  it('캡션이 있는 모드에는 라벨도 있다', () => {
    for (const mode of Object.keys(MODE_CAPTION)) {
      expect(MODE_LABEL[mode], `${mode} 라벨 없음`).toBeTruthy();
    }
  });
});

// 채점 모드인데 이력 허용 목록에 없으면, 그 회차의 mode가 sanitizeHistory에서
// 'exam'으로 보정돼(storage.ts:188) 10~20문항짜리 짧은 회차가 세트 전체 실전으로
// 집계된다. 퀵을 붙일 때 실제로 났던 결함이라, 다음 모드가 추가될 때 다시 나지
// 않도록 두 목록의 관계를 여기서 못 박는다.
describe('modeLabel × storage 교차 계약', () => {
  it('모든 채점 모드가 이력 허용 목록에 있다', () => {
    for (const m of GRADED_MODES) {
      expect(HISTORY_MODES as readonly string[], `${m}가 HISTORY_MODES에 없음`).toContain(m);
    }
  });
});
