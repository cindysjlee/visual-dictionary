// content/terms/*.json을 모두 검증한다. 오류가 있으면 파일명과 위치를 출력하고 exit 1 (FR-CNT-02)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { glossarySchema, pathsSchema, termSchema, type GlossaryEntry, type LearningPath, type Term } from "@app/content-schema";
import { SENTENCE_WARN, explanationNoteWords, explanationParagraphs, sentencesOf } from "@app/content-schema/explain";
import { checkFigureSvg } from "@app/content-schema/figure";

export const TERMS_DIR = fileURLToPath(new URL("../content/terms/", import.meta.url));
/** 한 번이라도 공개(published)한 용어 id. 학습 기록의 키라 바꾸거나 지우지 않는다(FR-CNT-05). 용어를 내리려면 status를 retired로 */
export const PUBLISHED_IDS = fileURLToPath(new URL("../content/published-ids.json", import.meta.url));
const readPublishedIds = () => JSON.parse(readFileSync(PUBLISHED_IDS, "utf8")) as string[];
/** 각주 풀이 사전(docs/04 "각주"): 본문의 [[단어]]가 이 목록의 word를 가리킨다 */
export const GLOSSARY_FILE = fileURLToPath(new URL("../content/glossary.json", import.meta.url));
/** 용어 옆 그림 SVG(docs/04 "그림"): content/figures/<id>.svg. 직접 그린 것만 */
export const FIGURES_DIR = fileURLToPath(new URL("../content/figures/", import.meta.url));

/** 추천 학습 경로(docs/04): 처음 배우는 사람을 위한 읽는 순서 */
export const PATHS_FILE = fileURLToPath(new URL("../content/paths.json", import.meta.url));

const formatPath = (path: PropertyKey[]) =>
  path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("").replace(/^\./, "") || "(전체)";

/** 풀이 사전을 읽고 형식을 검사한다. 파일이 없으면 오류 */
export function loadGlossary(file = GLOSSARY_FILE): { entries: GlossaryEntry[]; errors: string[] } {
  const name = basename(file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8").replace(/^/, ""));
  } catch (e) {
    return { entries: [], errors: [`${name}: 읽을 수 없습니다 - ${(e as Error).message}`] };
  }
  const result = glossarySchema.safeParse(raw);
  if (!result.success) return { entries: [], errors: result.error.issues.map((i) => `${name}: ${formatPath(i.path)} - ${i.message}`) };
  return { entries: result.data, errors: [] };
}

/** 경로 파일을 읽고 형식을 검사한다. 파일이 없으면 오류 */
export function loadPaths(file = PATHS_FILE): { paths: LearningPath[]; errors: string[] } {
  const name = basename(file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    return { paths: [], errors: [`${name}: 읽을 수 없습니다 - ${(e as Error).message}`] };
  }
  const result = pathsSchema.safeParse(raw);
  if (!result.success) return { paths: [], errors: result.error.issues.map((i) => `${name}: ${formatPath(i.path)} - ${i.message}`) };
  return { paths: result.data, errors: [] };
}

/**
 * glossaryFile을 주면(실제 content/terms는 항상) 각주 단어를 풀이 사전과 맞춰 본다:
 * 사전에 없는 단어, 어느 용어에서도 안 쓰이는 사전 항목, 없는 용어를 가리키는 term, 자기 자신으로 가는 각주는 오류
 */
export function loadTerms(
  dir = TERMS_DIR,
  publishedIds: string[] | undefined = dir === TERMS_DIR ? readPublishedIds() : undefined,
  glossaryFile: string | undefined = dir === TERMS_DIR ? GLOSSARY_FILE : undefined,
  figuresDir: string | undefined = dir === TERMS_DIR ? FIGURES_DIR : undefined,
  pathsFile: string | undefined = dir === TERMS_DIR ? PATHS_FILE : undefined,
) {
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

    // 설명 틀: 문장은 짧게(권장). 길면 경고만
    if (typeof term.description !== "string") {
      for (const p of explanationParagraphs(term.description)) {
        const long = sentencesOf(p.text).find((s) => [...s].length > SENTENCE_WARN);
        if (long) warnings.push(`${file}: description.${p.part}[${p.index}] - ${SENTENCE_WARN}자가 넘는 문장(짧게 나누세요): "${long.slice(0, 24)}…"`);
      }
    }

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

  if (glossaryFile) {
    const { entries, errors: glossaryErrors } = loadGlossary(glossaryFile);
    errors.push(...glossaryErrors);
    const byWord = new Map(entries.map((e) => [e.word, e]));
    const used = new Set<string>();
    for (const term of terms) {
      for (const word of explanationNoteWords(term.description)) {
        used.add(word);
        const entry = byWord.get(word);
        if (glossaryErrors.length === 0 && !entry) errors.push(`${fileById.get(term.id)}: description - 각주 단어 "${word}"가 glossary.json에 없습니다`);
        else if (entry?.term === term.id) errors.push(`${fileById.get(term.id)}: description - 각주 "${word}"가 이 용어 자신을 가리킵니다(자기 쪽으로 가는 링크)`);
      }
    }
    entries.forEach((e, i) => {
      if (!used.has(e.word)) errors.push(`glossary.json: [${i}].word - "${e.word}"는 어떤 용어의 설명에서도 쓰이지 않습니다(쓰지 않는 항목은 지웁니다)`);
      if (e.term && !fileById.has(e.term)) errors.push(`glossary.json: [${i}].term - 없는 용어 id: ${e.term}`);
    });
  }

  // 그림: 파일이 있고 규칙(직접 그린 SVG, 색 토큰 클래스만, 표식 글자만)을 지키며, 한 용어만 쓰고, 쓰이지 않는 파일은 없다
  if (figuresDir) {
    const owner = new Map<string, string>();
    for (const term of terms) {
      term.figures.forEach((fig, i) => {
        const where = `${fileById.get(term.id)}: figures[${i}]`;
        const first = owner.get(fig.id);
        if (first) errors.push(`${where}.id - 그림 "${fig.id}"는 이미 ${first}에서 씁니다(그림 하나는 용어 하나만)`);
        owner.set(fig.id, fileById.get(term.id)!);
        const path = join(figuresDir, `${fig.id}.svg`);
        if (!existsSync(path)) {
          errors.push(`${where}.id - 그림 파일이 없습니다: content/figures/${fig.id}.svg`);
          return;
        }
        for (const issue of checkFigureSvg(readFileSync(path, "utf8"))) errors.push(`${fig.id}.svg: ${issue}`);
      });
    }
    const files = existsSync(figuresDir) ? readdirSync(figuresDir).filter((f) => f.endsWith(".svg")) : [];
    for (const f of files) {
      if (!owner.has(basename(f, ".svg"))) errors.push(`${f}: 어떤 용어의 figures에서도 쓰이지 않는 그림 파일입니다(쓰지 않는 파일은 지웁니다)`);
    }
  }

  // 추천 학습 경로: 단계는 공개(published)된 용어만(초안·내린 용어가 공개 빌드에 새지 않게)
  if (pathsFile) {
    const { paths, errors: pathErrors } = loadPaths(pathsFile);
    errors.push(...pathErrors);
    const status = new Map(terms.map((t) => [t.id, t.status]));
    paths.forEach((p, i) =>
      p.steps.forEach((stepId, j) => {
        if (status.get(stepId) !== "published") errors.push(`paths.json: [${i}].steps[${j}] - 공개된(published) 용어가 아닙니다: ${stepId}`);
      }),
    );
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
