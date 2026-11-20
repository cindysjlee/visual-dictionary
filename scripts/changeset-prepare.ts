// 변경 세트만 만들어 교체 여부를 확인한다(실행하지 않음): npm run changeset:prepare -- <스택> [변경 세트 이름]
// CLAUDE.md: 리소스의 정체를 바꾸는 변경은 승인 요청 전에 이것으로 Action·Replacement를 확인한다.
// --method=prepare-change-set과 --require-approval never는 여기 고정한다(IAM 변경이 섞이면 prepare도 확인을 요구하므로). 실행 옵션은 받지 않는다.
// 확인한 변경 세트의 실행은 사용자 "승인" 뒤에만: cdk deploy <스택> --exclusively --method=execute-change-set --change-set-name <이름> (CLAUDE.md)
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const STACKS = ["VisualDictionaryAuth", "VisualDictionaryApi", "VisualDictionaryWeb", "VisualDictionaryCi"] as const;
type Stack = (typeof STACKS)[number];

/** 인자 검사: 스택 하나와 선택적 이름만. 옵션처럼 보이는 인자(--method=execute-change-set 등)는 모두 거부한다 */
export function parseArgs(args: string[]): { stack: Stack; name: string } {
  if (args.some((a) => a.startsWith("-"))) throw new Error(`옵션은 받지 않습니다(실행·승인 옵션은 스크립트에 고정): ${args.filter((a) => a.startsWith("-")).join(" ")}`);
  const [stack, name = "review", ...rest] = args;
  if (rest.length) throw new Error(`인자가 너무 많습니다: ${rest.join(" ")}`);
  if (!STACKS.includes(stack as Stack)) throw new Error(`스택은 ${STACKS.join(", ")} 중 하나: ${stack ?? "(없음)"}`);
  if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name)) throw new Error(`변경 세트 이름 형식이 아닙니다: ${name}`);
  return { stack: stack as Stack, name };
}

const redact = (s: string) => s.replace(/\b\d{12}\b/g, "<계정>");

if (import.meta.main) {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  const { stack, name } = parsed;
  const profile = ["--profile", process.env.AWS_PROFILE ?? "vd"];
  const infraDir = fileURLToPath(new URL("../infra/", import.meta.url));
  // 셸을 거치지 않는다(인자를 배열 그대로 넘김, DEP0190 없음). aws·gh·git은 실행 파일이라 Windows에서도 셸이 필요 없다
  const run = (cmd: string, args: string[], cwd?: string) => spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
  // npx는 Windows에서 .cmd라 셸 없이 못 띄운다: Node로 CDK CLI의 JS 진입점을 직접 실행한다(같은 CDK 버전)
  const cdkBin = createRequire(import.meta.url).resolve("aws-cdk/bin/cdk");

  // CI 스택은 OIDC sub를 CDK context로 받는다(저장소 파일에 적지 않음, docs/03 2.6). GitHub가 실제로 보내는 값에서 만든다
  const context: string[] = [];
  if (stack === "VisualDictionaryCi") {
    const repo = run("git", ["remote", "get-url", "origin"]).stdout.trim().replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
    const prefix = run("gh", ["api", `repos/${repo}/actions/oidc/customization/sub`, "--jq", ".sub_claim_prefix"]).stdout.trim();
    if (!prefix.startsWith("repo:")) {
      console.error("GitHub OIDC sub 접두어를 읽지 못했습니다(gh 로그인 확인)");
      process.exit(1);
    }
    context.push("-c", `githubRepo=${prefix.slice("repo:".length)}`);
  }

  const prepared = run(
    process.execPath,
    [cdkBin, "deploy", stack, "--exclusively", "--method=prepare-change-set", "--change-set-name", name, "--require-approval", "never", ...context, ...profile],
    infraDir,
  );
  if (prepared.status !== 0) {
    console.error(redact(`${prepared.stdout}${prepared.stderr}`).slice(-4000));
    process.exit(1);
  }
  const described = run("aws", ["cloudformation", "describe-change-set", "--stack-name", stack, "--change-set-name", name, "--region", "ap-northeast-2", "--output", "json", ...profile]);
  if (described.status !== 0) {
    // 바뀐 것이 없으면 CDK가 변경 세트를 남기지 않는다
    const none = /ChangeSetNotFound|does not exist/.test(described.stderr);
    console.log(none ? `${stack}: 바뀐 것이 없습니다(변경 세트 없음)` : redact(described.stderr));
    process.exit(none ? 0 : 1);
  }
  type Change = { ResourceChange: { Action: string; Replacement?: string; ResourceType: string; LogicalResourceId: string } };
  const cs = JSON.parse(described.stdout) as { Status: string; ExecutionStatus: string; Changes: Change[] };
  if (!cs.Changes.length) {
    // 바뀐 것이 없어도 CDK가 빈 변경 세트를 남길 수 있다: 이 스크립트가 만든 것이므로 지운다(스택 리소스는 바뀌지 않음)
    run("aws", ["cloudformation", "delete-change-set", "--stack-name", stack, "--change-set-name", name, "--region", "ap-northeast-2", ...profile]);
    console.log(`${stack}: 바뀐 것이 없습니다(빈 변경 세트 ${name}는 지움)`);
    process.exit(0);
  }
  console.log(`${stack} 변경 세트 ${name}: ${cs.Status} / ${cs.ExecutionStatus} (실행하지 않음)`);
  console.log("| 동작 | 교체 | 종류 | 리소스 |\n| --- | --- | --- | --- |");
  for (const { ResourceChange: r } of cs.Changes) console.log(`| ${r.Action} | ${r.Replacement ?? "-"} | ${r.ResourceType} | ${r.LogicalResourceId} |`);
  console.log(`\n실행(사용자 승인 뒤에만): cd infra && npx cdk deploy ${stack} --exclusively --method=execute-change-set --change-set-name ${name}`);
  console.log(`쓰지 않으면 지운다: aws cloudformation delete-change-set --stack-name ${stack} --change-set-name ${name} --region ap-northeast-2`);
}
