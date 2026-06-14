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
        if (!['ISTQB-FL-V4-B-017', 'ISTQB-FL-V4-D-004', 'CSTS-EL-2018-002'].includes(qId)) {
          log('WARNING', filePath, qId, `stem 안에 보기 패턴이 남아있을 가능성 있음`);
        }
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
