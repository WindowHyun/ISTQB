const fs = require('fs');
const path = require('path');
const { normalizeQuestionData } = require('./normalize-utils');

const dataDirs = ['public/data/istqb', 'public/data/csts', 'www/data/istqb', 'www/data/csts'];
const reportsDir = path.join(process.cwd(), 'reports');
// 보정 결과를 데이터 폴더 옆에 두면 안 된다. www/data는 **배포되는 자산 폴더**라:
//   - sync-assets가 data를 public·dist로 통째로 복사해 .normalized.json까지 번들·APK에 실린다,
//   - validate-questions는 그 폴더의 *.json을 전부 읽어 같은 문항을 두 번 세고 id 중복으로 잡는다,
//   - .gitignore가 이 이름을 덮지 않아 실행할 때마다 커밋 후보 20여 개가 올라온다.
// reports/는 이미 무시되는 산출물 폴더다 — 결과를 전부 그 아래로 모은다.
const normalizedRoot = path.join(reportsDir, 'normalized');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

let totalProcessed = 0;
let totalRequiresReview = 0;
let reviewItems = [];

console.log('=== 데이터 자동 보정 시작 ===');

dataDirs.forEach(dir => {
  const absDir = path.join(process.cwd(), dir);
  if (!fs.existsSync(absDir)) return;

  const files = fs.readdirSync(absDir).filter(f => f.endsWith('.json') && !f.endsWith('.normalized.json'));
  
  files.forEach(file => {
    const filePath = path.join(absDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      

      if (data.questions && Array.isArray(data.questions)) {
        const normalizedQuestions = data.questions.map(q => {
          totalProcessed++;
          const { normalized, requiresManualReview } = normalizeQuestionData(q);
          
          if (requiresManualReview) {
            totalRequiresReview++;
            reviewItems.push({
              file: path.join(dir, file),
              id: q.id || q.number,
              reason: 'Needs manual review based on normalization rules',
              original: q
            });
          }
          
          return normalized;
        });

        data.questions = normalizedQuestions;

        // 보정 결과는 원본 옆이 아니라 reports/normalized/<원본경로>에 같은 이름으로 쓴다.
        // 이름을 바꾸지 않는 이유: 검토를 마치고 채택할 때 원본 위에 그대로 덮어쓸 수 있다.
        const outDir = path.join(normalizedRoot, dir);
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, file);
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');

        console.log(`✅ [${dir}/${file}] 보정 완료 -> ${path.relative(process.cwd(), outPath)}`);
      }
    } catch (e) {
      console.error(`❌ [${dir}/${file}] 오류: ${e.message}`);
    }
  });
});

const reportPath = path.join(reportsDir, 'question-data-issues.json');
fs.writeFileSync(reportPath, JSON.stringify({ reviewItems }, null, 2), 'utf8');

console.log('\n=== 데이터 보정 결과 요약 ===');
console.log(`총 문제 수: ${totalProcessed}`);
console.log(`정상 및 자동 보정 가능: ${totalProcessed - totalRequiresReview}`);
console.log(`수동 검토 필요: ${totalRequiresReview}`);
console.log(`\n리포트 파일 생성됨: ${reportPath}`);
console.log(`주의: 원본은 건드리지 않았습니다 — 보정 결과는 ${path.relative(process.cwd(), normalizedRoot)}/ 아래에 있습니다.`);
console.log('채택하려면 그 아래 파일을 같은 경로의 원본 위로 복사한 뒤 npm run validate로 확인하세요.');
