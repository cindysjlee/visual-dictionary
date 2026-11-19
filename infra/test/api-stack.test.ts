import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { API_THROTTLE, ApiStack } from "../lib/api-stack.ts";
import { AuthStack } from "../lib/auth-stack.ts";

// 번들링(esbuild)은 건너뛴다: 설정 값만 본다
const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
const env = { region: "ap-northeast-2" };
const auth = new AuthStack(app, "Auth", { env });
const t = Template.fromStack(new ApiStack(app, "Api", { env, userPool: auth.userPool, client: auth.client, termIds: ["csrf", "xss"] }));

/** 역할 이름(로지컬 ID 접두사)으로 그 Lambda가 가진 정책 문장의 Action 목록 */
function actionsOf(fnPrefix: string): string[] {
  const roles = Object.keys(t.findResources("AWS::IAM::Role")).filter((id) => id.startsWith(fnPrefix));
  const policies = Object.values(t.findResources("AWS::IAM::Policy")).filter((p) =>
    (p.Properties.Roles as { Ref: string }[]).some((r) => roles.includes(r.Ref)),
  );
  return policies.flatMap((p) => (p.Properties.PolicyDocument.Statement as { Action: string | string[] }[]).flatMap((s) => [s.Action].flat())).sort();
}

describe("ApiStack", () => {
  it("테이블: PK userId·SK termId, 요청당 과금, TTL ttl, 삭제 보호, 스택을 지워도 남음", () => {
    t.hasResource("AWS::DynamoDB::Table", {
      Properties: Match.objectLike({
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "termId", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
        DeletionProtectionEnabled: true,
      }),
      DeletionPolicy: "Retain",
    });
  });

  it("모든 경로에 JWT 인가(Cognito 발급자, 웹 클라이언트 대상)", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "JWT",
      IdentitySource: ["$request.header.Authorization"],
      JwtConfiguration: { Audience: [Match.anyValue()], Issuer: Match.anyValue() },
    });
    const routes = Object.values(t.findResources("AWS::ApiGatewayV2::Route"));
    expect(routes.map((r) => r.Properties.RouteKey).sort()).toEqual(["DELETE /api/account", "GET /api/progress", "PUT /api/progress/{termId}"]);
    for (const r of routes) expect(r.Properties.AuthorizationType).toBe("JWT");
  });

  it("스테이지 기본 요청 제한: 초당 10, 버스트 20", () => {
    expect(API_THROTTLE).toEqual({ rateLimit: 10, burstLimit: 20 });
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "$default",
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it("정리 큐: 5번 실패하면 DLQ(14일 보관), DLQ 알람", () => {
    t.hasResourceProperties("AWS::SQS::Queue", { RedrivePolicy: { maxReceiveCount: 5, deadLetterTargetArn: Match.anyValue() }, VisibilityTimeout: 180 });
    t.hasResourceProperties("AWS::SQS::Queue", { MessageRetentionPeriod: 14 * 24 * 3600 });
    t.hasResourceProperties("AWS::Lambda::EventSourceMapping", { BatchSize: 1, FunctionResponseTypes: ["ReportBatchItemFailures"] });
    t.resourceCountIs("AWS::CloudWatch::Alarm", 1);
  });

  it("Lambda: Node 22·ARM, 로그 14일", () => {
    t.resourceCountIs("AWS::Lambda::Function", 3);
    t.allResourcesProperties("AWS::Lambda::Function", { Runtime: "nodejs22.x", Architectures: ["arm64"] });
    t.resourceCountIs("AWS::Logs::LogGroup", 3);
    t.allResourcesProperties("AWS::Logs::LogGroup", { RetentionInDays: 14 });
  });

  it("권한은 하는 일만큼: 진행은 테이블 읽기·조건·쓰기, 탈퇴는 표시·큐·Cognito 삭제, 정리는 조회·일괄 삭제·Cognito 조회", () => {
    expect(actionsOf("ProgressFn")).toEqual(["dynamodb:ConditionCheckItem", "dynamodb:PutItem", "dynamodb:Query"]);
    expect(actionsOf("AccountFn")).toEqual(["cognito-idp:AdminDeleteUser", "dynamodb:DeleteItem", "dynamodb:PutItem", "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:SendMessage"]);
    expect(actionsOf("CleanupFn")).toEqual(
      expect.arrayContaining(["cognito-idp:AdminGetUser", "dynamodb:BatchWriteItem", "dynamodb:Query", "sqs:ReceiveMessage", "sqs:DeleteMessage"]),
    );
    expect(actionsOf("CleanupFn")).not.toContain("cognito-idp:AdminDeleteUser");
    expect(actionsOf("ProgressFn")).not.toContain("dynamodb:DeleteItem");
  });
});
