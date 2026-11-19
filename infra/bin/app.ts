import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack.ts";
import { AuthStack } from "../lib/auth-stack.ts";
import { WebStack } from "../lib/web-stack.ts";

const app = new App();
// 계정은 --profile vd의 자격 증명에서 정해진다. 계정 ID를 코드에 적지 않는다
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "ap-northeast-2" };
const auth = new AuthStack(app, "VisualDictionaryAuth", { env });
// 학습 기록은 published 용어에만 남길 수 있다(Lambda가 이 목록으로 검사). 용어를 published로 바꾸면 다시 배포한다
const termsDir = new URL("../../content/terms/", import.meta.url);
const termIds = readdirSync(termsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, termsDir), "utf8")) as { id: string; status: string })
  .filter((t) => t.status === "published")
  .map((t) => t.id)
  .sort();
new ApiStack(app, "VisualDictionaryApi", { env, userPool: auth.userPool, client: auth.client, termIds });
new WebStack(app, "VisualDictionaryWeb", {
  env,
  auth: { region: env.region, userPoolId: auth.userPool.userPoolId, userPoolClientId: auth.client.userPoolClientId },
  // npm run deploy가 npm run build를 먼저 실행하므로 published 용어만 들어간다
  distPath: fileURLToPath(new URL("../../apps/web/dist", import.meta.url)),
});
