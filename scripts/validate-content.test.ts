import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { termSchema } from "@app/content-schema";
import { loadTerms } from "./validate-content.ts";
import { selectTerms, toIndexEntry } from "./build-index.ts";

const csrfPath = new URL("../content/terms/csrf.json", import.meta.url);
const tempDir = () => mkdtempSync(join(tmpdir(), "terms-"));

describe("loadTerms", () => {
  it("실제 content/terms는 오류가 없다", () => {
    expect(loadTerms().errors).toEqual([]);
  });

  it("파일명과 id가 다르면 오류", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "xsrf.json"));
    expect(loadTerms(dir).errors).toEqual([`xsrf.json: id - 파일명과 id("csrf")가 다릅니다`]);
  });

  it("오류 위치를 파일명.경로 형식으로 출력하고, BOM은 허용한다", () => {
    const dir = tempDir();
    const csrf = JSON.parse(readFileSync(csrfPath, "utf8"));
    csrf.scenario.steps[4].to = "nobody";
    writeFileSync(join(dir, "csrf.json"), "﻿" + JSON.stringify(csrf));
    expect(loadTerms(dir).errors).toEqual(["csrf.json: scenario.steps[4].to - actors에 없는 행위자: nobody"]);
  });

  it("공개했던 id의 파일이 없으면(이름 변경·삭제) 오류, retired로 남기면 통과 (FR-CNT-05)", () => {
    const dir = tempDir();
    const csrf = JSON.parse(readFileSync(csrfPath, "utf8"));
    writeFileSync(join(dir, "xsrf.json"), JSON.stringify({ ...csrf, id: "xsrf" }));
    expect(loadTerms(dir, ["csrf", "xsrf"]).errors).toEqual([
      `published-ids.json: "csrf" - 공개했던 용어의 파일이 없습니다. id는 바꾸지 말고, 내리려면 status를 retired로 두세요`,
    ]);
    writeFileSync(join(dir, "csrf.json"), JSON.stringify({ ...csrf, status: "retired" }));
    expect(loadTerms(dir, ["csrf", "xsrf"]).errors).toEqual([]);
  });

  it("published 용어가 공개 id 목록에 없으면 오류", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "csrf.json"));
    expect(loadTerms(dir, []).errors).toEqual([`csrf.json: id - 공개하는 용어는 content/published-ids.json에 "csrf"를 추가하세요(한 번 넣으면 지우지 않음)`]);
  });

  it("없는 related는 경고만 낸다", () => {
    const dir = tempDir();
    copyFileSync(csrfPath, join(dir, "csrf.json"));
    const { errors, warnings } = loadTerms(dir);
    expect(errors).toEqual([]);
    expect(warnings).toContain("csrf.json: related[0] - 없는 용어 id: xss");
  });
});

describe("selectTerms", () => {
  const base = termSchema.parse(JSON.parse(readFileSync(csrfPath, "utf8")));
  const terms = (["published", "draft", "retired"] as const).map((status) => ({ ...base, id: status, status }));

  it("배포 빌드는 published만", () => {
    expect(selectTerms(terms, false).map((t) => t.id)).toEqual(["published"]);
  });

  it("개발 서버는 draft까지, retired는 항상 제외", () => {
    expect(selectTerms(terms, true).map((t) => t.id)).toEqual(["published", "draft"]);
  });

  it("index 항목에 단계 수와 방어 수가 들어간다", () => {
    expect(toIndexEntry(base)).toMatchObject({ id: "csrf", playerType: "flow", stepCount: 6, defenseCount: 2, supportCount: 0 });
    const withSupport = { ...base, defenses: [...base.defenses, { ...base.defenses[0]!, name: "보조", blockedAtStep: undefined }] };
    expect(toIndexEntry(withSupport)).toMatchObject({ defenseCount: 2, supportCount: 1 });
  });

  it("index 항목에 위험 시작 단계와 차단 단계(중복 없이)가 들어간다", () => {
    // CSRF 예시: 3단계부터 위험, 방어 둘 다 5단계에서 차단
    expect(toIndexEntry(base)).toMatchObject({ dangerFrom: 3, blockedAt: [5] });
    const safe = { ...base, scenario: { ...base.scenario, steps: base.scenario.steps.map((s) => ({ ...s, danger: false })) }, defenses: [] };
    expect(toIndexEntry(safe)).toMatchObject({ dangerFrom: null, blockedAt: [] });
  });
});
