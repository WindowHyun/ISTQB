/**
 * validate-questions.js
 * 문제 데이터 검증 스크립트 (Phase 2 - Wiki 요구사항 구현)
 * 
 * 검증 항목:
 * 1. JSON 파싱 가능 여부
 * 2. 필수 필드 존재 여부
 * 3. id 중복 여부
 * 4. number 중복 여부
 * 5. option key 중복 여부
 * 6. answer가 options 안에 존재하는지
 * 7. multiple_choice인데 options가 비어 있지 않은지
 * 8. figure 경로가 실제 존재하는지
 * 9. stem block type이 허용된 값인지
 * 10. explanation block type이 허용된 값인지
 * 11. 수동 \n 사용 여부
 * 12. 문제와 보기 텍스트가 비어 있지 않은지
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_BLOCK_TYPES = ['paragraph', 'note', 'prompt', 'list', 'table', 'code', 'formula', 'image'];
const REQUIRED_FIELDS = ['id', 'number', 'type', 'stem', 'options', 'answer'];

// 분류 체계(Phase 0) — chapter 값이 자격증별 taxonomy에 등록된 이름인지 검증한다.
// 자격증명 → 유효 챕터 이름 Set. taxonomy.json 이 없으면 chapter 검증은 건너뛴다.
let TAXONOMY = null;
try {
  const taxPath = fs.existsSync(path.join(process.cwd(), 'www/data/taxonomy.json'))
    ? path.join(process.cwd(), 'www/data/taxonomy.json')
    : path.join(process.cwd(), 'data/taxonomy.json');
  const tax = JSON.parse(fs.readFileSync(taxPath, 'utf8'));
  TAXONOMY = {};
  for (const [cert, def] of Object.entries(tax.certifications || {})) {
    TAXONOMY[cert] = new Set((def.chapters || []).map((c) => c.name));
  }
} catch { /* taxonomy 없음 — chapter 검증 생략 */ }

let totalErrors = 0;
let totalWarnings = 0;

function log(level, file, qId, message) {
  const prefix = level === 'ERROR' ? '❌' : '⚠️';
  console.log(`  ${prefix} [${level}] ${qId || 'GLOBAL'}: ${message}`);
  if (level === 'ERROR') totalErrors++;
  else totalWarnings++;
}

