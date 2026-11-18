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
});
