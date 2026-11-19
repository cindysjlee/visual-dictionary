// 배포 후 확인: node scripts/smoke-prod.ts [주소]. 보안 헤더 값, SPA 대체 응답, robots.txt, published 용어 전부의 상세 페이지·콘텐츠, 캐시 정책
import { readdirSync, readFileSync } from "node:fs";
const TERMS_DIR = new URL("../content/terms/", import.meta.url);
const base = (process.argv[2] ?? process.env.SITE_URL ?? "https://d1y3rvak3nd08u.cloudfront.net").replace(/\/$/, "");

const EXPECTED_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);

const home = await fetch(`${base}/`);
for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
  const got = home.headers.get(name);
  check(got === value, `${name}: ${got ?? "(없음)"}`);
}

// published 용어 전부: 상세 페이지(HTML)와 콘텐츠 JSON. 없는 JSON도 SPA 대체 응답(HTML 200)이 오므로 형식과 id까지 본다
const published = readdirSync(TERMS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, TERMS_DIR), "utf8")) as { id: string; status: string })
  .filter((t) => t.status === "published")
  .map((t) => t.id)
  .sort();
for (const id of published) {
  const page = await fetch(`${base}/terms/${id}`);
  check(page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html"), `/terms/${id} → ${page.status}`);
  const res = await fetch(`${base}/content/terms/${id}.json`);
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? ((await res.json()) as { id?: string }) : undefined;
  check(res.status === 200 && body?.id === id, `/content/terms/${id}.json → ${res.status} ${type}${body && body.id !== id ? ` (id ${body.id})` : ""}`);
}
const deployedIds = ((await (await fetch(`${base}/content/index.json`)).json()) as { id: string }[]).map((e) => e.id).sort();
check(deployedIds.join() === published.join(), `index.json 용어 = published ${published.length}개 (배포: ${deployedIds.join(", ")})`);

const missing = await fetch(`${base}/no-such-page/x`);
const missingBody = await missing.text();
check(missing.status === 200 && missingBody.includes('id="root"'), `없는 주소 → ${missing.status} (SPA index.html)`);

const robots = await fetch(`${base}/robots.txt`);
check(robots.status === 200 && (robots.headers.get("content-type") ?? "").startsWith("text/plain"), `/robots.txt → ${robots.status} ${robots.headers.get("content-type")}`);

const json = await fetch(`${base}/content/terms/csrf.json`);

// 캐시 정책 (infra/lib/web-stack.ts): 진입 HTML·콘텐츠는 no-cache, 해시 파일은 immutable, 나머지는 1시간
const cacheOf = (r: Response) => r.headers.get("cache-control") ?? "(없음)";
const homeHtml = await home.text();
check(cacheOf(home) === "no-cache", `/ (index.html) cache-control: ${cacheOf(home)}`);
for (const [path, res] of [["/content/terms/csrf.json", json], ["/content/index.json", await fetch(`${base}/content/index.json`)]] as const) {
  check(cacheOf(res) === "no-cache", `${path} cache-control: ${cacheOf(res)}`);
}
const assetPath = homeHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const asset = assetPath ? await fetch(`${base}${assetPath}`) : undefined;
check(
  Boolean(asset?.ok && (asset.headers.get("content-type") ?? "").includes("javascript") && cacheOf(asset).includes("immutable") && cacheOf(asset).includes("max-age=31536000")),
  `${assetPath ?? "/assets/*.js(index.html에서 못 찾음)"} cache-control: ${asset ? cacheOf(asset) : "-"}`,
);
check(cacheOf(robots) === "public, max-age=3600", `/robots.txt cache-control: ${cacheOf(robots)}`);

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `smoke:prod 실패 ${failed}건 (${base})` : `smoke:prod 통과 ${results.length}건 (${base})`);
process.exit(failed ? 1 : 0);
