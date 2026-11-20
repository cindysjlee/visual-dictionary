// 배포 변경 관문 판단(scripts/ci-gate-rules.ts): 제외되는 것과 계속 멈추는 것
import { describe, expect, it } from "vitest";
import { isRisky, realChanges, type ResourceChange } from "./ci-gate-rules.ts";

const change = (ResourceType: string, Action: string, Replacement?: string): ResourceChange => ({ ResourceType, Action, Replacement, LogicalResourceId: "X" });

describe("CI 변경 관문", () => {
  it("제외: 파일 배포(Custom::CDKBucketDeployment)의 조건부 교체, 일반 수정, CDK 메타데이터", () => {
    expect(isRisky(change("Custom::CDKBucketDeployment", "Modify", "Conditional"))).toBe(false);
    expect(isRisky(change("AWS::Lambda::Function", "Modify", "False"))).toBe(false);
    expect(isRisky(change("AWS::Lambda::Function", "Add"))).toBe(false);
    expect(realChanges([change("AWS::CDK::Metadata", "Modify", "Conditional")])).toEqual([]);
  });

  it("계속 멈춤: 파일 배포의 확정 교체·삭제, 다른 리소스의 조건부·확정 교체, 삭제", () => {
    expect(isRisky(change("Custom::CDKBucketDeployment", "Modify", "True"))).toBe(true);
    expect(isRisky(change("Custom::CDKBucketDeployment", "Remove"))).toBe(true);
    expect(isRisky(change("AWS::DynamoDB::Table", "Modify", "Conditional"))).toBe(true);
    expect(isRisky(change("AWS::Cognito::UserPool", "Modify", "True"))).toBe(true);
    expect(isRisky(change("AWS::S3::Bucket", "Remove"))).toBe(true);
    expect(realChanges([change("AWS::DynamoDB::Table", "Modify", "Conditional")])).toHaveLength(1);
  });
});
