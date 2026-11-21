import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema, type Term } from "./index.ts";
import { blockTarget, codeAt, defenseCounts, modeDefenses, hasPanel, passesGate, kindOf, lastStepIndex, stepView, zoneOf } from "./scene.ts";

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
    expect(issuePaths((t) => (t.scenario.actors.find((a: any) => a.id === "bank").mirrorScreen = true)).join("\n")).toContain(
      "bank에는 화면판이 없어 mirrorScreen을 쓸 수 없습니다",
    );
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

describe("흐름형 어휘: 칸(slots)·여러 개 보내기(burst)·겹친 화면(frame)", () => {
  // CSRF 은행에 칸 3개를 두고 5단계(위조 송금)에서 채운다
  const withSlots = (effects: unknown[], size = 3) => (t: any) => {
    t.scenario.actors.find((a: any) => a.id === "bank").slots = { label: "대기열", size };
    t.scenario.steps[0].effects = effects;
  };

  it("칸은 server·database에만, occupy·vacate는 칸이 있는 곳에만", () => {
    expect(issuePaths((t) => (t.scenario.actors[0].slots = { label: "대기열", size: 2 }))).toEqual(["scenario.actors.0.slots: 칸(slots)은 server·database에만 둘 수 있습니다(지금 kind: browser)"]);
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "occupy", target: "evil" }]))).toEqual(["scenario.steps.0.effects.0.target: evil에는 칸(slots)이 없습니다"]);
    expect(issuePaths(withSlots([{ type: "occupy", target: "bank", count: 3 }, { type: "vacate", target: "bank", count: 1 }]))).toEqual([]);
  });

  it("칸 개수를 넘게 채우거나, 빈 칸이 있는데 거절하거나, 찬 것보다 많이 비우면 오류", () => {
    expect(issuePaths(withSlots([{ type: "occupy", target: "bank", count: 4 }]))).toEqual(["scenario.steps.0.effects.0.count: 1단계에 bank의 칸이 3개만 남았습니다(채우려는 수 4)"]);
    expect(issuePaths(withSlots([{ type: "occupy", target: "bank", refused: true }]))).toEqual(["scenario.steps.0.effects.0.refused: 1단계에 bank의 칸이 아직 3개 비어 있어 거절할 수 없습니다"]);
    expect(issuePaths(withSlots([{ type: "occupy", target: "bank", count: 3 }, { type: "occupy", target: "bank", refused: true }]))).toEqual([]);
    expect(issuePaths(withSlots([{ type: "vacate", target: "bank", count: 1 }]))).toEqual(["scenario.steps.0.effects.0.count: 1단계에 bank의 찬 칸은 0개입니다(비우려는 수 1)"]);
  });

  it("burst는 제자리 단계에 쓸 수 없고, 거절된 occupy는 칸 선반에 도장을 찍는다", () => {
    expect(issuePaths((t) => Object.assign(t.scenario.steps[0], { to: "bankTab", burst: 3 }))).toEqual(["scenario.steps.0.burst: 제자리 단계에는 burst를 쓸 수 없습니다"]);
    expect(issuePaths((t) => (t.scenario.steps[0].burst = 9))[0]).toMatch(/^scenario\.steps\.0\.burst:/);
    expect(stepView(termSchema.parse({ ...raw(), scenario: { ...raw().scenario, steps: raw().scenario.steps.map((s: any, i: number) => (i === 0 ? { ...s, burst: 4 } : s)) } }), null, 0).burst).toBe(4);
    expect(blockTarget({ to: "bank", effects: [{ type: "occupy", target: "shelfServer", count: 1, refused: true }] })).toBe("shelfServer");
  });

  it("겹친 화면은 탭 안에만, opacity는 겹친 화면에만. 화면판이 있어 rewrite할 수 있다", () => {
    const frame = { id: "bankFrame", name: "은행 화면", role: "server", kind: "frame", parent: "evilTab" };
    expect(issuePaths((t) => t.scenario.actors.push({ ...frame, parent: "browser" }))).toEqual(["scenario.actors.7.parent: 겹친 화면(frame)은 탭(tab) 안에 둡니다(parent가 tab)"]);
    expect(issuePaths((t) => t.scenario.actors.push({ ...frame, parent: undefined }))).toEqual(["scenario.actors.7.parent: 겹친 화면(frame)은 탭(tab) 안에 둡니다(parent가 tab)"]);
    expect(
      issuePaths((t) => {
        t.scenario.actors.push(frame);
        t.scenario.steps[0].effects = [{ type: "opacity", target: "bankFrame", value: 0.05 }, { type: "rewrite", target: "bankFrame", screen: { lines: ["송금 확인"] } }];
      }),
    ).toEqual([]);
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "opacity", target: "bankTab", value: 0.5 }]))).toEqual(["scenario.steps.0.effects.0.target: opacity는 겹친 화면(frame)에만 씁니다: bankTab"]);
    expect(hasPanel({ ...frame, kind: "frame" } as any)).toBe(true);
  });
});

