// 설명 틀(docs/04 "설명 틀", docs/05 "설명 틀과 각주"): 한 줄 정의 → 쉬운 비유 → 어떻게 일어나나 → 왜 위험한가(CS 용어는 왜 중요한가) → 각주 목록.
// 부분마다 이름표(h2)와 위 괘선으로 갈리고, 문단은 JSON의 문단 하나가 <p> 하나다
import type { BuiltTerm, Explanation as ExplanationData } from "@app/content-schema";
import { EXPLAIN_PARTS, partLabel } from "@app/content-schema/explain";
import { Marked } from "../dictionary/Marked.tsx";
import { Figure } from "./Figure.tsx";
import { FootnoteLink, FootnoteList, FootnoteWord } from "./Footnotes.tsx";

export function Explanation({ term, data }: { term: BuiltTerm; data: ExplanationData }) {
  const numberOf = new Map(term.footnotes.map((f, i) => [f.word, i + 1]));
  // 본문의 [[단어]] → 점선 밑줄 단어(풀이 상자) 또는 공개 용어 링크(실선 밑줄). 사전에 없는 단어는 검증기가 막으므로 여기서는 글자만 보인다
  const note = (word: string) => {
    const n = numberOf.get(word);
    const footnote = n ? term.footnotes[n - 1] : undefined;
    if (!n || !footnote) return word;
    return footnote.link ? <FootnoteLink n={n} word={word} note={footnote} /> : <FootnoteWord n={n} word={word} note={footnote} />;
  };
  const paragraphs: Record<(typeof EXPLAIN_PARTS)[number], string[]> = { definition: [data.definition], analogy: data.analogy, how: data.how, why: data.why };
  return (
    <div className={term.figures.length > 0 ? "la-explain has-figs" : "la-explain"}>
      {EXPLAIN_PARTS.map((part) => {
        const label = (
          <h2 id={`ex-${part}`} className="la-explain-label">
            {partLabel(part, term)}
          </h2>
        );
        const body = paragraphs[part].map((text, i) => (
          <p key={i} className="la-term-def term-desc">
            <Marked text={text} note={note} />
          </p>
        ));
        // 그림이 있는 부분만 글과 그림을 나란히 묶는다(넓은 화면은 글 옆 오른쪽, 좁은 화면은 글 아래). 그림이 없는 부분은 예전과 같은 모양
        const figure = part === "definition" ? undefined : term.figures.find((f) => f.part === part);
        return (
          <section key={part} className={`la-explain-part is-${part}${figure ? " has-figure" : ""}`} aria-labelledby={`ex-${part}`}>
            {figure ? (
              <>
                <div className="la-explain-text">
                  {label}
                  {body}
                </div>
                <Figure figure={figure} />
              </>
            ) : (
              <>
                {label}
                {body}
              </>
            )}
          </section>
        );
      })}
      <FootnoteList notes={term.footnotes} />
    </div>
  );
}
