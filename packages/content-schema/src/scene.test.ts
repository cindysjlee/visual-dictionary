import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema, type Term } from "./index.ts";
import { blockTarget, defenseCounts, modeDefenses, hasPanel, passesGate, kindOf, lastStepIndex, stepView, zoneOf } from "./scene.ts";

const raw = () => JSON.parse(readFileSync(new URL("../../../content/terms/csrf.json", import.meta.url), "utf8"));
const csrf: Term = termSchema.parse(raw());
const TOKEN = 0;
const SAMESITE = 1;

const issuePaths = (mutate: (t: any) => void) => {
  const t = raw();
  mutate(t);
  const r = termSchema.safeParse(t);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("stepView", () => {
  it("attach로 쿠키가 붙으면 라벨에 + Cookie가 덧붙는다", () => {
    expect(stepView(csrf, null, 4).attachedLabel).toBe("POST /transfer + Cookie");
    expect(stepView(csrf, TOKEN, 4).attachedLabel).toBe("POST /transfer + Cookie");
  });

  it("SameSite 방어에서는 쿠키가 안 붙어 라벨이 그대로다", () => {
    const v = stepView(csrf, SAMESITE, 4);
    expect(v.attachedLabel).toBe("POST /transfer");
    expect(v).toMatchObject({ blocked: true, tone: "defense", blockedLabel: "401 · 로그인 필요", title: "쿠키 없는 요청 거부" });
  });

  it("방어 override가 제목·자막·효과를 바꾼다", () => {
    const v = stepView(csrf, TOKEN, 1);
    expect(v.title).toBe("세션 쿠키 + CSRF 토큰 발급");
    expect(v.effects.map((e) => e.type)).toEqual(["store", "give"]);
    expect(stepView(csrf, null, 1).effects.map((e) => e.type)).toEqual(["store"]);
  });

  it("6단계 응답은 함정 탭으로, 돈은 공격자에게", () => {
    const v = stepView(csrf, null, 5);
    expect([v.from, v.to]).toEqual(["bank", "evilTab"]);
    expect(v.effects[0]).toMatchObject({ type: "transfer", item: "coin", from: "bank", to: "attacker" });
  });

  it("마지막 단계와 고를 수 있는 방어", () => {
    expect(lastStepIndex(csrf, null)).toBe(5);
    expect(lastStepIndex(csrf, TOKEN)).toBe(4);
    expect(modeDefenses(csrf)).toEqual([TOKEN, SAMESITE]);
  });
});

describe("kind·zone 기본값", () => {
  it("parent의 zone을 물려받고, kind가 없으면 role에서 정한다", () => {
    const jar = csrf.scenario.actors.find((a) => a.id === "jar")!;
    expect(zoneOf(jar, csrf.scenario.actors)).toBe("client");
    expect(kindOf({ ...jar, kind: undefined, role: "server" })).toBe("server");
  });
});

describe("checkScene (검증기)", () => {
  it("CSRF는 오류가 없다", () => {
    expect(issuePaths(() => {})).toEqual([]);
  });

  it("보관함에 쿠키가 들어가기 전에 꺼내면 오류", () => {
    expect(issuePaths((t) => (t.scenario.steps[1].effects = []))).toContain(
      "scenario.steps.4.effects.0.from: 5단계에서 jar에 쿠키이(가) 없습니다",
    );
  });

  it("back이 없는 행위자를 뒤집으면 오류", () => {
    expect(issuePaths((t) => delete t.scenario.actors[2].back)).toContain(
      "scenario.steps.3.effects.1.target: 뒤집을 evilTab에 back 화면이 없습니다",
    );
  });

  it("없는 parent·없는 효과 대상은 오류", () => {
    const paths = issuePaths((t) => {
      t.scenario.actors[3].parent = "nowhere";
      t.scenario.steps[2].effects[0].target = "ghost";
    });
    expect(paths).toContain("scenario.actors.3.parent: actors에 없는 행위자: nowhere");
    expect(paths).toContain("scenario.steps.2.effects.0.target: actors에 없는 행위자: ghost");
  });

  it("차단 단계보다 뒤의 override는 오류", () => {
    expect(issuePaths((t) => (t.defenses[0].overrides[1].step = 6))).toContain(
      "defenses.0.overrides.1.step: override 단계 6가 범위(1~5)를 벗어납니다",
    );
  });

  it("봉투에 없는 물건을 가로채면 오류, tab이 아닌 곳에서 run하면 오류", () => {
    const paths = issuePaths((t) => {
      t.scenario.steps[0].effects = [
        { type: "give", item: "cookie", from: "packet", to: "attacker" },
        { type: "run", item: "script", target: "bank" },
      ];
    });
    expect(paths).toContain("scenario.steps.0.effects.0.from: 1단계 봉투에 쿠키이(가) 붙어 있지 않습니다");
    expect(paths).toContain("scenario.steps.0.effects.1.target: run은 tab에서만 실행됩니다: bank");
  });

  it("화면판이 없는 곳에 rewrite하면 오류(서버는 screen이 있어야 화면판이 생긴다)", () => {
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "rewrite", target: "evil", screen: { lines: ["x"] } }]))).toContain(
      "scenario.steps.0.effects.0.target: evil에는 화면판이 없습니다(탭, 또는 screen이 있는 server·database만)",
    );
    const withScreen = issuePaths((t) => {
      t.scenario.actors.find((a: any) => a.id === "evil").screen = { lines: ["대기"] };
      t.scenario.steps[0].effects = [{ type: "rewrite", target: "evil", screen: { lines: ["x"] } }];
    });
    expect(withScreen).toEqual([]);
    expect(hasPanel(csrf.scenario.actors.find((a) => a.id === "bankTab")!)).toBe(true);
    expect(hasPanel(csrf.scenario.actors.find((a) => a.id === "bank")!)).toBe(false);
  });

  it("inspect는 검문소가 있는 이 단계의 목적지에서만", () => {
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "inspect", at: "evil", checks: [{ name: "a", result: "b", status: "ok" }] }]))).toContain(
      "scenario.steps.0.effects.0.at: inspect.at은 이 단계의 목적지(bank)여야 합니다",
    );
    expect(issuePaths((t) => (t.scenario.steps[3].effects = [{ type: "inspect", at: "evil", checks: [{ name: "a", result: "b", status: "ok" }] }]))).toContain(
      "scenario.steps.3.effects.0.at: inspect는 검문소(gate)가 있는 목적지에서만 그려집니다: evil",
    );
  });

  it("검문소는 앞에서 오는 봉투만 지난다(사내망에서 오는 응답은 아님)", () => {
    const t = termSchema.parse({
      ...raw(),
      scenario: { ...raw().scenario, actors: [...raw().scenario.actors, { id: "meta", name: "내부", role: "server", zone: "internal" }] },
    });
    expect(passesGate(t, "bankTab", "bank")).toBe(true);
    expect(passesGate(t, "meta", "bank")).toBe(false);
    expect(passesGate(t, "bank", "bank")).toBe(false);
    expect(passesGate(t, "bankTab", "evil")).toBe(false);
  });

  it("차단 도장 위치: 검사한 곳 → 거부된 효과의 대상 → 목적지", () => {
    expect(blockTarget(stepView(csrf, TOKEN, 4))).toBe("bank");
    expect(blockTarget({ to: "bank", effects: [{ type: "run", item: "script", target: "evilTab", refused: true }] })).toBe("evilTab");
    expect(blockTarget({ to: "bank", effects: [{ type: "attach", item: "cookie", from: "jar", refused: true }] })).toBe("jar");
    expect(blockTarget({ to: "bank", effects: [{ type: "give", item: "cookie", from: "packet", to: "attacker", refused: true }] })).toBe("attacker");
    expect(blockTarget({ to: "bank", effects: [] })).toBe("bank");
  });

  it("알 수 없는 효과 type은 오류", () => {
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "explode", target: "bank" }])).length).toBeGreaterThan(0);
  });
});

