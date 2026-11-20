// content/terms/*.json을 모두 검증한다. 오류가 있으면 파일명과 위치를 출력하고 exit 1 (FR-CNT-02)
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { termSchema, type Term } from "@app/content-schema";

export const TERMS_DIR = fileURLToPath(new URL("../content/terms/", import.meta.url));
/** 한 번이라도 공개(published)한 용어 id. 학습 기록의 키라 바꾸거나 지우지 않는다(FR-CNT-05). 용어를 내리려면 status를 retired로 */
export const PUBLISHED_IDS = fileURLToPath(new URL("../content/published-ids.json", import.meta.url));
const readPublishedIds = () => JSON.parse(readFileSync(PUBLISHED_IDS, "utf8")) as string[];

const formatPath = (path: PropertyKey[]) =>
  path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("").replace(/^\./, "") || "(전체)";

export function loadTerms(dir = TERMS_DIR, publishedIds: string[] | undefined = dir === TERMS_DIR ? readPublishedIds() : undefined) {
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

  // 임시 폴더로 도는 단위 테스트는 목록을 넘길 때만 검사한다
  for (const id of publishedIds ?? []) {
    if (!fileById.has(id)) errors.push(`published-ids.json: "${id}" - 공개했던 용어의 파일이 없습니다. id는 바꾸지 말고, 내리려면 status를 retired로 두세요`);
  }
  for (const term of terms) {
    if (publishedIds && term.status === "published" && !publishedIds.includes(term.id)) {
      errors.push(`${fileById.get(term.id)}: id - 공개하는 용어는 content/published-ids.json에 "${term.id}"를 추가하세요(한 번 넣으면 지우지 않음)`);
    }
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
