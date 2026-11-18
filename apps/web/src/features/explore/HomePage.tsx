import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { IndexEntry } from "@app/content-schema";

// shortcut: 이름 링크만 나열한다. 3단계에서 카드·카테고리 필터·검색으로 바꾼다
export default function HomePage() {
  const [terms, setTerms] = useState<IndexEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/content/index.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IndexEntry[]>;
      })
      .then(setTerms)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p role="alert">용어 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;
  if (!terms) return <p>불러오는 중…</p>;

  return (
    <section>
      <h1>용어</h1>
      <ul className="term-list">
        {terms.map((term) => (
          <li key={term.id}>
            <Link to={`/terms/${term.id}`}>{term.name}</Link>
            <p>{term.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
