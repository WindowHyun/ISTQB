import { describe, it, expect } from 'vitest';
import { GRADED_MODES, MODE_LABEL, isGradedMode } from './modeLabel';
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
  });

  // 연습·오답·퀵은 즉시 피드백이라 채점 개념이 없다. 참이 되면 채점 버튼이 떠서
  // 이미 정답을 본 문항으로 회차가 기록된다.
  // 퀵은 한 문항씩 확인하고 넘기는 무한 모드가 되면서 '회차'라는 단위 자체가 없어졌다.
  it('즉시 피드백 모드와 게이트는 거짓이다', () => {
    expect(isGradedMode('practice')).toBe(false);
    expect(isGradedMode('review')).toBe(false);
    expect(isGradedMode('quick')).toBe(false);
    expect(isGradedMode('home')).toBe(false);
  });

  // 폐지된 모드 — 이력에는 남지만 새로 채점될 일이 없다. 참이면 사이드바가 진입할 수
  // 없는 모드의 채점 UI를 그린다.
  it('폐지된 랜덤 모드는 거짓이다', () => {
    expect(isGradedMode('random')).toBe(false);
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
    // 채점(회차 기록)이 있는 모드는 시험과 4지선다 둘이다. 이 목록이 늘어난다는 것은
    // 복원 시 중복 회차 가드(storage)·사이드바 재응시 경로가 함께 넓어진다는 뜻이라,
    // 값 자체를 여기서 못 박아 무심코 늘어나는 것을 막는다.
    expect([...GRADED_MODES]).toEqual(['exam', 'choice']);
    for (const m of GRADED_MODES) expect(isGradedMode(m)).toBe(true);
    const others = HISTORY_MODES.filter((m) => !(GRADED_MODES as readonly string[]).includes(m));
    for (const m of others) expect(isGradedMode(m), `${m}`).toBe(false);
  });
});

describe('MODE_LABEL', () => {
  it('모드별 라벨이 고정돼 있다', () => {
    expect(MODE_LABEL).toEqual({
      practice: '연습', exam: '시험', review: '오답', quick: '퀵', choice: '4지선다',
      // 폐지된 모드 — 신규 진입은 없지만 과거 회차를 이름 없이 표시하지 않으려면 라벨은 남는다.
      random: '랜덤',
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
