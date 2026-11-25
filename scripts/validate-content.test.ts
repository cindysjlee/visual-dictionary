import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { DRAFT_DESCRIPTION } from "@app/content-schema/explain";
import { loadTerms } from "./validate-content.ts";
import { selectTerms, toIndexEntry, withFootnotes } from "./build-index.ts";

const csrfPath = new URL("../content/terms/csrf.json", import.meta.url);
const tempDir = () => mkdtempSync(join(tmpdir(), "terms-"));

describe("loadTerms", () => {
  it("실제 content/terms는 오류가 없다", () => {
    expect(loadTerms().errors).toEqual([]);
  });

  it("파일명과 id가 다르면 오류", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "xsrf.json"));
    expect(loadTerms(dir).errors).toEqual([`xsrf.json: id - 파일명과 id("csrf")가 다릅니다`]);
  });

  it("오류 위치를 파일명.경로 형식으로 출력하고, BOM은 허용한다", () => {
    const dir = tempDir();
    const csrf = JSON.parse(readFileSync(csrfPath, "utf8"));
    csrf.scenario.steps[4].to = "nobody";
    writeFileSync(join(dir, "csrf.json"), "﻿" + JSON.stringify(csrf));
    expect(loadTerms(dir).errors).toEqual(["csrf.json: scenario.steps[4].to - actors에 없는 행위자: nobody"]);
  });

  it("공개했던 id의 파일이 없으면(이름 변경·삭제) 오류, retired로 남기면 통과 (FR-CNT-05)", () => {
    const dir = tempDir();
    const csrf = JSON.parse(readFileSync(csrfPath, "utf8"));
    writeFileSync(join(dir, "xsrf.json"), JSON.stringify({ ...csrf, id: "xsrf" }));
    expect(loadTerms(dir, ["csrf", "xsrf"]).errors).toEqual([
      `published-ids.json: "csrf" - 공개했던 용어의 파일이 없습니다. id는 바꾸지 말고, 내리려면 status를 retired로 두세요`,
    ]);
    writeFileSync(join(dir, "csrf.json"), JSON.stringify({ ...csrf, status: "retired" }));
    expect(loadTerms(dir, ["csrf", "xsrf"]).errors).toEqual([]);
  });

  it("published 용어가 공개 id 목록에 없으면 오류", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "csrf.json"));
    expect(loadTerms(dir, []).errors).toEqual([`csrf.json: id - 공개하는 용어는 content/published-ids.json에 "csrf"를 추가하세요(한 번 넣으면 지우지 않음)`]);
  });

  it("없는 related는 경고만 낸다", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "csrf.json"));
    const { errors, warnings } = loadTerms(dir);
    expect(errors).toEqual([]);
    expect(warnings).toContain("csrf.json: related[0] - 없는 용어 id: xss");
  });
});