function validateQuestion(q, filePath, allIds, allNumbers) {
  const qId = q.id || `#${q.number || '?'}`;

  for (const field of REQUIRED_FIELDS) {
    if (q[field] === undefined || q[field] === null) {
      log('ERROR', filePath, qId, `필수 필드 '${field}' 누락`);
    }
  }

  if (q.id) {
    if (allIds.has(q.id)) {
      log('ERROR', filePath, qId, `id 중복: ${q.id}`);
    }
    allIds.add(q.id);
  }

  if (q.number !== undefined) {
    const numKey = `${filePath}:${q.number}`;
    if (allNumbers.has(numKey)) {
      log('ERROR', filePath, qId, `number 중복: ${q.number}`);
    }
    allNumbers.add(numKey);
  }

  if (Array.isArray(q.options)) {
    if (q.type === 'multiple_choice' && q.options.length !== 4 && q.options.length !== 5) {
      log('WARNING', filePath, qId, `options 개수가 4개 또는 5개가 아님 (현재 ${q.options.length}개)`);
    }

    const optionKeys = new Set();
    for (const opt of q.options) {
      if (opt.key && optionKeys.has(opt.key)) {
        log('ERROR', filePath, qId, `option key 중복: ${opt.key}`);
      }
      if (opt.key) optionKeys.add(opt.key);
    }

    if (Array.isArray(q.answer) && q.type === 'multiple_choice') {
      for (const ans of q.answer) {
        if (!optionKeys.has(ans)) {
          log('ERROR', filePath, qId, `answer '${ans}'가 options에 존재하지 않음`);
        }
      }
    }

    if (q.type === 'multiple_choice' && q.options.length === 0) {
      log('ERROR', filePath, qId, `multiple_choice인데 options가 비어 있음`);
    }

    for (const opt of q.options) {
      if (!opt.text || opt.text.trim() === '') {
        log('WARNING', filePath, qId, `option '${opt.key}' 텍스트가 비어 있음`);
      }
    }
  }

  // true_false / short_answer 정답 검증 (#73 — MC 외 타입의 정답도 검사)
  if (q.type === 'true_false') {
    const ans = Array.isArray(q.answer) ? q.answer[0] : q.answer;
    if (!ans || !/^[ox]$/i.test(String(ans).trim())) {
      log('ERROR', filePath, qId, `true_false 정답이 o/x가 아님: '${ans}'`);
    }
  }

  if (q.type === 'short_answer') {
    const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
    const ans = answers[0];
    if (!ans || String(ans).trim() === '') {
      log('ERROR', filePath, qId, `short_answer 정답이 비어 있음`);
    }

    // (신규) 진위형(○/X) 오분류 감지 — 정답이 모두 단일 O/X 기호이면 사실상 true_false다.
    // 이렇게 분류되면 O/X 버튼 대신 텍스트 입력창이 뜨고, 화면의 '○'를 입력하면 정답
    // 'O'와 불일치해 오답 처리되며, 배점도 1.0(진위형)이 아닌 1.5(서답형)로 계산된다.
    const oxAll =
      answers.length > 0 &&
      answers.every((a) => a != null && /^[oxOX○×]$/.test(String(a).trim()));
    if (oxAll) {
      log('ERROR', filePath, qId, `진위형(○/X)으로 보이는데 type이 short_answer임 — true_false로 변경 필요 (정답=${JSON.stringify(q.answer)})`);
    }

    // (신규) 여러 동의어가 한 정답 문자열에 콤마/공백 슬래시/"또는"/이중공백으로 뭉쳐 있으면
    // 경고한다. 매칭 로직(isQuestionCorrect)이 분할 처리하지만, answer 배열의 개별 원소로
    // 분리해 두는 편이 데이터 정합성·가독성에 좋다. (용어 내부 '조건/결정'은 공백 없는 슬래시라 제외)
    const MASHED = /[,，]|\s+\/\s+|\s+또는\s+|\s{2,}/;
    if (!oxAll) {
      for (const a of answers) {
        if (typeof a === 'string' && MASHED.test(a)) {
          log('WARNING', filePath, qId, `서답형 정답에 여러 동의어가 한 문자열에 혼입 — answer 배열 원소로 분리 권장: ${a.slice(0, 40)}`);
        }
      }
    }
  }

  if (q.figure) {
    const figPath = q.figure.startsWith('/') ? q.figure.substring(1) : q.figure;
    const candidates = [
      path.join(process.cwd(), figPath),
      path.join(process.cwd(), 'www', figPath),
    ];
    const exists = candidates.some(p => fs.existsSync(p));
    if (!exists) {
      log('WARNING', filePath, qId, `figure 파일 미존재: ${q.figure}`);
    }
  }

  const validateBlocks = (blocks, fieldName) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (block.type && !ALLOWED_BLOCK_TYPES.includes(block.type)) {
        log('WARNING', filePath, qId, `${fieldName} block type '${block.type}' 은 허용되지 않은 값`);
      }
    }
  };
  validateBlocks(q.stem, 'stem');
  validateBlocks(q.explanation, 'explanation');

  const checkNewlines = (blocks, fieldName) => {
    if (!Array.isArray(blocks)) {
      if (typeof blocks === 'string' && blocks.includes('\\n')) {
        log('WARNING', filePath, qId, `${fieldName}에 수동 \\n 포함`);
      }
      return;
    }
    for (const block of blocks) {
      if (typeof block.text === 'string' && block.text.includes('\\n')) {
        log('WARNING', filePath, qId, `${fieldName} block에 수동 \\n 포함`);
      }
    }
  };
  checkNewlines(q.stem, 'stem');
  checkNewlines(q.explanation, 'explanation');

  if (Array.isArray(q.stem) && q.stem.length === 0) {
    log('ERROR', filePath, qId, `stem이 비어 있음`);
  } else if (Array.isArray(q.stem)) {
    const stemText = q.stem.map(b => b.text || '').join('\n');
    const optionMatches = stemText.match(/(?:^|\s)([가-라][\-\.]|[1-4]\)|[①-④]|[A-D][\.\)])\s+/g);
    if (optionMatches) {
      const realMatches = optionMatches.filter(m => !m.includes('다.') && !m.includes('라.'));
      if (realMatches.length >= 2) {
        // CSTS-EL-2018-010: 보기(가~라)가 지문에 오는 원본 구조 — 렌더 정상(E2E 4항목 검증).
        // CSTS-FL-2402-024: 보기(A~J) 목록이 지문에 오는 원본 구조 — 선택지는 조합(①~④).
        if (!['ISTQB-FL-V4-B-017', 'ISTQB-FL-V4-D-004', 'CSTS-EL-2018-002', 'CSTS-EL-2018-010', 'CSTS-FL-2402-024'].includes(qId)) {
          log('WARNING', filePath, qId, `stem 안에 보기 패턴이 남아있을 가능성 있음`);
        }
      }
    }
  }

  // 조각남(PDF 추출 아티팩트): 괄호 약어가 블록 경계에서 쪼개진 경우.
  // 예) block[i]가 "…개발(ATD" 로 끝나고 block[i+1]이 "D) …" 로 시작 → "(ATDD)".
  // 정상 텍스트엔 이런 형태가 없어 오탐이 사실상 없다. (REQ 05-017 류 재발 방지)
  if (Array.isArray(q.stem)) {
    for (let i = 0; i < q.stem.length - 1; i++) {
      const a = String(q.stem[i].text || '').trim();
      const b = String(q.stem[i + 1].text || '').trim();
      if (/\([A-Za-z0-9]{1,4}$/.test(a) && /^[A-Za-z0-9]{1,3}\)/.test(b)) {
        log('WARNING', filePath, qId, `괄호 약어가 stem 블록 경계에서 쪼개짐: "…${a.slice(-8)}" + "${b.slice(0, 8)}…"`);
      }
    }
  }

  if (Array.isArray(q.options)) {
    for (const opt of q.options) {
      const optionMatches = opt.text ? opt.text.match(/(?:\s)([가-라][\-\.]|[1-4]\)|[①-④]|[A-D][\.\)])\s+/g) : null;
      if (optionMatches && optionMatches.length > 0) {
        // Filter out common false positives in option text like "다. ", "라. "
        const realMatches = optionMatches.filter(m => !m.includes('다.') && !m.includes('라.'));
        if (realMatches.length > 0) {
          if (!['CSTS-FL-2402-028'].includes(qId)) {
            log('WARNING', filePath, qId, `options 텍스트 안에 여러 선택지가 합쳐져 있을 가능성 있음: ${opt.text.substring(0, 20)}...`);
          }
        }
      }
    }
  }
}

