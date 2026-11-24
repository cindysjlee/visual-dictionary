import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "./index.ts";

const example = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../docs/examples/${name}.json`, import.meta.url), "utf8"));

const issuePaths = (data: unknown) => {
  const result = termSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe("termSchema", () => {
  it.each(["csrf", "call-stack", "deadlock"])("예시 %s.json을 통과시킨다", (name) => {
    expect(issuePaths(example(name))).toEqual([]);
  });

  it("기본값을 채운다", () => {
    const csrf = example("csrf");
    delete csrf.aliases;
    delete csrf.scenario.steps[0].danger;
    const term = termSchema.parse(csrf);
    expect(term.aliases).toEqual([]);
    expect(term.scenario.steps[0]?.danger).toBe(false);
  });

  const broken: [string, (t: any) => void, string][] = [
    ["필수 필드 누락", (t) => delete t.summary, "summary"],
    ["단계 제목 누락", (t) => delete t.scenario.steps[2].title, "scenario.steps.2.title"],
    ["허용되지 않은 카테고리", (t) => (t.category = "crypto"), "category"],
    ["잘못된 id 형식", (t) => (t.id = "CSRF Attack"), "id"],
    ["모르는 필드(오타)", (t) => (t.scenario.steps[0].dangr = true), "scenario.steps.0"],
    ["actors에 없는 to", (t) => (t.scenario.steps[4].to = "nobody"), "scenario.steps.4.to"],
    ["playerType에 맞지 않는 action", (t) => (t.scenario.steps[0].action = "push"), "scenario.steps.0.action"],
    ["단계 수를 넘는 blockedAtStep", (t) => (t.defenses[0].blockedAtStep = 7), "defenses.0.blockedAtStep"],
    ["blockedLabel 없음", (t) => delete t.defenses[1].blockedLabel, "defenses.1.blockedLabel"],
    ["references 비어 있음", (t) => (t.references = []), "references"],
  ];

  it.each(broken)("%s → 오류 위치를 알려준다", (_, mutate, path) => {
    const csrf = example("csrf");
    mutate(csrf);
    expect(issuePaths(csrf)).toContain(path);
  });

  describe("설명 틀(description 객체)", () => {
    const frame = () => ({
      definition: "서버가 대신 요청을 보내게 하는 공격이다.",
      analogy: ["안내 데스크에 쪽지를 내미는 일과 비슷하다."],
      how: ["서버에 주소를 받는 기능이 있다.", "공격자가 내부 주소를 적는다."],
      why: ["내부 서비스가 바깥에 열린다."],
    });
    const withFrame = (mutate: (f: any) => void = () => {}) => {
      const csrf = example("csrf");
      csrf.description = frame();
      mutate(csrf.description);
      return csrf;
    };

    it("네 부분이 모두 있으면 통과한다", () => {
      expect(issuePaths(withFrame())).toEqual([]);
      expect(issuePaths(example("csrf"))).toEqual([]);
    });

    it("방어 설명에는 각주 [[ ]]를 쓸 수 없다", () => {
      const t: any = example("csrf");
      t.defenses[0].description = "방어 설명에는 [[각주]]를 쓸 수 없다.";
      expect(issuePaths(t)).toContain("defenses.0.description");
    });

    it("문자열 한 문단(이전 형식)은 draft여도 쓸 수 없다(초안 자리 표시만 예외)", () => {
      const old: any = example("csrf");
      old.status = "draft";
      old.description = "한 문단짜리 옛 설명이다.";
      expect(issuePaths(old)).toContain("description");
    });

    it.each([
      ["정의 없음", (f: any) => delete f.definition, "description.definition"],
      ["비유 없음", (f: any) => (f.analogy = []), "description.analogy"],
      ["과정이 한 문단뿐", (f: any) => (f.how = ["하나뿐"]), "description.how"],
      ["이유 문단이 너무 많음", (f: any) => (f.why = ["1", "2", "3", "4"]), "description.why"],
      ["모르는 부분(오타)", (f: any) => (f.reason = ["x"]), "description"],
      ["정의가 두 문장", (f: any) => (f.definition = "첫 문장이다. 둘째 문장이다."), "description.definition"],
      ["정의가 너무 김", (f: any) => (f.definition = "가".repeat(91)), "description.definition"],
      ["과정 두 번째 문단에 형광펜 두 군데", (f: any) => (f.how[1] = "==하나== 그리고 ==둘=="), "description.how.1"],
    ])("%s → 오류 위치를 알려준다", (_, mutate, path) => {
      expect(issuePaths(withFrame(mutate))).toContain(path);
    });

    it("각주는 용어당 4개까지, 같은 단어는 한 번만", () => {
      expect(issuePaths(withFrame((f) => (f.how[0] = "[[가]] [[나]] [[다]] [[라]] [[마]]")))).toContain("description");
      expect(issuePaths(withFrame((f) => (f.how[0] = "[[가]] [[나]] [[다]] [[라]]")))).toEqual([]);
      expect(issuePaths(withFrame((f) => ((f.how[0] = "[[가]]"), (f.how[1] = "[[가]]"))))).toContain("description.how.1");
    });

    it("초안 자리 표시는 draft에만 둘 수 있다", () => {
      const csrf = example("csrf");
      csrf.description = "(설명 준비 중)";
      csrf.status = "draft";
      expect(issuePaths(csrf)).toEqual([]);
      csrf.status = "published";
      expect(issuePaths(csrf)).toContain("description");
    });
  });

  it("관련 용어에 자기 자신을 넣으면 오류", () => {
    const csrf = example("csrf");
    expect(issuePaths({ ...csrf, related: ["xss", "csrf"] })).toContain("related.1");
  });
});
