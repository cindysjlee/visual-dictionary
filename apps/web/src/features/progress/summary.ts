// 진행률(FR-PRG-05): 저장하지 않고 계산한다. 공개 용어(index.json) 중 읽음 수 ÷ 공개 용어 수(docs/02 규칙). 목록에 없는 용어의 기록은 세지 않는다
import type { Category, IndexEntry } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";

export type Count = { read: number; all: number };
export type Summary = { total: Count; byCategory: (Count & { category: Category })[] };

export function summarize(index: Pick<IndexEntry, "id" | "category">[], records: Readonly<Record<string, { read: boolean }>>): Summary {
  const byCategory = new Map<Category, Count>();
  for (const t of index) {
    const c = byCategory.get(t.category) ?? { read: 0, all: 0 };
    c.all++;
    if (records[t.id]?.read) c.read++;
    byCategory.set(t.category, c);
  }
  const ordered = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => byCategory.has(c)).map((category) => ({ category, ...byCategory.get(category)! }));
  return {
    total: ordered.reduce((s, c) => ({ read: s.read + c.read, all: s.all + c.all }), { read: 0, all: 0 }),
    byCategory: ordered,
  };
}

export type ReadFilter = "all" | "read" | "unread";
export const passesReadFilter = (filter: ReadFilter, read: boolean) => filter === "all" || (filter === "read") === read;
