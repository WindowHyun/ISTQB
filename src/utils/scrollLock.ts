// body 스크롤 잠금 공용 유틸(공용 Modal·이미지 라이트박스가 공유).
// 중첩(모달 위 라이트박스)을 참조 카운트로 처리해, 닫는 순서와 무관하게
// 마지막 잠금이 풀릴 때만 원래 overflow를 복원한다 — 스냅샷/복원을 두 곳에서
// 각자 하면 겹침 순서에 따라 배경 스크롤이 풀리거나 영구히 잠길 수 있다.

let lockCount = 0;
let prevOverflow = '';

export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return; // 이중 해제 방지(effect cleanup이 중복 호출돼도 안전)
    released = true;
    lockCount -= 1;
    if (lockCount === 0) document.body.style.overflow = prevOverflow;
  };
}
