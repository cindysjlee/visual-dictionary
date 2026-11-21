import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { stackStateAt } from "./stackState.ts";

const term = termSchema.parse(JSON.parse(readFileSync(new URL("../../../../../../content/terms/call-stack.json", import.meta.url), "utf8")));

describe("stackStateAt (콜 스택)", () => {
  it("재귀로 쌓인 프레임마다 n이 따로 있고, 반환 주소는 부른 쪽이 멈춘 줄이다", () => {
    const s = stackStateAt(term, null, 4);
    expect(s.frames.map((f) => f.call)).toEqual(["main()", "factorial(3)", "factorial(2)", "factorial(1)"]);
    expect(s.frames.map((f) => f.locals.find((l) => l.name === "n")?.value)).toEqual([undefined, "3", "2", "1"]);
    expect(s.frames[0]!.returnTo).toBeUndefined();
    expect(s.frames[1]!.returnTo).toEqual({ fn: "main", line: 7 });
    expect(s.frames[2]!.returnTo).toEqual({ fn: "factorial", line: 3 });
    expect(s.line).toBe(2);
  });

  it("pop하면 맨 위 프레임이 빠지고 반환값이 아래 프레임 칸으로 들어간다", () => {
    const s = stackStateAt(term, null, 5);
    expect(s.frames).toHaveLength(3);
    expect(s.lastReturn).toEqual({ value: "1", into: "계산", depth: 2 });
    expect(s.frames[2]!.locals.find((l) => l.name === "계산")?.value).toBe("2 × 1 = 2");
    expect(s.frames[1]!.locals.find((l) => l.name === "계산")?.value).toBe("3 × ▢");
  });

  it("끝나면 main만 남고 result = 6, 8행", () => {
    const s = stackStateAt(term, null, term.scenario.steps.length);
    expect(s.frames.map((f) => f.fn)).toEqual(["main"]);
    expect(s.frames[0]!.locals).toEqual([{ name: "result", value: "6" }]);
    expect(s.line).toBe(8);
    expect(s.lastReturn).toBeUndefined();
  });
});

describe("stackStateAt (스택 한도·고친 코드 판)", () => {
  const raw = JSON.parse(readFileSync(new URL("../../../../../../content/terms/call-stack.json", import.meta.url), "utf8"));
  const over = termSchema.parse({
    ...raw,
    scenario: {
      ...raw.scenario,
      stackLimit: 4,
      steps: [
        ...raw.scenario.steps.slice(0, 4),
        { action: "push", from: "factorial", to: "factorial", title: "factorial(0)", label: "factorial(0)", caption: "넘침", effects: [{ type: "overflow" }, { type: "stamp", label: "StackOverflowError" }] },
      ],
    },
    defenses: [{ name: "고침", kind: "solution", description: "고침", branchAtStep: 5, code: { lines: [...raw.scenario.code.lines.slice(0, -1), "} // 고친 코드"] }, steps: raw.scenario.steps.slice(4).map((s: { line?: number }) => ({ ...s, line: 1 })) }],
  });

  it("한도를 넘으면 overflowed와 도장, 그 전에는 없다", () => {
    expect(stackStateAt(over, null, 4).overflowed).toBe(false);
    expect(stackStateAt(over, null, 4).stamp).toBeUndefined();
    expect(stackStateAt(over, null, 5)).toMatchObject({ overflowed: true, stamp: { label: "StackOverflowError", tone: "attack" } });
    expect(stackStateAt(over, null, 5).frames).toHaveLength(5);
  });

  it("해결 방법은 처음부터 고친 코드 판을 보인다(기본 흐름은 원래 코드)", () => {
    expect(stackStateAt(over, null, 4).code).toEqual(over.scenario.code);
    expect(stackStateAt(over, 0, 0).code?.lines.at(-1)).toBe("} // 고친 코드");
    expect(stackStateAt(over, 0, 5).code?.lines.at(-1)).toBe("} // 고친 코드");
    expect(stackStateAt(over, 0, 5).overflowed).toBe(false);
  });
});
