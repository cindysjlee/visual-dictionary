// 사전 지면의 공통 부품(랜딩·색인 /terms·내 단어장 /me가 함께 쓴다): 가나다 색인(첫소리 머리), 엄지 색인(분야), 표제어 줄,
// → 참조, 분야별 밑줄 장부, 〔n단계, 방어 n〕 표기. 모양은 styles/dictionary.css, 색은 tokens.css의 --la-*
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { Category, IndexEntry } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";

// 첫소리 머리(ㄱ·ㄴ…): 겹자음은 홑자음 머리에 넣는다. 한글이 아니면 로마자 첫 글자
const CHOSEONG = "ㄱㄱㄴㄷㄷㄹㅁㅂㅂㅅㅅㅇㅈㅈㅊㅋㅌㅍㅎ";
export const initialOf = (name: string) => {
  const code = name.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)]! : name.charAt(0).toUpperCase();
};

/** 분야별 표제어(분야 순서는 CATEGORY_LABELS, 표제어가 없는 분야는 뺀다) */
export const groupByCategory = (index: IndexEntry[]) =>
  (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [c, index.filter((t) => t.category === c)] as const).filter(([, list]) => list.length > 0);

/** 가나다순으로 정렬해 첫소리로 묶는다 */
export function byInitial(terms: IndexEntry[]) {
  const out: { head: string; terms: IndexEntry[] }[] = [];
  for (const t of [...terms].sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
    const head = initialOf(t.name);
    if (out.at(-1)?.head === head) out.at(-1)!.terms.push(t);
    else out.push({ head, terms: [t] });
  }
  return out;
}

/** 〔6단계, 방어 2〕의 안쪽. 보안이 아닌 분야는 "해결" */
export const entryMeta = (t: Pick<IndexEntry, "stepCount" | "defenseCount" | "category">) =>
  `${t.stepCount}단계${t.defenseCount > 0 ? `, ${t.category === "web-security" ? "방어" : "해결"} ${t.defenseCount}` : ""}`;

/** 「분야」 표지. 괄호는 CSS(::before/::after)라 글자는 분야 이름만 */
export const Field = ({ category }: { category: Category }) => <span className={`la-field la-tab-${category} tag-${category}`}>{CATEGORY_LABELS[category]}</span>;

/** 요소의 일부가 처음 화면에 들어왔는지(한 번 true가 되면 그대로) */
export function useInView(ready: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || !ready) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, ready]);
  return [ref, seen] as const;
}

/** 엄지 색인: 분야별로 색인을 좁힌다(전체 + 분야마다 개수) */
export function Thumbs({
  label,
  groups,
  total,
  value,
  onChange,
}: {
  label: string;
  groups: (readonly [Category, IndexEntry[]])[];
  total: number;
  value: Category | "all";
  onChange: (c: Category | "all") => void;
}) {
  return (
    <div className="la-thumbs" role="group" aria-label={label}>
      <button type="button" className="la-thumb" aria-pressed={value === "all"} onClick={() => onChange("all")}>
        전체 <span className="la-thumb-count">{total}</span>
      </button>
      {groups.map(([c, list]) => (
        <button key={c} type="button" className={`la-thumb la-tab-${c}`} aria-pressed={value === c} onClick={() => onChange(c)}>
          {CATEGORY_LABELS[c]} <span className="la-thumb-count">{list.length}</span>
        </button>
      ))}
    </div>
  );
}

/** 사전의 "→ 참조": 관련 표제어 링크 */
export const SeeAlso = ({ list, className = "la-see" }: { list: IndexEntry[]; className?: string }) => (
  <p className={className}>
    <span aria-hidden="true">→ </span>
    <span className="visually-hidden">참조: </span>
    {list.map((r, i) => (
      <span key={r.id}>
        {i > 0 && ", "}
        <Link to={`/terms/${r.id}`}>{r.name}</Link>
      </span>
    ))}
  </p>
);

type Marks = {
  /** 밑줄 그을 표제어(읽음, 또는 랜딩 미리보기) */
  lined: ReadonlySet<string>;
  /** 책갈피(읽다 만 쪽) */
  resumeId?: string;
  /** 랜딩 미리보기: 밑줄·책갈피에 "미리보기" 표지를 단다 */
  preview?: boolean;
};

