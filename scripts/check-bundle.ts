// 빌드 후 홈 묶음 검사: three.js가 들어 있거나 gzip 120KB를 넘으면 실패 (docs/06 5절)
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const LIMIT_KB = 120;

const html = readFileSync(`${dist}index.html`, "utf8");
const entry = html.match(/<script[^>]+src="\/(assets\/[^"]+\.js)"/)?.[1];
if (!entry) throw new Error("index.html에서 진입 스크립트를 찾지 못했습니다");

const code = readFileSync(dist + entry);
const kb = gzipSync(code).length / 1024;
const failures: string[] = [];
if (/WebGLRenderer|WebGLShadowMap/.test(code.toString())) failures.push("홈 묶음에 three.js가 들어 있습니다");
if (kb > LIMIT_KB) failures.push(`홈 묶음이 gzip ${kb.toFixed(1)}KB로 ${LIMIT_KB}KB를 넘습니다`);

if (failures.length) {
  for (const f of failures) console.error(`실패  ${f}`);
  process.exit(1);
}
console.log(`홈 묶음 통과: ${entry} gzip ${kb.toFixed(1)}KB, three.js 없음`);