describe("그림(figures) 파일", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect class="k-box" x="1" y="1" width="10" height="10"/></svg>';
  const fig = { part: "how", id: "fig-a", alt: "그림을 말로 설명한다", caption: "캡션이다." };
  /** 그림이 하나인 csrf와 그림 폴더를 만든다 */
  const setup = (svgFiles: Record<string, string>, mutate: (terms: Record<string, any>) => void = () => {}) => {
    const dir = tempDir();
    const figuresDir = tempDir();
    const terms = { csrf: { ...JSON.parse(readFileSync(csrfPath, "utf8")), figures: [fig] } as any };
    mutate(terms);
    for (const [id, term] of Object.entries(terms)) writeFileSync(join(dir, `${id}.json`), JSON.stringify(term));
    for (const [name, text] of Object.entries(svgFiles)) writeFileSync(join(figuresDir, `${name}.svg`), text);
    return () => loadTerms(dir, undefined, undefined, figuresDir).errors;
  };

  it("파일이 있고 규칙을 지키면 통과", () => {
    expect(setup({ "fig-a": SVG })()).toEqual([]);
  });

  it("그림 파일이 없으면 오류", () => {
    expect(setup({})()).toEqual(["csrf.json: figures[0].id - 그림 파일이 없습니다: content/figures/fig-a.svg"]);
  });

  it("어떤 용어도 쓰지 않는 그림 파일은 오류(풀이 사전의 안 쓰는 항목과 같은 규칙)", () => {
    expect(setup({ "fig-a": SVG, "fig-b": SVG })()).toEqual(["fig-b.svg: 어떤 용어의 figures에서도 쓰이지 않는 그림 파일입니다(쓰지 않는 파일은 지웁니다)"]);
  });

  it("SVG 규칙을 어기면 파일명과 이유를 알려 준다(스크립트·색 하드코딩)", () => {
    const errors = setup({ "fig-a": SVG.replace("<rect", '<script/><rect fill="red"') })();
    expect(errors).toContain("fig-a.svg: 쓸 수 없는 요소: <script>");
    expect(errors.some((e) => e.startsWith("fig-a.svg: fill=\"red\""))).toBe(true);
  });

  it("그림 하나를 두 용어가 쓰면 오류(그림 하나는 용어 하나만)", () => {
    const errors = setup({ "fig-a": SVG }, (terms) => {
      terms.xsrf = { ...terms.csrf, id: "xsrf" };
    })();
    expect(errors).toEqual(['xsrf.json: figures[0].id - 그림 "fig-a"는 이미 csrf.json에서 씁니다(그림 하나는 용어 하나만)']);
  });
});
describe("각주 풀이 사전(glossary.json)", () => {
  /** 각주가 둘인 용어(a: [[가]] [[나]])와 임시 풀이 사전 파일을 만든다 */
  const setup = (entries: unknown, mutate: (term: any) => void = () => {}) => {
    const dir = tempDir();
    const csrf = JSON.parse(readFileSync(csrfPath, "utf8"));
    csrf.description = {
      definition: "정의 [[가]]다.",
      analogy: ["비유다."],
      how: ["과정 [[나]]이다.", "둘째다."],
      why: ["이유다."],
    };
    mutate(csrf);
    writeFileSync(join(dir, "csrf.json"), JSON.stringify(csrf));
    // 풀이 사전은 용어 폴더 밖에 둔다(loadTerms는 폴더의 모든 json을 용어로 읽는다). 실제도 content/glossary.json은 content/terms/ 밖이다
    const glossary = join(tempDir(), "glossary.json");
    writeFileSync(glossary, JSON.stringify(entries));
    return { dir, glossary };
  };
  const ga = { word: "가", gloss: "가의 풀이다." };
  const na = { word: "나", gloss: "나의 풀이다." };
  const both = [ga, na];
  const errorsOf = ({ dir, glossary }: { dir: string; glossary: string }) => loadTerms(dir, undefined, glossary).errors;

  it("각주 단어와 사전이 짝이 맞으면 통과한다", () => {
    expect(errorsOf(setup(both))).toEqual([]);
  });

  it("사전에 없는 각주 단어는 오류", () => {
    expect(errorsOf(setup([ga]))).toEqual([`csrf.json: description - 각주 단어 "나"가 glossary.json에 없습니다`]);
  });

  it("어느 용어에서도 안 쓰이는 사전 항목은 오류", () => {
    expect(errorsOf(setup([...both, { word: "다", gloss: "안 쓰인다." }]))).toEqual([
      `glossary.json: [2].word - "다"는 어떤 용어의 설명에서도 쓰이지 않습니다(쓰지 않는 항목은 지웁니다)`,
    ]);
  });

  it("없는 용어를 가리키는 term, 자기 자신을 가리키는 각주는 오류", () => {
    expect(errorsOf(setup([{ ...ga, term: "nothing" }, na]))).toEqual([`glossary.json: [0].term - 없는 용어 id: nothing`]);
    expect(errorsOf(setup([{ ...ga, term: "csrf" }, na]))).toEqual([`csrf.json: description - 각주 "가"가 이 용어 자신을 가리킵니다(자기 쪽으로 가는 링크)`]);
  });

  it("사전 형식 오류: 중복 단어, 긴 풀이, 3문장 이상, 형광펜", () => {
    expect(errorsOf(setup([...both, { word: "가", gloss: "또 가다." }]))).toContain("glossary.json: [2].word - 중복된 단어: 가");
    const long = errorsOf(setup([{ word: "가", gloss: "가".repeat(121) }, na]));
    expect(long.join("\n")).toContain("120자 이하");
    expect(errorsOf(setup([{ word: "가", gloss: "하나다. 둘이다. 셋이다." }, na])).join("\n")).toContain("1~2문장");
    expect(errorsOf(setup([{ word: "가", gloss: "==형광펜== 풀이다." }, na])).join("\n")).toContain("`코드` 표기만");
  });

  it("긴 문장은 경고만 낸다", () => {
    const longSentence = "가".repeat(75) + "다.";
    const { dir, glossary } = setup(both, (term) => (term.description.how[1] = longSentence));
    const { errors, warnings } = loadTerms(dir, undefined, glossary);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.startsWith("csrf.json: description.how[1] - 70자가 넘는 문장"))).toBe(true);
  });

  it("빌드는 각주를 나온 순서대로 넣고, 그 용어가 함께 나갈 때만 링크한다", () => {
    const entries = [{ ...ga, term: "xss" }, na];
    const { dir, glossary } = setup(entries);
    const term = loadTerms(dir, undefined, glossary).terms[0]!;
    expect(withFootnotes(term, entries, [{ id: "xss", name: "XSS" }]).footnotes).toEqual([
      { word: "가", gloss: "가의 풀이다.", link: { id: "xss", name: "XSS" } },
      { word: "나", gloss: "나의 풀이다." },
    ]);
    // 그 용어가 아직 공개 전(함께 나가지 않음)이면 링크 없이 풀이만
    expect(withFootnotes(term, entries, []).footnotes[0]).toEqual({ word: "가", gloss: "가의 풀이다." });
    // 초안 자리 표시(문자열)에는 각주가 없다
    expect(withFootnotes({ ...term, description: DRAFT_DESCRIPTION }, entries, []).footnotes).toEqual([]);
  });
});