function validateFile(filePath) {
  console.log(`\n📄 ${path.basename(filePath)}`);

  let data;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    log('ERROR', filePath, null, `JSON 파싱 실패: ${e.message}`);
    return;
  }

  const questions = data.questions || [];
  if (questions.length === 0) {
    log('WARNING', filePath, null, '문제가 0개입니다');
    return;
  }

  const allIds = new Set();
  const allNumbers = new Set();

  for (const q of questions) {
    validateQuestion(q, filePath, allIds, allNumbers);
  }

  // 챕터(대단원) 검증 — 값이 있으면 taxonomy에 등록된 이름이어야 함(오타·잘못된 값 차단).
  // null(미태깅)은 오류가 아니라 커버리지 정보로만 집계한다.
  if (TAXONOMY) {
    const cert = data.meta && data.meta.certification;
    const valid = cert && TAXONOMY[cert];
    let untagged = 0;
    for (const q of questions) {
      if (q.chapter == null) { untagged += 1; continue; }
      if (valid && !valid.has(q.chapter)) {
        log('ERROR', filePath, q.id || `#${q.number}`, `chapter '${q.chapter}'가 ${cert} taxonomy에 없음`);
      }
    }
    if (untagged > 0) {
      // 미태깅은 오류·경고가 아니라 Phase 0 진행 중 예상되는 상태 — 정보로만 표기(경고 0 유지).
      console.log(`  ℹ️  챕터 미태깅 ${untagged}/${questions.length}개(리뷰 대상 — chapter-overrides.json으로 보정)`);
    }
  }

  if (allNumbers.size > 0) {
    const nums = Array.from(allNumbers).map(n => parseInt(n.split(':')[1], 10)).filter(n => !isNaN(n));
    if (nums.length > 0) {
      const maxNum = Math.max(...nums);
      const missing = Array.from({length: maxNum}, (_, i) => i + 1).filter(i => !nums.includes(i));
      if (missing.length > 0) {
        log('WARNING', filePath, null, `누락된 문제 번호: ${missing.join(', ')}`);
      }
    }
  }

  console.log(`  ✅ ${questions.length}개 문제 검증 완료`);
}

console.log('=== 문제 데이터 검증 시작 ===\n');

const dataDirs = ['www/data/istqb', 'www/data/csts', 'data/istqb', 'data/csts'];
let filesChecked = 0;

for (const dir of dataDirs) {
  const absDir = path.join(process.cwd(), dir);
  if (!fs.existsSync(absDir)) continue;

  const files = fs.readdirSync(absDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    validateFile(path.join(absDir, file));
    filesChecked++;
  }
}

console.log(`\n=== 검증 완료 ===`);
console.log(`파일: ${filesChecked}개`);
console.log(`오류: ${totalErrors}개`);
console.log(`경고: ${totalWarnings}개`);

if (totalErrors > 0) {
  console.log('\n❌ 검증 실패 - 오류를 수정해 주세요.');
  process.exit(1);
} else {
  console.log('\n✅ 검증 통과!');
  process.exit(0);
}
