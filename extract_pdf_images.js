const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');
const { createCanvas } = require('canvas');

class DOMMatrix {}
global.DOMMatrix = DOMMatrix;

const repoDir = 'C:/Users/Computer/.gemini/antigravity/worktrees/ISTQB/fix-codex-phase4-compliance';

const pdfMap = {
  'ISTQB-FL-V4-A': path.join(repoDir, 'DATA/ISTQB_FL_v4.0_샘플문제_A_v1.7_한글_v1.0.pdf'),
  'ISTQB-FL-V4-B': path.join(repoDir, 'DATA/ISTQB_FL_v4.0_샘플문제_B_v1.7_한글_v1.0.pdf'),
  'ISTQB-FL-V4-C': path.join(repoDir, 'DATA/ISTQB_FL_v4.0_샘플문제_C_v1.6_한글_v1.0.pdf'),
  'ISTQB-FL-V4-D': path.join(repoDir, 'DATA/ISTQB_FL_v4.0_샘플문제_D_v1.5_한글_v1.0.1.pdf'),
  'CSTS-FL-2402': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/(공개답안) CSTS 2402FL.pdf'),
  'CSTS-FL-2403': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/(공개답안) CSTS 2403FL.pdf'),
  'CSTS-FL-2404': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/(공개답안) CSTS 2404FL.pdf'),
  'CSTS-FL-2405': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/(공개답안) CSTS 2405FL.pdf'),
  'CSTS-EL-2018': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/2018년도 CSTS 자격시험 예제(일반등급).pdf'),
  'CSTS-EL-2019': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/2019년도 CSTS 자격시험 예제(일반등급).pdf'),
  'CSTS-EL-SW-EXAMPLE': path.join(repoDir, 'DATA/(공개답안) CSTS 2404FL/SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함.pdf'),
};