describe("스택형 어휘: 스택 한도·overflow·고친 코드 판", () => {
  const callStack = () => JSON.parse(readFileSync(new URL("../../../content/terms/call-stack.json", import.meta.url), "utf8"));
  /** 콜 스택을 바꿔 한도 4칸, 5단계 factorial(0)이 한도를 넘고, 해결 방법은 5단계부터 고친 코드로 반환해 내려온다 */
  const overflowTerm = () => {
    const t = callStack();
    const pops = t.scenario.steps.slice(4);
    t.scenario.stackLimit = 4;
    t.scenario.steps = [
      ...t.scenario.steps.slice(0, 4),
      { action: "push", from: "factorial", to: "factorial", title: "factorial(0) 호출", label: "factorial(0)", caption: "한도를 넘음", danger: true, effects: [{ type: "overflow" }, { type: "stamp", label: "StackOverflowError" }] },
    ];
    t.defenses = [{ name: "기저 조건", kind: "solution", description: "멈출 조건", branchAtStep: 5, code: { lines: [...t.scenario.code.lines, "// 고침"] }, steps: pops }];
    return t;
  };
  const issues = (mutate: (t: any) => void = () => {}) => {
    const t = overflowTerm();
    mutate(t);
    const r = termSchema.safeParse(t);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("한도를 넘는 push에 overflow를 쓰면 통과, 해결 방법은 모드 내내 고친 코드 판", () => {
    expect(issues()).toEqual([]);
    const t = termSchema.parse(overflowTerm());
    expect(codeAt(t, null, 4)).toBe(t.scenario.code);
    expect(codeAt(t, 0, 0)!.lines.at(-1)).toBe("// 고침");
    expect(codeAt(t, 0, 4)!.lines.at(-1)).toBe("// 고침");
  });

  it("한도를 넘는데 overflow가 없거나, 한도 안에서 overflow, 한도 없이 overflow, overflow 뒤에 단계가 있으면 오류", () => {
    expect(issues((t) => (t.scenario.steps[4].effects = []))).toEqual(["scenario.steps.4.effects: 스택 한도(4)를 넘는 push에는 overflow 효과가 필요합니다"]);
    expect(issues((t) => (t.scenario.stackLimit = 5))).toEqual(["scenario.steps.4.effects.0.type: overflow는 스택 한도(5)를 넘는 push에만 씁니다(지금 깊이 5)"]);
    expect(issues((t) => delete t.scenario.stackLimit)).toEqual(["scenario.steps.4.effects.0.type: overflow에는 scenario.stackLimit(스택 한도)이 필요합니다"]);
    expect(issues((t) => t.scenario.steps.push({ action: "run", from: "factorial", to: "factorial", title: "더", label: "x", caption: "x" }))).toContain(
      "scenario.steps.4.effects.0.type: overflow 뒤에는 단계가 없어야 합니다(프로그램이 멈춤)",
    );
  });

  it("고친 코드 판은 스택형 해결 방법에만, stackLimit은 스택형에만", () => {
    expect(issues((t) => Object.assign(t.defenses[0], { kind: "defense", blockedAtStep: 5, blockedLabel: "x", blockedCaption: "x", branchAtStep: undefined, steps: undefined }))).toContain(
      "defenses.0.code: code(고친 코드 판)는 스택형 해결 방법(대체 흐름이 있는 solution)에만 씁니다",
    );
    expect(issuePaths((t) => (t.scenario.stackLimit = 3))).toEqual(["scenario.stackLimit: stackLimit은 스택형에만 씁니다"]);
  });
});

describe("점유형 어휘: 공유 값(access·read·write)", () => {
  const st = (action: string, from: string, effects: unknown[] = [], title = `${from} ${action}`) => ({ action, from, to: "balance", title, label: title, caption: title, effects });
  const race = () => ({
    id: "race-test",
    name: "경쟁",
    category: "os",
    summary: "s",
    description: "d",
    status: "draft",
    scenario: {
      playerType: "lock",
      actors: [
        { id: "a", name: "A", role: "process" },
        { id: "b", name: "B", role: "process" },
        { id: "balance", name: "잔액", role: "resource", look: "memory", value: "100" },
      ],
      steps: [st("access", "a", [{ type: "read", value: "100" }]), st("access", "b", [{ type: "read", value: "100" }]), st("access", "a", [{ type: "write", value: "150", note: "100 + 50" }]), st("access", "b", [{ type: "write", value: "150" }, { type: "stamp", label: "갱신 손실" }])],
    },
    defenses: [
      {
        name: "락",
        kind: "solution",
        description: "락",
        branchAtStep: 1,
        steps: [st("acquire", "a"), st("access", "a", [{ type: "read", value: "100" }]), st("wait", "b"), st("access", "a", [{ type: "write", value: "150" }]), st("release", "a"), st("acquire", "b"), st("access", "b", [{ type: "read", value: "150" }]), st("access", "b", [{ type: "write", value: "200" }]), st("release", "b")],
      },
    ],
    references: [{ title: "r", url: "https://example.com" }],
  });
  const issues = (mutate: (t: any) => void = () => {}) => {
    const t = race();
    mutate(t);
    const r = termSchema.safeParse(t);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("락 없는 읽기·쓰기(access)와 락으로 묶은 대체 흐름이 통과한다", () => {
    expect(issues()).toEqual([]);
  });

  it("다른 스레드가 쥔 자원에 access하면 오류(wait를 써야 함)", () => {
    expect(issues((t) => (t.defenses[0].steps[2] = st("access", "b", [{ type: "read", value: "100" }])))).toEqual([
      "defenses.0.steps.2.to: balance는 a가 잡고 있어 access할 수 없습니다(wait를 쓰세요)",
    ]);
  });

  it("read·write는 access 단계에만, 값(value)이 있는 자원에만. value는 자원에만", () => {
    expect(issues((t) => (t.defenses[0].steps[0].effects = [{ type: "read", value: "100" }]))).toEqual(["defenses.0.steps.0.effects.0.type: read는 access 단계에만 씁니다"]);
    expect(issues((t) => delete t.scenario.actors[2].value)[0]).toBe("scenario.steps.0.effects.0.type: balance에 공유 값(value)이 없어 read할 수 없습니다");
    expect(issues((t) => (t.scenario.actors[0].value = "1"))).toEqual(["scenario.actors.0.value: 공유 값(value)은 자원(resource)에만 둡니다(지금 kind: thread)"]);
  });
});
