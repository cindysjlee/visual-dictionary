import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema, type Term } from "./index.ts";
import { blockingDefenses, kindOf, lastStepIndex, stepView, zoneOf } from "./scene.ts";

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
    expect(blockingDefenses(csrf)).toEqual([TOKEN, SAMESITE]);
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

  it("알 수 없는 효과 type은 오류", () => {
    expect(issuePaths((t) => (t.scenario.steps[0].effects = [{ type: "explode", target: "bank" }])).length).toBeGreaterThan(0);
  });
});
