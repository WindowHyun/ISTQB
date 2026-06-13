import type { ContentBlock } from "../../features/quiz/quiz.types";

export function QuestionStem({ blocks }: { blocks: ContentBlock[] }) {
  return <div className="stem" data-testid="question-stem">{blocks.map((block, index) => renderBlock(block, index))}</div>;
}

function renderBlock(block: ContentBlock, index: number) {
  if (block.type === "list") return <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  if (block.type === "table") return <table key={index}><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>;
  if (block.type === "image") return <figure key={index}><img src={block.src} alt={block.alt ?? ""} />{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>;
  return <p key={index} className={`stem-block stem-${block.type}`}>{block.text}</p>;
}
