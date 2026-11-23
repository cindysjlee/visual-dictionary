// 본문 표시 문법(docs/04 "본문 표시"): ==문장== = 형광펜 밑줄, `코드` = 고정폭 코드 표기. 그 밖의 문법(HTML 태그·**·[..](..))은 쓰지 않는다.
// HTML로 넣지 않고 조각으로 나눠 React 요소로 그린다(XSS 없음). 검증기(스키마)와 화면이 같은 파서를 쓴다
export type MarkSegment = { kind: "text" | "mark" | "code"; text: string };

/** 본문을 조각으로 나눈다. 짝이 안 맞거나 허용하지 않는 문법이면 error */
export function parseMarks(source: string): { segments: MarkSegment[]; error?: string } {
  const segments: MarkSegment[] = [];
  let buf = "";
  let inMark = false;
  const flush = (kind: MarkSegment["kind"]) => {
    if (buf) segments.push({ kind, text: buf });
    buf = "";
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "`") {
      const end = source.indexOf("`", i + 1);
      if (end < 0) return { segments, error: "닫히지 않은 코드 표기(`)" };
      if (end === i + 1) return { segments, error: "빈 코드 표기(``)" };
      if (inMark) return { segments, error: "형광펜(==) 안에는 코드 표기(`)를 쓸 수 없습니다" };
      flush("text");
      segments.push({ kind: "code", text: source.slice(i + 1, end) });
      i = end;
      continue;
    }
    if (ch === "=" && source[i + 1] === "=") {
      if (inMark && !buf.trim()) return { segments, error: "빈 형광펜(====)" };
      flush(inMark ? "mark" : "text");
      inMark = !inMark;
      i++;
      continue;
    }
    const rest = source.slice(i);
    if (/^<[A-Za-z/!]/.test(rest)) return { segments, error: "HTML 태그는 쓸 수 없습니다(본문 표시는 ==형광펜==, `코드`만)" };
    if (rest.startsWith("**") || rest.startsWith("__") || /^\]\(/.test(rest)) return { segments, error: "허용하지 않는 표시 문법입니다(==형광펜==, `코드`만)" };
    buf += ch;
  }
  if (inMark) return { segments, error: "닫히지 않은 형광펜(==)" };
  flush("text");
  return { segments };
}

/** 표시를 뺀 글자만(검색·비교·화면 읽기용) */
export const plainText = (source: string) =>
  parseMarks(source)
    .segments.map((s) => s.text)
    .join("");

/** 한 문단의 형광펜 수 */
export const markCount = (source: string) => parseMarks(source).segments.filter((s) => s.kind === "mark").length;
