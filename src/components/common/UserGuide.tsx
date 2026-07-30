import { Modal } from './Modal';

// 사이트 사용설명서 — 최초 화면(제품 게이트) 하단 버튼과 설정 모달에서 연다.
// 정적 콘텐츠라 스토어를 구독하지 않는다(게이트 화면은 앱 셸 밖이라 store 의존을 피해야
// 어디서든 렌더 가능). 기능이 바뀌면 이 문서도 함께 고친다 — E2E가 핵심 문구를 고정한다.
export const UserGuide = ({ onClose }: { onClose: () => void }) => (
  <Modal title="사이트 사용법" onClose={onClose}>
    <div className="modal-body guide-body" data-testid="user-guide">
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
          <li><strong>시험</strong> — "시험 시작"을 눌러야 응시가 시작되고 타이머가 0부터 갑니다. 응시 중에는 세트·모드 변경이 잠기며(🔒), <strong>채점하기</strong>를 눌러야 정답이 공개됩니다. 중단하려면 <strong>응시 포기</strong>(기록 없음)를 누르세요.</li>
          <li><strong>랜덤</strong> — 세트에서 최대 40문항을 무작위로 뽑아 모의고사처럼 풉니다. <strong>🔀 새 문제 뽑기</strong>로 언제든 새 조합을 받을 수 있어요. 실수로 <strong>새로고침해도 풀던 문항·답안이 그대로 유지</strong>됩니다(새 조합은 ‘새 문제 뽑기’로).</li>
          <li><strong>오답</strong> — 시험·랜덤에서 틀린 문항만 다시 풉니다(즉시 피드백). 퀵 오답은 회차 기록이 아니라 오답 노트의 임시 목록으로만 봅니다.</li>
          <li><strong>⚡ 퀵 랜덤</strong> — 세트를 고르지 않고 <strong>해당 자격증의 전 세트</strong>에서 10·15·20문항을 뽑아 짧게 풉니다. 제한시간이 없고, 같은 문제가 여러 세트에 실려 있어도 한 세션에 두 번 나오지 않습니다. 서답형도 섞여 나오되 <strong>한 회차의 30%를 넘지 않습니다</strong>. 짧은 표본이라 <strong>합격 판정을 내리지 않고</strong> 맞힌 개수만 보여주며, <strong>회차 기록을 아예 남기지 않습니다</strong> — 응시 이력·요약·타임라인 어디에도 뜨지 않아요(챕터별 정답률에는 반영돼 약점 분석이 정확해집니다). 틀린 문항은 오답 노트 맨 위 <strong>퀵 전용 임시 목록</strong>에 실리고 <strong>24시간 뒤 자동으로 사라집니다</strong>.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>✅ 채점과 결과</h4>
        <ul>
          <li>미응답 문항이 있으면 채점 전에 <strong>확인 화면</strong>이 떠서 빈 문항으로 바로 이동해 마저 풀 수 있습니다(미응답은 오답 처리).</li>
          <li>결과에는 점수·<strong>합격 여부</strong>(ISTQB 65% / CSTS 환산 52.5점)·소요 시간과 <strong>직전 회차 대비 ▲/▼</strong> 변화가 표시됩니다.</li>
          <li><strong>다시 풀기</strong> 버튼(또는 활성 모드 탭 재클릭)으로 바로 재응시할 수 있습니다.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h4>📊 학습 통계 — 약점 찾고 재측정하기</h4>
        <ul>
          <li><strong>챕터별 정답률</strong>이 낮은 순으로 표시되고, 합격 컷 미만 챕터는 약점으로 강조됩니다.</li>
          <li>약점 챕터의 <strong>연습</strong> 버튼 = 그 챕터만 골라 연습(기록 없음), <strong>미니 시험</strong> 버튼 = 그 챕터 10문항 시험(<strong>채점하면 통계에 반영</strong>) — 보완 후 실력이 올랐는지 재측정하는 용도입니다.</li>
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
          <li>키보드 <strong>← →</strong>로 문항 이동, <strong>문항 목록</strong>(팔레트)에서 번호로 바로 점프 — 답한 문항/빈 문항이 색으로 구분됩니다.</li>
          <li>그림 문항은 이미지를 누르면 <strong>확대</strong>됩니다(Esc로 닫기).</li>
          <li>한 번 접속해두면 <strong>오프라인</strong>에서도 동작합니다(PWA).</li>
        </ul>
      </section>
    </div>
  </Modal>
);
