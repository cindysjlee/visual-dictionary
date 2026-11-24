// 설명의 각주(docs/04 "각주", docs/05 "설명 틀과 각주"): 풀이가 있는 단어에 점선 밑줄(사전 느낌). 단어 전체가 풀이 상자의 트리거다.
// 풀이 상자는 마우스를 올리거나, 단어에 키보드 포커스가 오거나, 단어를 누르면 열린다(Esc로 닫는다, WCAG 1.4.13: 닫을 수 있고, 상자 위로 포인터를 옮겨도 유지되고, 사라지지 않는다).
// 그 단어의 용어가 공개돼 있으면(Footnote.link) 풀이 상자 대신 그 용어 쪽으로 가는 링크가 되고, 실선 밑줄로 풀이 단어와 겉모양이 다르다(색만으로 구분하지 않는다).
// 설명 아래 각주 목록은 번호 없이 단어 이름으로 보이고, ↩로 본문의 그 단어에 돌아온다. 번호(n)는 화면에 보이지 않는 연결용 id다
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Footnote } from "@app/content-schema";
import { Marked } from "../dictionary/Marked.tsx";

/** 이동한 곳이 포커스를 받을 수 있게(키보드·화면 읽기 사용자가 도착한 자리에서 이어 읽도록) */
const focusAfterJump = (id: string) => () => requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));

/** 풀이가 있는 단어: 점선 밑줄 + 풀이 상자. 화면 읽기 이름은 "단어, 풀이 보기" */
export function FootnoteWord({ n, word, note }: { n: number; word: string; note: Footnote }) {
  const root = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false); // 눌러서 연 것(터치·포커스를 안 받는 브라우저)
  const [dismissed, setDismissed] = useState(false); // Esc로 닫음: 포인터·포커스가 떠나거나 다시 누를 때까지
  const [shift, setShift] = useState(0);
  const open = !dismissed && (hover || focus || pinned);

  // 눌러서 열었을 때 바깥을 누르면 닫는다
  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned]);

  // 상자가 화면 가장자리를 넘지 않게 가로로 민다
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const el = box.current;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const margin = 12;
    const vw = document.documentElement.clientWidth;
    const dx = r.right > vw - margin ? vw - margin - r.right : r.left < margin ? margin - r.left : 0;
    setShift(dx);
  }, [open]);

  return (
    <span
      ref={root}
      className="la-fn"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(true);
        setDismissed(false);
      }}
      onPointerLeave={() => {
        setHover(false);
        setDismissed(false);
      }}
      onFocus={() => {
        setFocus(true);
        setDismissed(false);
      }}
      onBlur={(e) => {
        if (root.current?.contains(e.relatedTarget as Node | null)) return;
        setFocus(false);
        setPinned(false);
        setDismissed(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setDismissed(true);
          setPinned(false);
          e.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        id={`fnref-${n}`}
        className="la-fn-word"
        aria-label={`${word}, 풀이 보기`}
        aria-describedby={`fnbox-${n}`}
        aria-expanded={open}
        onClick={() => {
          setPinned((p) => !p);
          setDismissed(false);
        }}
      >
        {word}
      </button>
      <span ref={box} id={`fnbox-${n}`} className="la-fn-box" hidden={!open} style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
        <span className="la-fn-text">
          <Marked text={note.gloss} />
        </span>
        <a href={`#fn-${n}`} className="la-fn-jump" onClick={focusAfterJump(`fn-${n}`)}>
          각주 목록에서 보기 ↓
        </a>
      </span>
    </span>
  );
}

/** 공개된 용어의 이름인 단어: 풀이 상자 대신 그 용어 쪽으로 가는 링크(실선 밑줄). 화면 읽기 이름은 "단어, 용어 쪽으로 이동" */
export function FootnoteLink({ n, word, note }: { n: number; word: string; note: Footnote }) {
  if (!note.link) return <>{word}</>;
  return (
    <Link to={`/terms/${note.link.id}`} id={`fnref-${n}`} className="la-fn-link" aria-label={`${word}, 용어 쪽으로 이동`}>
      {word}
    </Link>
  );
}

/** 목록·상자에서 쓰는 풀이 내용: 풀이(또는 용어 링크) */
function NoteBody({ note }: { note: Footnote }) {
  return note.link ? (
    <Link to={`/terms/${note.link.id}`} className="la-fn-term">
      {note.link.name} 용어 쪽에서 자세히 보기 →
    </Link>
  ) : (
    <Marked text={note.gloss} />
  );
}

/** 설명 아래의 각주 목록: 단어 이름으로 보이고, 항목마다 본문의 그 단어로 돌아가는 링크(↩) */
export function FootnoteList({ notes }: { notes: Footnote[] }) {
  if (notes.length === 0) return null;
  return (
    <aside className="la-footnotes" aria-labelledby="la-fn-h">
      <h2 id="la-fn-h" className="la-explain-label">
        각주
      </h2>
      <ul>
        {notes.map((note, i) => (
          <li key={note.word} id={`fn-${i + 1}`} tabIndex={-1}>
            <b className="la-fn-list-word">{note.word}</b>
            <span className="la-fn-list-text">
              <NoteBody note={note} />
            </span>{" "}
            <a href={`#fnref-${i + 1}`} className="la-fn-back" aria-label={`본문의 ${note.word}(으)로 돌아가기`} onClick={focusAfterJump(`fnref-${i + 1}`)}>
              ↩
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
