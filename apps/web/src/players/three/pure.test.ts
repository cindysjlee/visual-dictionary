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

  it("구역별 자동 배치: 브라우저 앞, 서버 뒤, 공격자 옆. 같은 줄의 둘째는 높이고 뒤로 물린다(엇갈림)", () => {
    expect(pos("browser")).toEqual([0, 0, 3]);
    expect(pos("bank")).toEqual([-6, 0, -5.6]);
    expect(pos("evil")).toEqual([6, 0.9, -7]);
    expect(pos("attacker")).toEqual([10.5, 0, 2.6]);
  });

  it("높인 행위자의 앵커·검문소도 같이 올라간다", () => {
    expect(placed.get("evil")!.anchor[1]).toBeCloseTo(0.9 + 1.5);
  });

  it("탭은 브라우저 안에 나란히, 보관함은 앞 가운데, 검문소는 서버 앞", () => {
    expect(pos("bankTab")[0]).toBe(-1.45);
    expect(pos("evilTab")[0]).toBe(1.45);
    pos("jar").forEach((v, i) => expect(v).toBeCloseTo([0, 0.25, 3.85][i]!));
    placed.get("bank")!.gate!.position.forEach((v, i) => expect(v).toBeCloseTo([-6, 0, -3.4][i]!));
    expect(placed.get("evil")!.gate).toBeUndefined();
  });

  it("모든 행위자가 배치된다", () => {
    expect([...placed.keys()].sort()).toEqual(csrf.scenario.actors.map((a) => a.id).sort());
  });

  it("between(길목)은 사용자와 서버 사이, 있으면 서버·사내망 줄이 뒤로 물러난다. 자식은 부모 구역을 따른다", () => {
    const actors = termSchema.parse({
      ...csrf,
      scenario: {
        ...csrf.scenario,
        actors: [
          ...csrf.scenario.actors,
          { id: "wifi", name: "공용 와이파이", role: "network", kind: "network", zone: "between" },
          { id: "db", name: "DB", role: "database", kind: "database", zone: "internal" },
        ],
      },
    }).scenario.actors;
    const p = layoutScene(actors);
    expect(p.get("wifi")!.position).toEqual([4.5, 0, -1.8]);
    expect(p.get("db")!.position[0]).toBe(3.5); // 사내망에 하나뿐이면 오른쪽으로 비켜 선다
    expect(p.get("bank")!.position[2]).toBeCloseTo(-8.6);
    expect(p.get("db")!.position[2]).toBeCloseTo(-14.5);
    expect(p.get("jar")!.zone).toBe("client");
  });

  it("빈 구역은 자리를 만들지 않는다(DF-09: spread(0)이 위치 하나를 돌려주면 없는 행위자를 배치하려다 실패)", () => {
    // 서버·바깥만 있고 사용자·길목·사내망 구역은 비어 있다
    const actors = csrf.scenario.actors.filter((a) => a.id === "bank" || a.id === "attacker");
    const p = layoutScene(actors);
    expect([...p.keys()].sort()).toEqual(["attacker", "bank"]);
    for (const { position } of p.values()) expect(position.every(Number.isFinite)).toBe(true);
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

describe("흐름형 어휘의 결과 상태와 배치", () => {
  const term = termSchema.parse({
    ...csrf,
    scenario: {
      ...csrf.scenario,
      actors: [
        ...csrf.scenario.actors.map((a) => (a.id === "bank" ? { ...a, slots: { label: "대기열", size: 3 } } : a)),
        { id: "bankFrame", name: "은행 화면", role: "server", kind: "frame", parent: "evilTab" },
      ],
      steps: csrf.scenario.steps.map((s, i) =>
        i === 0 ? { ...s, effects: [{ type: "occupy", target: "bank", count: 2 }, { type: "opacity", target: "bankFrame", value: 0.05 }] } : i === 1 ? { ...s, effects: [...s.effects, { type: "vacate", target: "bank" }] } : s,
      ),
    },
  });

  it("칸 수와 겹친 화면의 투명도가 단계를 따라 바뀐다", () => {
    expect(sceneStateAt(term, null, 0).occupied.get("bank")).toBeUndefined();
    expect(sceneStateAt(term, null, 1).occupied.get("bank")).toBe(2);
    expect(sceneStateAt(term, null, 1).opacity.get("bankFrame")).toBe(0.05);
    expect(sceneStateAt(term, null, 2).occupied.get("bank")).toBe(1);
  });

  it("겹친 화면은 부모 탭 바로 앞(탭의 자식의 자식도 배치된다)", () => {
    const p = layoutScene(term.scenario.actors);
    const tab = p.get("evilTab")!.position;
    const frame = p.get("bankFrame")!;
    expect(frame.parent).toBe("evilTab");
    expect(frame.position[0]).toBe(tab[0]);
    expect(frame.position[2]).toBeCloseTo(tab[2] + 0.35);
  });
});