describe("look", () => {
  const bankIndex = () => raw().scenario.actors.findIndex((a: { id: string }) => a.id === "bank");
  it("kind에 맞는 look은 통과한다", () => {
    expect(issuePaths((t) => (t.scenario.actors[bankIndex()].look = "bank"))).toEqual([]);
    expect(issuePaths((t) => (t.scenario.actors[bankIndex()].look = "database"))).toEqual([]);
  });
  it("kind에 안 맞는 look(서버에 wifi)과 없는 look은 빌드에서 거부된다", () => {
    expect(issuePaths((t) => (t.scenario.actors[bankIndex()].look = "wifi"))).toEqual([
      `scenario.actors.${bankIndex()}.look: look wifi은(는) network에만 쓸 수 있습니다(지금 kind: server)`,
    ]);
    expect(issuePaths((t) => (t.scenario.actors[bankIndex()].look = "castle")).length).toBe(1);
  });
});

describe("해결 방법(대체 흐름)과 스택·점유형 규칙", () => {
  const example = (name: string) => JSON.parse(readFileSync(new URL(`../../../docs/examples/${name}.json`, import.meta.url), "utf8"));
  const issuesOf = (name: string, mutate: (t: any) => void) => {
    const t = example(name);
    mutate(t);
    const r = termSchema.safeParse(t);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("해결 방법은 갈림 단계부터 대체 흐름 끝까지, 막히지 않는다", () => {
    const t = termSchema.parse(example("deadlock"));
    expect(modeDefenses(t)).toEqual([0]);
    expect(lastStepIndex(t, 0)).toBe(1 + 4 - 1);
    expect(stepView(t, 0, 1).title).toBe("B도 프린터부터 요청");
    expect(stepView(t, 0, 0).title).toBe(stepView(t, null, 0).title);
    expect(stepView(t, 0, 4).blocked).toBe(false);
    expect(defenseCounts(t)).toEqual({ defenseCount: 1, supportCount: 0 });
  });

  it("방어·해결 방법의 필드를 섞으면 거부한다", () => {
    expect(issuesOf("deadlock", (t) => (t.defenses[0].blockedAtStep = 2))).toContain(
      "defenses.0.blockedAtStep: 해결 방법은 멈추지 않습니다. blockedAtStep 대신 branchAtStep과 steps(대체 흐름)를 씁니다",
    );
    expect(issuesOf("deadlock", (t) => delete t.defenses[0].steps)).toContain("defenses.0.steps: branchAtStep과 steps는 함께 씁니다");
    expect(issuesOf("deadlock", (t) => (t.defenses[0].kind = "defense"))).toContain(
      "defenses.0.steps: branchAtStep·steps(대체 흐름)는 해결 방법(kind: solution)에만 씁니다",
    );
  });

  it("스택: 첫 push는 진입점, push·pop은 맨 위 함수 기준", () => {
    expect(issuesOf("call-stack", () => {})).toEqual([]);
    expect(issuesOf("call-stack", (t) => t.scenario.steps.shift())).toContain("scenario.steps.0.from: 첫 push는 진입점이라 from과 to가 같아야 합니다");
    expect(issuesOf("call-stack", (t) => (t.scenario.steps[3].from = "total"))).toContain("scenario.steps.3.from: pop은 맨 위 함수(price)가 돌아갑니다");
  });

  it("점유: 남이 잡은 자원은 acquire 대신 wait, 안 잡은 자원은 release할 수 없다", () => {
    expect(issuesOf("deadlock", (t) => (t.scenario.steps[2].action = "acquire"))).toContain(
      "scenario.steps.2.to: r2는 p2가 잡고 있어 acquire할 수 없습니다(wait를 쓰세요)",
    );
    expect(issuesOf("deadlock", (t) => (t.defenses[0].steps[2].from = "p2"))).toContain("defenses.0.steps.2.to: p2는 r1를 잡고 있지 않습니다");
  });

  it("플레이어에 없는 효과는 거부한다", () => {
    expect(issuesOf("deadlock", (t) => (t.scenario.steps[0].effects = [{ type: "store", item: "cookie", into: "r1" }]))[0]).toMatch(
      /^scenario\.steps\.0\.effects\.0\.type: lock 플레이어에서 쓸 수 없는 효과: store/,
    );
    expect(issuesOf("deadlock", (t) => (t.scenario.steps[3].effects = [{ type: "condition", name: "circular-wait" }, { type: "cycle" }]))).toEqual([]);
  });
});
