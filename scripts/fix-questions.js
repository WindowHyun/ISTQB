const fs = require('fs');
const path = require('path');
const { normalizeQuestionData } = require('./normalize-utils');

const dataDirs = ['public/data/istqb', 'public/data/csts', 'www/data/istqb', 'www/data/csts'];
const reportsDir = path.join(process.cwd(), 'reports');

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
      
      let fileModCount = 0;
      let fileReviewCount = 0;

      if (data.questions && Array.isArray(data.questions)) {
        const normalizedQuestions = data.questions.map(q => {
          totalProcessed++;
          const { normalized, requiresManualReview } = normalizeQuestionData(q);
          
          if (requiresManualReview) {
            totalRequiresReview++;
            fileReviewCount++;
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

        // Write the normalized data to a new file
        const outPath = path.join(absDir, file.replace('.json', '.normalized.json'));
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
        
        console.log(`✅ [${dir}/${file}] 보정 완료 -> ${path.basename(outPath)}`);
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
console.log('주의: 변경된 데이터는 원본을 보호하기 위해 .normalized.json 확장자로 저장되었습니다.');