describe("selectTerms", () => {
  const base = termSchema.parse(JSON.parse(readFileSync(csrfPath, "utf8")));
  const terms = (["published", "draft", "retired"] as const).map((status) => ({ ...base, id: status, status }));

  it("배포 빌드는 published만", () => {
    expect(selectTerms(terms, false).map((t) => t.id)).toEqual(["published"]);
  });

  it("개발 서버는 draft까지, retired는 항상 제외", () => {
    expect(selectTerms(terms, true).map((t) => t.id)).toEqual(["published", "draft"]);
  });

  it("index 항목에 단계 수와 방어 수가 들어간다", () => {
    expect(toIndexEntry(base)).toMatchObject({ id: "csrf", playerType: "flow", stepCount: 6, defenseCount: 2, supportCount: 0, related: base.related });
    const withSupport = { ...base, defenses: [...base.defenses, { ...base.defenses[0]!, name: "보조", blockedAtStep: undefined }] };
    expect(toIndexEntry(withSupport)).toMatchObject({ defenseCount: 2, supportCount: 1 });
  });

  it("index 항목에 위험 시작 단계와 차단 단계(중복 없이)가 들어간다", () => {
    // CSRF 예시: 3단계부터 위험, 방어 둘 다 5단계에서 차단
    expect(toIndexEntry(base)).toMatchObject({ dangerFrom: 3, blockedAt: [5] });
    const safe = { ...base, scenario: { ...base.scenario, steps: base.scenario.steps.map((s) => ({ ...s, danger: false })) }, defenses: [] };
    expect(toIndexEntry(safe)).toMatchObject({ dangerFrom: null, blockedAt: [] });
  });
});