async function extractImages() {
  const jsonFiles = [
    path.join(repoDir, 'public/data/istqb/sample-a.json'),
    path.join(repoDir, 'public/data/istqb/sample-b.json'),
    path.join(repoDir, 'public/data/istqb/sample-c.json'),
    path.join(repoDir, 'public/data/istqb/sample-d.json'),
    path.join(repoDir, 'public/data/csts/csts-2402-fl.json'),
    path.join(repoDir, 'public/data/csts/csts-2403-fl.json'),
    path.join(repoDir, 'public/data/csts/csts-2404-fl.json'),
    path.join(repoDir, 'public/data/csts/csts-2405-fl.json'),
    path.join(repoDir, 'public/data/csts/csts-2018-general.json'),
    path.join(repoDir, 'public/data/csts/csts-2019-general.json'),
    path.join(repoDir, 'public/data/csts/csts-example-answer-included.json'),
  ];

  const imgDirs = [
    path.join(repoDir, 'public', 'images', 'questions'),
    path.join(repoDir, 'www', 'images', 'questions'),
    path.join(repoDir, 'dist', 'images', 'questions'),
  ];

  for (const d of imgDirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  for (const file of jsonFiles) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let pdfPath = null;
    
    if (file.includes('sample-a.json')) pdfPath = pdfMap['ISTQB-FL-V4-A'];
    else if (file.includes('sample-b.json')) pdfPath = pdfMap['ISTQB-FL-V4-B'];
    else if (file.includes('sample-c.json')) pdfPath = pdfMap['ISTQB-FL-V4-C'];
    else if (file.includes('sample-d.json')) pdfPath = pdfMap['ISTQB-FL-V4-D'];
    else if (file.includes('csts-2402-fl.json')) pdfPath = pdfMap['CSTS-FL-2402'];
    else if (file.includes('csts-2403-fl.json')) pdfPath = pdfMap['CSTS-FL-2403'];
    else if (file.includes('csts-2404-fl.json')) pdfPath = pdfMap['CSTS-FL-2404'];
    else if (file.includes('csts-2405-fl.json')) pdfPath = pdfMap['CSTS-FL-2405'];
    else if (file.includes('csts-2018-general.json')) pdfPath = pdfMap['CSTS-EL-2018'];
    else if (file.includes('csts-2019-general.json')) pdfPath = pdfMap['CSTS-EL-2019'];
    else if (file.includes('csts-example-answer-included.json')) pdfPath = pdfMap['CSTS-EL-SW-EXAMPLE'];

    if (!pdfPath || !fs.existsSync(pdfPath)) continue;

    console.log('Loading PDF:', pdfPath);
    const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDoc = await pdfjsLib.getDocument({ data: pdfData, disableFontFace: true }).promise;

    let modified = false;

    for (let qIdx = 0; qIdx < data.questions.length; qIdx++) {
      const q = data.questions[qIdx];
      let hasTable = false;
      if (q.figure) hasTable = true;
      (q.stem || []).forEach(b => {
        if(b.type === 'table') hasTable = true;
        if(b.text && b.text.includes('|---|')) hasTable = true;
      });

      if (!hasTable) continue;

      const qNumText = q.number + '.';

      let targetPageNum = -1;
      let startY = -1;
      let endY = -1;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        let foundStart = false;
        let highestStart = 0;
        let lowestEnd = 999999;
        
        for (let j = 0; j < textContent.items.length; j++) {
          const item = textContent.items[j];
          const text = item.str.trim();
          
          if (!foundStart && text.startsWith(qNumText)) {
            foundStart = true;
            targetPageNum = i;
            highestStart = item.transform[5];
          } else if (foundStart && (text === '①' || text === '1)' || text.startsWith((q.number+1)+'.'))) {
            lowestEnd = item.transform[5];
            break;
          }
        }
        
        if (foundStart) {
          startY = highestStart;
          endY = lowestEnd;
          break;
        }
      }

      if (targetPageNum !== -1) {
        console.log(`Processing Question ${q.id} on page ${targetPageNum}, Y: ${startY} -> ${endY}`);
        
        const scale = 2.0;
        const page = await pdfDoc.getPage(targetPageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const canvasYStart = viewport.height - (startY * scale);
        let canvasYEnd = viewport.height - (endY * scale);
        
        if (canvasYEnd < canvasYStart) {
           canvasYEnd = canvasYStart + 600; 
        }

        let cropY = Math.max(0, canvasYStart - 20);
        let cropH = (canvasYEnd - canvasYStart) + 40;
        
        if (cropH <= 0 || cropH > viewport.height) cropH = 600;

        const cropCanvas = createCanvas(viewport.width, cropH);
        const cropCtx = cropCanvas.getContext('2d');
        
        cropCtx.fillStyle = 'white';
        cropCtx.fillRect(0, 0, viewport.width, cropH);
        cropCtx.drawImage(canvas, 0, cropY, viewport.width, cropH, 0, 0, viewport.width, cropH);
        
        for (const d of imgDirs) {
           const imgPath = path.join(d, `${q.id}.png`);
           fs.writeFileSync(imgPath, cropCanvas.toBuffer('image/png'));
        }

        let newStem = [];
        let replaced = false;
        for (const b of q.stem) {
          if (b.type === 'table' || (b.text && b.text.includes('|---|'))) {
            if (!replaced) {
              newStem.push({ type: 'image', text: `![이미지](/images/questions/${q.id}.png)` });
              replaced = true;
            }
          } else {
            newStem.push(b);
          }
        }
        
        q.stem = newStem;
        q.figure = `/images/questions/${q.id}.png`;
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      
      // Update www and dist too
      const wwwFile = file.replace('public\\', 'www\\').replace('public/', 'www/');
      const distFile = file.replace('public\\', 'dist\\').replace('public/', 'dist/');
      if (fs.existsSync(wwwFile)) fs.writeFileSync(wwwFile, JSON.stringify(data, null, 2));
      if (fs.existsSync(distFile)) fs.writeFileSync(distFile, JSON.stringify(data, null, 2));
      
      console.log('Updated JSON for:', file);
    }
  }
}

extractImages().catch(console.error);
