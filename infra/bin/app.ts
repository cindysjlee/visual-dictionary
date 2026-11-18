import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack.ts";

const app = new App();
new WebStack(app, "VisualDictionaryWeb", {
  // 계정은 --profile vd의 자격 증명에서 정해진다. 계정 ID를 코드에 적지 않는다
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "ap-northeast-2" },
  // npm run deploy가 npm run build를 먼저 실행하므로 published 용어만 들어간다
  distPath: fileURLToPath(new URL("../../apps/web/dist", import.meta.url)),
});
