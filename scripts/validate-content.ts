// content/terms/*.json을 모두 검증한다. 오류가 있으면 파일명과 위치를 출력하고 exit 1 (FR-CNT-02)
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { termSchema, type Term } from "@app/content-schema";

export const TERMS_DIR = fileURLToPath(new URL("../content/terms/", import.meta.url));

const formatPath = (path: PropertyKey[]) =>
  path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("").replace(/^\./, "") || "(전체)";

export function loadTerms(dir = TERMS_DIR) {
  const terms: Term[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const fileById = new Map<string, string>();

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    let raw: unknown;
    try {
      // Windows 편집기가 붙이는 BOM은 JSON.parse가 거부하므로 떼어 낸다
      raw = JSON.parse(readFileSync(join(dir, file), "utf8").replace(/^﻿/, ""));
    } catch (e) {
      errors.push(`${file}: JSON 문법 오류 - ${(e as Error).message}`);
      continue;
    }

    const result = termSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${file}: ${formatPath(issue.path)} - ${issue.message}`);
      continue;
    }
    const term = result.data;

    if (term.id !== basename(file, ".json")) errors.push(`${file}: id - 파일명과 id("${term.id}")가 다릅니다`);
    const other = fileById.get(term.id);
    if (other) errors.push(`${file}: id - "${term.id}"가 ${other}에도 있습니다`);
    fileById.set(term.id, file);

    const stepCount = term.scenario.steps.length;
    if (stepCount < 2 || stepCount > 10) warnings.push(`${file}: scenario.steps - 단계 ${stepCount}개 (권장 2~10개)`);
    if (term.category === "web-security" && !term.defenses.some((d) => d.kind === "defense")) {
      warnings.push(`${file}: defenses - 보안 용어는 방어 기법 1개 이상 권장`);
    }
    terms.push(term);
  }

  for (const term of terms) {
    term.related.forEach((relatedId, i) => {
      if (!fileById.has(relatedId)) warnings.push(`${term.id}.json: related[${i}] - 없는 용어 id: ${relatedId}`);
    });
  }
  return { terms, errors, warnings };
}

/** 검증 결과를 출력하고, 오류가 있으면 프로세스를 끝낸다 */
export function validateOrExit(dir?: string): Term[] {
  const { terms, errors, warnings } = loadTerms(dir);
  for (const w of warnings) console.warn(`경고  ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`오류  ${e}`);
    console.error(`콘텐츠 검증 실패: 오류 ${errors.length}개`);
    process.exit(1);
  }
  console.log(`콘텐츠 검증 통과: ${terms.length}개 파일`);
  return terms;
}

if (import.meta.main) validateOrExit();
