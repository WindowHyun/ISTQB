const fs = require('fs');

function load(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ISTQB Sample A Q14
let dataA = load('public/data/istqb/sample-a.json');
let q14_a = dataA.questions.find(q => q.number === 14);
if (q14_a) {
  q14_a.stem = [
    { type: 'paragraph', text: '당신은 세 가지 인수 조건 AC1, AC2, AC3을 사용해 사용자 스토리를 테스트하고 있다. AC1은 테스트 케이스 TC1로, AC2는 TC2로, AC3은 TC3로 커버한다.' },
    { type: 'paragraph', text: '테스트 실행 내역에 다음과 같이 세 가지 버전의 소프트웨어에서 연속으로 세 번의 테스트 실행이 있었다.' },
    { type: 'code', lines: [
      '          첫 번째 실행    두 번째 실행    세 번째 실행',
      'TC1       실패           합격           합격',
      'TC2       합격           실패           합격',
      'TC3       실패           실패           합격'
    ]},
    { type: 'paragraph', text: '테스트 실행 때 식별한 모든 결함이 수정되고 새로운 소프트웨어 버전이 준비되면 테스트를 다시 수행한다.' },
    { type: 'prompt', text: '다음 중 리그레션 테스트로 수행된 테스트는?' }
  ];
}
let q35_a = dataA.questions.find(q => q.number === 35);
if (q35_a) {
  q35_a.stem = [
    { type: 'paragraph', text: '리스크 분석 결과 다음 리스크가 식별되고 평가되었다.' },
    { type: 'list', items: [
      '리스크: 보고서 생성에 너무 많은 시간이 걸린다',
      '리스크 발생 가능성: 중간; 리스크 영향도: 높음',
      '리스크 대응 방법:',
      '  - 시스템 테스팅 중에 독립적인 테스트팀이 성능 효율성 테스팅을 수행한다',
      '  - 최종 사용자 표본 집단을 선별해 릴리스 전에 알파 테스팅과 베타 테스팅을 수행한다'
    ]},
    { type: 'prompt', text: '다음 중 분석한 리스크에 대해 대응 방법으로 제안된 것은?' }
  ];
}
save('public/data/istqb/sample-a.json', dataA);

// ISTQB Sample B Q18, Q25
let dataB = load('public/data/istqb/sample-b.json');
let q18_b = dataB.questions.find(q => q.number === 18);
if (q18_b) {
  q18_b.stem = [
    { type: 'paragraph', text: '리뷰에 다음과 같은 역할이 있다:' },
    { type: 'list', items: [
      '1. 서기',
      '2. 리뷰 리더',
      '3. 중재자',
      '4. 관리자'
    ]},
    { type: 'paragraph', text: '그리고 리뷰에서 맡은 책임은 다음과 같다:' },
    { type: 'list', items: [
      'A. 리뷰 회의의 효과적인 진행과 편안한 리뷰 환경을 보장한다',
      'B. 리뷰 회의에서 결정사항, 식별한 새로운 이상 현상과 같은 리뷰 정보를 기록한다',
      'C. 리뷰 대상을 결정하고 리뷰에 참여할 인력, 리뷰 시간 등 자원을 제공한다',
      'D. 리뷰 진행 시기, 장소 협의 등 리뷰에 대한 전반적인 책임을 진다'
    ]},
    { type: 'prompt', text: '다음 중 위의 역할과 책임을 가장 적절하게 연결한 것은?' }
  ];
}
let q25_b = dataB.questions.find(q => q.number === 25);
if (q25_b) {
  q25_b.stem = [
    { type: 'paragraph', text: '분기 커버리지 계산식은 다음과 같이 정의된다.' },
    { type: 'formula', text: 'BCov = (X / Y) * 100%' },
    { type: 'prompt', text: '이 공식에서 X 와 Y 는 무엇인가?' }
  ];
}
save('public/data/istqb/sample-b.json', dataB);

// ISTQB Sample C Q5, Q17, Q21, Q31
let dataC = load('public/data/istqb/sample-c.json');
let q5_c = dataC.questions.find(q => q.number === 5);
if (q5_c) {
  q5_c.stem = [
    { type: 'paragraph', text: '아래와 같은 테스트웨어 유형이 주어지고;' },
    { type: 'list', items: [
      '1. 커버리지 항목',
      '2. 변경 요청',
      '3. 테스트 실행 일정',
      '4. 테스트 컨디션 우선순위'
    ]},
    { type: 'paragraph', text: '다음과 같은 테스트 활동이 있다:' },
    { type: 'list', items: [
      'A. 테스트 분석',
      'B. 테스트 설계',
      'C. 테스트 구현',
      'D. 테스트 완료'
    ]},
    { type: 'prompt', text: '다음 중 위 테스트 활동에서 작성되는 테스트웨어를 가장 적절하게 연결한 것은?' }
  ];
}
let q17_c = dataC.questions.find(q => q.number === 17);
if (q17_c) {
  q17_c.stem = [
    { type: 'paragraph', text: '다음과 같은 리뷰 유형이 있다:' },
    { type: 'list', items: [
      '1. 기술 리뷰',
      '2. 비공식 리뷰',
      '3. 인스펙션',
      '4. 워크쓰루'
    ]},
    { type: 'paragraph', text: '그리고 다음과 같은 설명이 있다:' },
    { type: 'list', items: [
      'A. 합의 도출, 새로운 아이디어 도출, 저자의 개선 의지 향상 등의 목적을 가진다',
      'B. 리뷰어 훈련, 공감대 형성, 새로운 아이디어 도출, 잠재적 결함 식별과 같은 목적을 가진다',
      'C. 주요 목적은 잠재적 결함 식별이고, 프로세스 개선에 도움이 되는 지표 수집도 필요로 한다',
      'D. 주요 목적은 잠재적 결함 식별이고, 공식적인 결과 문서는 작성하지 않는다'
    ]},
    { type: 'prompt', text: '다음 중 리뷰 유형과 그 설명을 가장 적절하게 연결한 것은?' }
  ];
}
let q21_c = dataC.questions.find(q => q.number === 21);
if (q21_c) {
  q21_c.stem = [
    { type: 'paragraph', text: '개발자가 다음 비즈니스 규칙을 구현해 달라는 요청을 받았다:' },
    { type: 'code', lines: [
      'INPUT: value (integer number)',
      'IF (value <= 100 OR value >= 200) THEN',
      '    write “value incorrect”',
      'ELSE',
      '    write “value OK”'
    ]},
    { type: 'paragraph', text: '두(2)개 선택 경계값 분석(2-value boundary value analysis)으로 테스트 케이스를 설계하려고 한다.' },
    { type: 'prompt', text: '다음 테스트 입력 데이터 세트 중 커버리지가 가장 높은 것은?' }
  ];
}
let q31_c = dataC.questions.find(q => q.number === 31);
if (q31_c) {
  q31_c.stem = [
    { type: 'paragraph', text: '각 반복주기가 시작될 때 팀은 반복주기 중에 완료해야 하는 작업량(M/D)을 추정한다. E(n)이 반복주기 n의 예상 작업량이고 A(n)은 반복주기 n에서 수행한 실제 작업량을 나타낸다고 하자.' },
    { type: 'paragraph', text: '세 번째 반복주기부터 팀은 외삽법(extrapolation)을 기반으로 한 추정 모델을 사용한다.' },
    { type: 'formula', text: 'E(n) = (3 * A(n - 1) + A(n - 2)) / 4' },
    { type: 'paragraph', text: '그래프는 처음 4번 반복주기의 예상 작업량과 실제 작업량을 보여주고 있다.' },
    { type: 'code', lines: [
      '반복주기 1: 예상 50, 실제 45',
      '반복주기 2: 예상 45, 실제 53',
      '반복주기 3: 예상 48, 실제 55',
      '반복주기 4: 예상 54, 실제 45'
    ]},
    { type: 'prompt', text: '다음 중 반복주기 #5의 예상 작업량으로 올바른 것은?' }
  ];
}
save('public/data/istqb/sample-c.json', dataC);

// ISTQB Sample D Q8, Q34, Q39
let dataD = load('public/data/istqb/sample-d.json');
let q8_d = dataD.questions.find(q => q.number === 8);
if (q8_d) {
  q8_d.stem = [
    { type: 'paragraph', text: '다음 중 화이트박스 테스팅과 관련된 명제로 가장 적합한 것은?' }
  ];
  q8_d.choices = [
    { id: 'A', text: '모든 구문을 실행하기 위한 테스트 케이스 도출' },
    { id: 'B', text: '사용자의 비즈니스 시나리오를 바탕으로 한 테스트 도출' },
    { id: 'C', text: '소프트웨어의 내부 구조를 참조하지 않고 테스트 케이스 도출' },
    { id: 'D', text: '경계값 분석을 적용하여 테스트 케이스 도출' }
  ];
}
let q34_d = dataD.questions.find(q => q.number === 34);
if (q34_d) {
  q34_d.stem = [
    { type: 'paragraph', text: '다음은 테스팅 도구의 특징을 설명한 것이다. 가장 알맞은 도구를 고르시오.' },
    { type: 'list', items: [
      '- 프로그램 실행 없이 소스코드의 문법적, 구조적 오류를 검출한다.',
      '- 코딩 표준 준수 여부를 확인한다.',
      '- 소프트웨어 메트릭을 계산한다.'
    ]}
  ];
}
let q39_d = dataD.questions.find(q => q.number === 39);
if (q39_d) {
  q39_d.stem = [
    { type: 'paragraph', text: '다음 중 유지보수 테스팅이 필요하게 되는 주요 원인이 아닌 것은?' }
  ];
}
save('public/data/istqb/sample-d.json', dataD);

// ISTQB Sample Extra Q4, Q20, Q26
let dataE = load('public/data/istqb/sample-extra.json');
let q4_e = dataE.questions.find(q => q.number === 4);
if (q4_e) {
  q4_e.stem = [
    { type: 'paragraph', text: '다음 중 테스트 실행에 가장 도움이 되는 도구의 분류인 것은?' }
  ];
}
let q20_e = dataE.questions.find(q => q.number === 20);
if (q20_e) {
  q20_e.stem = [
    { type: 'paragraph', text: '다음 중 컴포넌트 통합 테스팅에 대한 설명으로 가장 적절한 것은?' }
  ];
}
let q26_e = dataE.questions.find(q => q.number === 26);
if (q26_e) {
  q26_e.stem = [
    { type: 'paragraph', text: '경계값 분석(Boundary Value Analysis)에 대한 설명으로 가장 적절한 것은?' }
  ];
}
save('public/data/istqb/sample-extra.json', dataE);

// CSTS 2402FL Q4, Q24
let data2402 = load('public/data/csts/csts-2402-fl.json');
let q4_2402 = data2402.questions.find(q => q.number === 4);
if (q4_2402) {
  q4_2402.stem = [
    { type: 'prompt', text: '<보기>의 요구사항 명세서 기준으로 반드시 수행되어야 할 테스트 유형으로 올바르지 않은 것은?' },
    { type: 'note', text: '<보기>\n1. 기능적 요구사항\n  1.1 기능 1\n  1.2 기능 2\n2. 품질 요구사항\n  2.1 성능 요구사항\n  2.2 보안 요구사항\n  2.3 신뢰성 요구사항' }
  ];
}
let q24_2402 = data2402.questions.find(q => q.number === 24);
if (q24_2402) {
  q24_2402.stem = [
    { type: 'prompt', text: '다음 보기에서 동일한 유형의 테스트 설계 기법으로만 짝 지어진 것은?' },
    { type: 'note', text: '<보기>\nA. 상태 전이 테스트\nB. 자료 흐름 테스트\nC. 문장 테스트\nD. 시나리오 테스트\nE. 동등 분할 테스트\nF. 분류 트리 테스트\nG. 페어와이즈 테스트\nH. 경계값 분석 테스트\nI. MC/DC 테스트\nJ. 결정 테이블 테스트' }
  ];
}
save('public/data/csts/csts-2402-fl.json', data2402);

// CSTS 2403FL Q6
let data2403 = load('public/data/csts/csts-2403-fl.json');
let q6_2403 = data2403.questions.find(q => q.number === 6);
if (q6_2403) {
  q6_2403.stem = [
    { type: 'prompt', text: '[보기]에서 설명하는 특징과 테스트 단계를 바르게 연결한 것은?' },
    { type: 'note', text: '<보기>\n가. 소프트웨어를 독립적으로 실행시킬 환경 필요\n나. 컴포넌트 통합에 필요한 환경 필요(테스트 드라이버, 테스트 스텁)\n다. 실제 사용자 환경 또는 사용자 환경과 최대한 유사한 환경 구성 필요' }
  ];
}
save('public/data/csts/csts-2403-fl.json', data2403);

// CSTS 2404FL Q4, Q23, Q67
let data2404 = load('public/data/csts/csts-2404-fl.json');
let q4_2404 = data2404.questions.find(q => q.number === 4);
if (q4_2404) {
  q4_2404.stem = [
    { type: 'prompt', text: '<보기>의 요구사항 명세서 기준으로 반드시 수행되어야 할 테스트 유형으로 올바르지 않은 것은?' },
    { type: 'note', text: '<보기>\n1. 기능적 요구사항\n  1.1 로그인 기능\n  1.2 결제 기능\n2. 품질 요구사항\n  2.1 초당 1000 트랜잭션 처리\n  2.2 사용자 데이터 암호화' }
  ];
}
let q23_2404 = data2404.questions.find(q => q.number === 23);
if (q23_2404) {
  q23_2404.stem = [
    { type: 'prompt', text: '<보기>의 프로그램 코드에서 (a=250) 테스트 케이스를 통해 수행되는 경로로 올바른 것은?' },
    { type: 'note', text: '<보기>\n1: a = input()\n2: if (a > 200):\n3:    print("High")\n4: else:\n5:    print("Low")\n6: end' }
  ];
}
let q67_2404 = data2404.questions.find(q => q.number === 67);
if (q67_2404) {
  q67_2404.stem = [
    { type: 'prompt', text: '다음 중 입력 인자와 클래스의 개수가 <보기>와 같을 때, 페어와이즈 조합 테스트를 적용하면 생성되는 테스트 케이스는 최소 몇 개인가?' },
    { type: 'note', text: '<보기>\n인자 1: 3개 클래스\n인자 2: 2개 클래스\n인자 3: 4개 클래스' }
  ];
}
save('public/data/csts/csts-2404-fl.json', data2404);
console.log('Done fixing JSONs');
