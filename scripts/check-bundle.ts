// 빌드 후 홈 묶음 검사: three.js가 들어 있거나 gzip 120KB를 넘으면 실패 (docs/06 5절)
import { readdirSync, readFileSync } from "node:fs";
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
// 장면 기록(players/three/trace.ts)은 테스트·개발 빌드 전용. 배포 묶음 어디에도 없어야 한다
const traced = readdirSync(`${dist}assets`).filter((f) => f.endsWith(".js") && readFileSync(`${dist}assets/${f}`, "utf8").includes("__sceneTrace"));
if (traced.length) failures.push(`배포 묶음에 장면 기록 코드가 있습니다: ${traced.join(", ")}`);
// 가짜 인증·가짜 기록 API(features/auth/fake.ts, features/progress/fake.ts)도 테스트·개발 빌드 전용. 인증 구현(Amplify)은 홈 묶음이 아니라 따로 받는다
const faked = readdirSync(`${dist}assets`).filter((f) => f.endsWith(".js") && /fake-auth-users|fake-progress|개발용 가짜 인증/.test(readFileSync(`${dist}assets/${f}`, "utf8")));
if (faked.length) failures.push(`배포 묶음에 가짜 인증이 있습니다: ${faked.join(", ")}`);
if (code.toString().includes("cognito-idp")) failures.push("홈 묶음에 Amplify(Cognito)가 들어 있습니다");
const cognito = readdirSync(`${dist}assets`).filter((f) => f.endsWith(".js") && readFileSync(`${dist}assets/${f}`, "utf8").includes("cognito-idp"));
if (!cognito.length) failures.push("배포 묶음에 Cognito 인증 구현이 없습니다(가짜 구현만 남았는지 확인)");
if (kb > LIMIT_KB) failures.push(`홈 묶음이 gzip ${kb.toFixed(1)}KB로 ${LIMIT_KB}KB를 넘습니다`);

if (failures.length) {
  for (const f of failures) console.error(`실패  ${f}`);
  process.exit(1);
}
console.log(`홈 묶음 통과: ${entry} gzip ${kb.toFixed(1)}KB, three.js·장면 기록·가짜 인증·Amplify 없음`);
