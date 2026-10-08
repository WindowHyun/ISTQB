import { memo } from 'react';
import type { SegmentTone } from '../../utils/questionStatus';

/**
 * 하단 바 위의 진행 스트립 — 문항 하나가 한 칸이다.
 *
 * 색만으로는 상태가 전달되지 않으므로(색약·야외 햇빛) 컨테이너가 수치를 말로 읽어 준다
 * (label — `stripLabel`). 칸 하나하나는 장식이라 보조기기에서 숨긴다: 40칸을 칸마다 읽으면
 * 소음이고, 칸 단위 탐색은 문항 목록 시트가 맡는다.
 *
 * 칸이 많으면(CSTS 70문항) 간격을 줄여 한 줄에 담는다.
 */
export const ProgressStrip = memo(({ tones, label }: { tones: SegmentTone[]; label: string }) => (
  <div
    className="progress-strip"
    data-testid="progress-strip"
    data-dense={tones.length > 40 ? 'true' : undefined}
    role="img"
    aria-label={label}
  >
    {tones.map((tone, i) => <span key={i} data-tone={tone} />)}
  </div>
));
ProgressStrip.displayName = 'ProgressStrip';
