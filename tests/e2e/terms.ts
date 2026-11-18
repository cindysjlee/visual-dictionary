// E2E 대상 용어: 기본은 published만, E2E_INCLUDE_DRAFTS=1이면 draft까지(retired 제외). content/terms에서 자동으로 늘어난다
import { readdirSync, readFileSync } from "node:fs";
import { termSchema, type Term } from "../../packages/content-schema/src/index.ts";

const dir = new URL("../../content/terms/", import.meta.url);
const drafts = process.env.E2E_INCLUDE_DRAFTS === "1";

export const terms: Term[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => termSchema.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))))
  .filter((t) => t.status === "published" || (drafts && t.status === "draft"));
