import { Modal } from './Modal';

// 사이트 사용설명서 — 최초 화면(제품 게이트) 하단 버튼과 설정 모달에서 연다.
// 정적 콘텐츠라 스토어를 구독하지 않는다(게이트 화면은 앱 셸 밖이라 store 의존을 피해야
// 어디서든 렌더 가능). 기능이 바뀌면 이 문서도 함께 고친다 — E2E가 핵심 문구를 고정한다.
export const UserGuide = ({ onClose }: { onClose: () => void }) => (
  <Modal title="사이트 사용법" onClose={onClose}>
    <div className="modal-body guide-body" data-testid="user-guide">
      {/* 모드 요약을 최상단에 배치 — 아래 상세 설명(📝)을 다 읽지 않아도 차이를
          한눈에 비교할 수 있게 한다(#gate-optimize E). */}
      <section className="guide-section guide-overview">
        <h4>📋 한눈에 보기 — 풀이 모드 5가지</h4>
        <div className="guide-overview-list">
          <div className="guide-overview-row"><strong>연습</strong><span>즉시 정답·해설 · 기록 안 됨</span></div>
          <div className="guide-overview-row"><strong>4지선다</strong><span>보기 4개짜리만 섞어서 · 채점·기록</span></div>
          <div className="guide-overview-row"><strong>시험</strong><span>채점 후 공개 · 응시 중 잠금</span></div>
          <div className="guide-overview-row"><strong>오답</strong><span>틀린 문항만 즉시 피드백으로 재풀이</span></div>
          <div className="guide-overview-row"><strong>퀵</strong><span>전 세트를 섞어 한 문항씩 무한 · 기록 없음</span></div>
        </div>
      </section>

      <section className="guide-section">
        <h4>🚀 시작하기</h4>
        <ol>
          <li>첫 화면에서 <strong>ISTQB / CSTS</strong> 중 공부할 자격증을 선택합니다.</li>
          <li>왼쪽 사이드바(모바일은 ☰ 메뉴)에서 <strong>문제 세트</strong>를 고릅니다.</li>
          <li><strong>풀이 모드</strong>를 골라 문제를 풉니다 — 모드별 차이는 아래를 참고하세요.</li>
        </ol>
      </section>

      <section className="guide-section">
        <h4>📝 풀이 모드 5가지</h4>
        <ul>
          <li><strong>연습</strong> — 답을 고르면 <em>즉시</em> 정답·해설이 보입니다. 부담 없이 개념을 익히는 모드로, <strong>통계에는 기록되지 않습니다</strong>.</li>
          <li><strong>4지선다</strong> — 지금 고른 세트에서 <strong>보기가 4개인 문항만</strong> 골라 <em>섞어서</em> 냅니다(진위형·서답형·복수정답은 빠집니다). <strong>채점하기</strong>를 눌러야 정답이 공개되고 <strong>회차로 기록</strong>돼요. 시작 게이트·제한시간은 없습니다. 시험과 표본이 달라 정답률을 나란히 비교하지는 마세요 — 통계의 성장폭은 모드별로 갈라 셉니다.</li>
          <li><strong>시험</strong> — "시험 시작"을 눌러야 응시가 시작되고 타이머가 0부터 갑니다. 응시 중에는 세트·모드 변경이 잠기며(🔒), <strong>채점하기</strong>를 눌러야 정답이 공개됩니다. 중단하려면 <strong>응시 포기</strong>(기록 없음)를 누르세요.</li>
          <li><strong>오답</strong> — 시험에서 틀린 문항만 다시 풉니다(즉시 피드백). 퀵에서 틀린 문항은 기록되지 않으므로 여기 오지 않습니다.</li>
          <li><strong>⚡ 퀵</strong> — 세트를 고르지 않고 <strong>해당 자격증의 전 세트를 통째로 섞어</strong> 한 문항씩 냅니다. 풀면 <em>바로</em> 정답·해설이 열리고 <strong>다음 문제</strong>로 넘어갑니다. <strong>끝이 정해져 있지 않아</strong> 그만두고 싶을 때까지 이어서 풀 수 있고, 같은 문제가 여러 세트에 실려 있어도 한 바퀴에 두 번 나오지 않습니다. 화면 위에 <strong>진행·정답·오답·연속 정답</strong>이 계속 보입니다. 제한시간이 없고 <strong>아무 기록도 남지 않습니다</strong> — 응시 이력·요약·타임라인·오답 노트·챕터별 정답률 어디에도 반영되지 않아요.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>✅ 채점과 결과</h4>
        <ul>
          <li>미응답 문항이 있으면 채점 전에 <strong>확인 화면</strong>이 떠서 빈 문항으로 바로 이동해 마저 풀 수 있습니다(미응답은 오답 처리).</li>
          <li>결과에는 점수·<strong>합격 여부</strong>(ISTQB 65% 이상 정답 / CSTS 검정방법별 배점 합산 75점 이상·100점 만점)·소요 시간과 <strong>직전 회차 대비 ▲/▼</strong> 변화가 표시됩니다.</li>
          <li><strong>다시 풀기</strong> 버튼(또는 활성 모드 탭 재클릭)으로 바로 재응시할 수 있습니다.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>📊 학습 통계 — 약점 찾고 재측정하기</h4>
        <ul>
          <li><strong>챕터별 정답률</strong>이 낮은 순으로 표시되고, 합격 컷 미만 챕터는 약점으로 강조됩니다.</li>
          <li>약점 챕터의 <strong>연습</strong> 버튼으로 그 챕터 문항만 골라 해설과 함께 익힐 수 있어요(<strong>기록 없음</strong>). 보완 후 실력이 올랐는지 재려면 <strong>시험</strong> 모드로 채점하세요 — 챕터별 정답률은 시험 채점으로 갱신됩니다.</li>
          <li>세트별 <strong>회차 타임라인</strong>에서 1회차→N회차 성장 추이를 확인할 수 있습니다.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>📒 오답 노트</h4>
        <ul>
          <li>채점한 <strong>모든 회차의 오답이 누적</strong>됩니다. 문항을 누르면 지문·보기·내 답·정답을 다시 볼 수 있어요.</li>
          <li>최근 시험 2회 연속으로 맞힌 문항에는 <strong>✓ 극복</strong> 배지가 붙고 흐리게 표시됩니다.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>💾 저장과 백업</h4>
        <ul>
          <li>풀던 진행·답안·기록은 <strong>자동 저장</strong>됩니다. 재접속하면 이어풀기/새로 풀기를 선택할 수 있어요(이미 채점한 시험은 결과 보기/새 회차로 안내).</li>
          <li>다른 기기로 옮길 때는 설정의 <strong>기록 내보내기/가져오기</strong>(JSON 백업)를 쓰세요.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>⚙️ 편의 기능</h4>
        <ul>
          <li>설정에서 <strong>다크 모드</strong>·<strong>글자 크기</strong>(작게/기본/크게)를 바꿀 수 있습니다.</li>
          <li>연습·시험·오답에서는 키보드 <strong>← →</strong>로 문항을 옮기고, <strong>문항 목록</strong>(팔레트)에서 번호로 바로 점프할 수 있어요 — 답한 문항/빈 문항이 색으로 구분됩니다. (퀵은 <strong>다음 문제</strong>로만 앞으로 나아갑니다)</li>
          <li>그림 문항은 이미지를 누르면 <strong>확대</strong>됩니다(Esc로 닫기).</li>
          <li>한 번 접속해두면 <strong>오프라인</strong>에서도 동작합니다(PWA).</li>
        </ul>
      </section>
    </div>
  </Modal>
);
