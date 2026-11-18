import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { layoutScene } from "./layout.ts";
import { sceneStateAt } from "./sceneState.ts";
import { Timeline, linear } from "./timeline.ts";

const csrf = termSchema.parse(JSON.parse(readFileSync(new URL("../../../../../content/terms/csrf.json", import.meta.url), "utf8")));
const TOKEN = 0;
const SAMESITE = 1;

describe("layoutScene", () => {
  const placed = layoutScene(csrf.scenario.actors);
  const pos = (id: string) => placed.get(id)!.position;

  it("구역별 자동 배치: 브라우저 앞, 서버 뒤, 공격자 옆", () => {
    expect(pos("browser")).toEqual([0, 0, 2.2]);
    expect(pos("bank")).toEqual([-5, 0, -4.2]);
    expect(pos("evil")).toEqual([5, 0, -4.2]);
    expect(pos("attacker")).toEqual([8.6, 0, 1.6]);
  });

  it("탭은 브라우저 안에 나란히, 보관함은 앞 가운데, 검문소는 서버 앞", () => {
    expect(pos("bankTab")[0]).toBe(-1.45);
    expect(pos("evilTab")[0]).toBe(1.45);
    pos("jar").forEach((v, i) => expect(v).toBeCloseTo([0, 0.25, 3.05][i]!));
    expect(placed.get("bank")!.gate!.position).toEqual([-5, 0, -2]);
    expect(placed.get("evil")!.gate).toBeUndefined();
  });

  it("모든 행위자가 배치된다", () => {
    expect([...placed.keys()].sort()).toEqual(csrf.scenario.actors.map((a) => a.id).sort());
  });
});

describe("sceneStateAt", () => {
  it("3단계 전에는 함정 탭이 없고, 쿠키는 보관함에 있다", () => {
    const s = sceneStateAt(csrf, null, 2);
    expect(s.hidden.has("evilTab")).toBe(true);
    expect(s.holdings.get("jar")?.has("cookie")).toBe(true);
  });

  it("5단계 전에는 함정 탭이 나타나 뒤집혀 있고 화면 글자가 바뀌어 있다", () => {
    const s = sceneStateAt(csrf, null, 4);
    expect(s.hidden.has("evilTab")).toBe(false);
    expect(s.flipped.has("evilTab")).toBe(true);
    expect(s.screens.get("evilTab")?.front?.title).toBe("이벤트 당첨!");
  });

  it("CSRF 토큰 방어에서만 은행 탭에 토큰이 있다, SameSite는 쿠키 표시가 붙는다", () => {
    expect(sceneStateAt(csrf, TOKEN, 2).holdings.get("bankTab")?.has("token")).toBe(true);
    expect(sceneStateAt(csrf, null, 2).holdings.get("bankTab")?.has("token")).toBeFalsy();
    expect(sceneStateAt(csrf, SAMESITE, 2).holdings.get("jar")?.get("cookie")).toBe("SameSite=Lax");
  });

  it("끝까지 가면 잔액이 줄고 공격자가 받은 돈이 생긴다, 봉투의 쿠키는 함정 탭 → 은행으로 배달", () => {
    const s = sceneStateAt(csrf, null, 6);
    expect(s.balances.get("bank")).toBe(250000);
    expect(s.gained.get("attacker")).toBe(1000000);
    expect(s.holdings.get("bank")?.has("cookie")).toBe(true);
  });

  it("SameSite 방어에서는 쿠키가 붙지 않아 은행에 배달되지 않는다", () => {
    expect(sceneStateAt(csrf, SAMESITE, 5).holdings.get("bank")?.has("cookie")).toBeFalsy();
  });
});

describe("Timeline", () => {
  it("순차·동시·호출을 시간 순서대로 적용하고 끝 값을 남긴다", () => {
    const log: string[] = [];
    let a = 0;
    let b = 0;
    const tl = new Timeline()
      .tween(100, (t) => (a = t), linear)
      .with(50, (t) => (b = t), linear)
      .call(() => log.push(`call a=${a}`))
      .wait(20)
      .call(() => log.push("end"));
    expect(tl.duration).toBe(120);
    tl.advance(50);
    expect([a, b]).toEqual([0.5, 1]);
    expect(tl.advance(60)).toBe(false);
    expect(log).toEqual(["call a=1"]);
    expect(tl.advance(10)).toBe(true);
    expect(log).toEqual(["call a=1", "end"]);
  });

  it("finish는 남은 항목을 즉시 끝 상태로 만든다", () => {
    let x = 0;
    const tl = new Timeline().tween(1000, (t) => (x = t)).call(() => (x = 42));
    expect(tl.finish()).toBe(true);
    expect(x).toBe(42);
  });

  it("길이 0인 항목(동작 줄이기)도 한 번에 끝난다", () => {
    let x = 0;
    expect(new Timeline().tween(0, (t) => (x = t)).advance(0)).toBe(true);
    expect(x).toBe(1);
  });
});
