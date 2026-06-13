export function ResultPanel({ isCorrect }: { isCorrect?: boolean }) {
  if (isCorrect === undefined) return null;
  return <section className={isCorrect ? "feedback correct" : "feedback wrong"}>{isCorrect ? "정답입니다." : "다시 확인해 보세요."}</section>;
}
