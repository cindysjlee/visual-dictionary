import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CiStack } from "../lib/ci-stack.ts";

const t = Template.fromStack(new CiStack(new App(), "Ci", { env: { region: "ap-northeast-2" }, githubRepo: "example-owner/visual-dictionary" }));
const statements = () =>
  Object.values(t.findResources("AWS::IAM::Policy")).flatMap(
    (p) => p.Properties.PolicyDocument.Statement as { Sid: string; Effect: string; Action: string | string[]; Resource: unknown }[],
  );

describe("CiStack(GitHub OIDC 배포 역할)", () => {
  it("OIDC 공급자: GitHub, 대상 sts.amazonaws.com", () => {
    t.hasResourceProperties("AWS::IAM::OIDCProvider", { Url: "https://token.actions.githubusercontent.com", ClientIdList: ["sts.amazonaws.com"] });
  });

  it("신뢰: 이 저장소의 main 브랜치만(정확히 일치, 와일드카드 없음)", () => {
    const role = Object.values(t.findResources("AWS::IAM::Role"))[0]!;
    const trust = role.Properties.AssumeRolePolicyDocument.Statement as { Action: string; Condition: Record<string, Record<string, string>> }[];
    expect(trust).toHaveLength(1);
    expect(trust[0]!.Action).toBe("sts:AssumeRoleWithWebIdentity");
    expect(trust[0]!.Condition).toEqual({
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:example-owner/visual-dictionary:ref:refs/heads/main",
      },
    });
    expect(JSON.stringify(trust)).not.toContain("*");
    t.hasResourceProperties("AWS::IAM::Role", { MaxSessionDuration: 3600 });
  });

  it("권한: 부트스트랩 역할 3개 맡기 + 읽기(Describe·Get·List)만, 쓰기 없음", () => {
    const all = statements();
    const assume = all.filter((s) => [s.Action].flat().includes("sts:AssumeRole"));
    expect(assume).toHaveLength(1);
    const roles = JSON.stringify(assume[0]!.Resource);
    for (const r of ["deploy", "file-publishing", "lookup"]) expect(roles).toContain(`cdk-hnb659fds-${r}-role-`);
    expect(roles).not.toContain("image-publishing");
    const others = all.filter((s) => s !== assume[0]).flatMap((s) => [s.Action].flat());
    for (const a of others) expect(a, a).toMatch(/^[\w-]+:(Describe|Get|List)\w*$|^apigateway:GET$/);
    expect(all.every((s) => s.Effect === "Allow")).toBe(true);
  });

  it("저장소 형식이 아니면 만들지 않는다", () => {
    expect(() => new CiStack(new App(), "Bad", { githubRepo: "no-slash" })).toThrow();
  });

  it("출력: 역할 ARN(저장소 파일에 적지 않고 GitHub Secret으로)", () => {
    t.hasOutput("DeployRoleArn", { Value: Match.anyValue() });
  });
});