/** 가나다 색인: 첫소리 머리 아래 표제어 줄(표제어 + 원어 + 「분야」 + 풀이 〔단계, 방어〕 + → 참조) */
export function IndexColumns({
  terms,
  byId,
  lined,
  resumeId,
  preview = false,
  headingLevel = 3,
}: { terms: IndexEntry[]; byId: ReadonlyMap<string, IndexEntry>; /** 첫소리 머리의 제목 단계(바로 위 제목 + 1) */ headingLevel?: 2 | 3 } & Marks) {
  const Head = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="la-columns">
      {byInitial(terms).map(({ head, terms: list }) => (
        <div key={head} className="la-letter">
          <Head className="la-letter-head">
            <span className="visually-hidden">첫소리 </span>
            {head}
          </Head>
          <ul>
            {list.map((t) => {
              const on = lined.has(t.id);
              const see = t.related.map((id) => byId.get(id)).filter((r): r is IndexEntry => !!r);
              return (
                <li key={t.id} className="term-card">
                  <Link to={`/terms/${t.id}`} className="la-word">
                    <span className={on ? "la-hl is-on term-card-name" : "la-hl term-card-name"}>{t.name}</span>
                    {on && <span className="visually-hidden tag-read">{preview ? " (밑줄 미리보기)" : " (읽음)"}</span>}
                  </Link>
                  {t.englishName && (
                    <span className="la-en" lang="en">
                      {t.englishName}
                    </span>
                  )}
                  <Field category={t.category} />
                  {on && preview && (
                    <span className="la-preview" aria-hidden="true">
                      미리보기
                    </span>
                  )}
                  {t.id === resumeId && (
                    <span className="la-resume">
                      책갈피<span className="visually-hidden">: 읽다 만 쪽{preview ? " (미리보기)" : ""}</span>
                      {preview && <span aria-hidden="true"> · 미리보기</span>}
                    </span>
                  )}
                  <p className="la-def">
                    <span className="term-card-desc">{t.summary}</span>
                    <span className="la-meta">
                      {" "}
                      〔<span className="la-num">{entryMeta(t)}</span>〕
                    </span>
                  </p>
                  {see.length > 0 && <SeeAlso list={see} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * 분야별 밑줄 장부(진행률): 분야마다 밑줄 친 표제어 수를 형광펜 막대로 채운다. 숫자를 글자로도 보인다(막대는 장식).
 * 랜딩 미리보기면 캡션에 "미리보기"를 단다(지어낸 진행률이 아니라 색인의 밑줄 미리보기를 센다)
 */
export function Ledger({
  groups,
  lined,
  caption,
  note,
  resume,
  resumeNote,
}: {
  groups: (readonly [Category, IndexEntry[]])[];
  lined: ReadonlySet<string>;
  caption: string;
  note?: string;
  resume?: IndexEntry;
  resumeNote?: string;
}) {
  const all = groups.reduce((n, [, list]) => n + list.length, 0);
  const read = groups.reduce((n, [, list]) => n + list.filter((t) => lined.has(t.id)).length, 0);
  const id = useId();
  return (
    <figure className="la-ledger" aria-labelledby={id}>
      <figcaption id={id}>
        {caption}
        {note && <span>{note}</span>}
      </figcaption>
      <p className="progress-total">
        <strong className="la-num">
          {read} / {all}
        </strong>{" "}
        표제어에 밑줄
      </p>
      <ul className="progress-cats">
        {groups.map(([c, list]) => {
          const n = list.filter((t) => lined.has(t.id)).length;
          return (
            <li key={c} className={`la-tab-${c}`}>
              <span>{CATEGORY_LABELS[c]}</span>
              <span className="la-ledger-bar" aria-hidden="true">
                <span style={{ width: `${(n / list.length) * 100}%` }} />
              </span>
              <span className="la-num">
                {n}/{list.length}
              </span>
            </li>
          );
        })}
      </ul>
      {resume && (
        <p className="la-ledger-resume">
          <span className="la-resume">책갈피</span> 읽다 만 쪽: <Link to={`/terms/${resume.id}`}>{resume.name}</Link>
          {resumeNote}
        </p>
      )}
    </figure>
  );
}
