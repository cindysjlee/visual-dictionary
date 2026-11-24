import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { DRAFT_DESCRIPTION } from "@app/content-schema/explain";
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

describe("lockStateAt (공유 값)", () => {
  const st = (action: string, from: string, effects: unknown[] = []) => ({ action, from, to: "balance", title: "t", label: "l", caption: "c", effects });
  const race = termSchema.parse({
    id: "race-test",
    name: "경쟁",
    category: "os",
    summary: "s",
    description: DRAFT_DESCRIPTION,
    status: "draft",
    scenario: {
      playerType: "lock",
      actors: [
        { id: "a", name: "A", role: "process" },
        { id: "b", name: "B", role: "process" },
        { id: "balance", name: "잔액", role: "resource", look: "memory", value: "100" },
      ],
      steps: [
        st("access", "a", [{ type: "read", value: "100" }]),
        st("access", "b", [{ type: "read", value: "100" }]),
        st("access", "a", [{ type: "write", value: "150", note: "100 + 50" }]),
        st("access", "b", [{ type: "write", value: "150" }]),
        st("acquire", "a"),
        st("release", "a"),
      ],
    },
    references: [{ title: "r", url: "https://example.com" }],
  });

  it("두 스레드가 같은 값을 읽고, 쓰면 값판이 바뀌며 손의 메모는 쓴 값이 된다", () => {
    expect(lockStateAt(race, null, 0).values.get("balance")).toBe("100");
    const read = lockStateAt(race, null, 2);
    expect([read.memos.get("a"), read.memos.get("b")]).toEqual([{ kind: "read", value: "100" }, { kind: "read", value: "100" }]);
    const lost = lockStateAt(race, null, 4);
    expect(lost.values.get("balance")).toBe("150");
    expect(lost.memos.get("a")).toEqual({ kind: "write", value: "150", note: "100 + 50" });
  });

  it("access는 자물쇠를 잠그지 않고, 내려놓으면 메모를 치운다", () => {
    expect(lockStateAt(race, null, 4).owner.size).toBe(0);
    expect(lockStateAt(race, null, 6).memos.has("a")).toBe(false);
  });
});
