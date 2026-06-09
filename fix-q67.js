const fs = require('fs');

const file = 'public/data/csts/csts-2404-fl.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const q = data.questions.find(x => x.number === 67);

q.stem = [
  {
    "type": "prompt",
    "text": "다음 중 입력 인자와 클래스의 개수가 <보기>와 같을 때, 페어와이즈 조합 테스트를 적용하면 생성되는 테스트 케이스는 최소 몇 개인가?"
  },
  {
    "type": "paragraph",
    "text": "<보기>"
  },
  {
    "type": "table",
    "rows": [
      ["인자 1", "3개 클래스"],
      ["인자 2", "2개 클래스"],
      ["인자 3", "4개 클래스"]
    ]
  }
];

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Fixed Q67 table in 2404-fl');
