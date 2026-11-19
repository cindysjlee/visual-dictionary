// 진행률 표시(FR-PRG-05): 전체와 카테고리별 "읽음 n / 전체 m". 막대는 장식이고 숫자를 글자로도 보인다
import type { IndexEntry } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { summarize } from "./summary.ts";

const Bar = ({ read, all }: { read: number; all: number }) => (
  <span className="progress-bar" aria-hidden="true">
    <span style={{ width: `${all ? (read / all) * 100 : 0}%` }} />
  </span>
);

export function ProgressSummary({ index, records }: { index: IndexEntry[]; records: Readonly<Record<string, { read: boolean }>> }) {
  const s = summarize(index, records);
  return (
    <div className="progress-summary">
      <p className="progress-total">
        <strong>
          {s.total.read} / {s.total.all}
        </strong>{" "}
        용어를 읽었어요
      </p>
      <Bar {...s.total} />
      <ul className="progress-cats">
        {s.byCategory.map((c) => (
          <li key={c.category}>
            <span>{CATEGORY_LABELS[c.category]}</span>
            <Bar {...c} />
            <span className="progress-num">
              {c.read}/{c.all}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
