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
