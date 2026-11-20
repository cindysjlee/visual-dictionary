// AWS 리소스 설명은 영어(CLAUDE.md): CloudFormation이 저장된 템플릿을 돌려줄 때 비ASCII를 "?"로 바꿔 cdk diff가 배포마다 "비ASCII 생략"을 낸다.
// 템플릿에서 비ASCII 문자열이 든 경로를 모아 테스트가 허용 목록과 비교한다
import { createHash } from "node:crypto";
import type { Template } from "aws-cdk-lib/assertions";

/** 비ASCII 문자열이 든 값의 경로(예: "Resources.UserPool….Properties.EmailVerificationSubject")와 값 */
export function nonAscii(t: Template): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (/[^\x00-\x7f]/.test(v)) found[path] = v;
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(t.toJSON(), "");
  return found;
}

/** 값들의 sha256(경로 순서대로). 고정해 두면 문구가 바뀔 때 테스트가 알린다 */
export const hashOf = (values: Record<string, string>) =>
  createHash("sha256")
    .update(JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]])))
    .digest("hex");
