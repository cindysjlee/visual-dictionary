import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { lastStepIndex, stepView, type Mode } from "@app/content-schema/scene";
import { moods, sceneAt, sceneDuring } from "./sketchScene.ts";

const csrf = termSchema.parse(JSON.parse(readFileSync(new URL("../../../../../content/terms/csrf.json", import.meta.url), "utf8")));
const viewsOf = (mode: Mode) => Array.from({ length: lastStepIndex(csrf, mode) + 1 }, (_, i) => stepView(csrf, mode, i));

describe("그림 1 스케치 장면", () => {
  it("공격 흐름: 끝나면 송금액만큼 빠지고 사용자·은행은 놀라고 공격자는 웃는다", () => {
    const v = viewsOf(null);
    const s = sceneAt(v, v.length - 1);
    expect(v).toHaveLength(6);
    expect(s.paid).toBe(1_000_000);
    expect(s.jar && s.shown.has("evilTab") && s.flipped.has("evilTab")).toBe(true);
    expect(s.card).toBeNull();
    expect(moods(s)).toMatchObject({ user: "shock", bank: "shock", attacker: "happy" });
  });

  it("방어: CSRF 토큰은 5단계에서 막히고 토큰이 은행 탭에 있으며 검사 카드가 남는다", () => {
    const v = viewsOf(0);
    const s = sceneAt(v, v.length - 1);
    expect(v).toHaveLength(5);
    expect(s.blocked && s.paid === 0).toBe(true);
    expect(s.tokenAt).toBe("bankTab");
    expect(s.card?.find((c) => c.status === "fail")?.name).toBe("CSRF 토큰");
    expect(moods(s)).toMatchObject({ user: "happy", bank: "smile", attacker: "angry" });
  });

  it("방어: SameSite는 쿠키가 봉투에 붙지 않는다", () => {
    const v = viewsOf(1);
    expect(sceneDuring(v, 4, new Set(["attach"])).carry).toBe(false);
    expect(sceneDuring(viewsOf(null), 4, new Set(["attach"])).carry).toBe(true);
  });
});
