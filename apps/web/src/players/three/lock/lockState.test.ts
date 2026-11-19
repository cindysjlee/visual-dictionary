import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { lockStateAt } from "./lockState.ts";

const term = termSchema.parse(JSON.parse(readFileSync(new URL("../../../../../../content/terms/deadlock.json", import.meta.url), "utf8")));
const ORDER = 0;
const TIMEOUT = 1;

describe("lockStateAt (데드락)", () => {
  it("기본 흐름: 서로 쥔 채 상대를 기다리는 고리, 네 조건 모두 성립, 마지막에 교착 도장", () => {
    const s = lockStateAt(term, null, 5);
    expect([...s.owner]).toEqual([["printer", "a"], ["scanner", "b"]]);
    expect([...s.waiting]).toEqual([["a", "scanner"], ["b", "printer"]]);
    expect(s.cycle).toBe(true);
    expect([...s.conditions.values()]).toEqual(["met", "met", "met", "met"]);
    expect(s.stamp).toEqual({ label: "교착 상태", tone: "attack" });
    expect(lockStateAt(term, null, 4).stamp).toBeUndefined();
  });

  it("획득 순서 고정: B는 빈손으로 기다리고(순환 대기 깨짐), 끝에는 B가 둘 다 쥔다", () => {
    const at2 = lockStateAt(term, ORDER, 2);
    expect([...at2.owner]).toEqual([["printer", "a"]]);
    expect(at2.waiting.get("b")).toBe("printer");
    expect(at2.conditions.get("circular-wait")).toBe("broken");
    const end = lockStateAt(term, ORDER, 99);
    expect([...end.owner].sort()).toEqual([["printer", "b"], ["scanner", "b"]]);
    expect(end.waiting.size).toBe(0);
    expect(end.stamp?.tone).toBe("defense");
  });

  it("타임아웃: B가 포기하며 스캐너를 내려놓아 점유 대기가 깨지고 고리가 사라진다", () => {
    const s = lockStateAt(term, TIMEOUT, 5);
    expect(s.owner.has("scanner")).toBe(false);
    expect(s.waiting.has("b")).toBe(false);
    expect(s.cycle).toBe(false);
    expect(s.conditions.get("hold-and-wait")).toBe("broken");
  });
});
