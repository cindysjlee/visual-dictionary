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

describe("CI 변경 관문: Lambda 호출 권한의 조건부 교체 예외", () => {
  /** 이번(콘텐츠 1차) 변경 세트 모양: TERM_IDS가 바뀌어 함수는 제자리 수정, 함수 ARN을 참조하는 권한이 Conditional */
  const fn = (id: string, Replacement = "False"): ResourceChange => ({ ResourceType: "AWS::Lambda::Function", Action: "Modify", Replacement, LogicalResourceId: id });
  const permission = (causing: string, source = "ResourceAttribute", type = "AWS::Lambda::Permission"): ResourceChange => ({
    ResourceType: type,
    Action: "Modify",
    Replacement: "Conditional",
    LogicalResourceId: "ApiGETapiprogressProgressIntegrationPermission46F509F3",
    Details: [{ ChangeSource: source, CausingEntity: causing, Evaluation: "Static", Target: { Attribute: "Properties", Name: "FunctionName", RequiresRecreation: "Always" } }],
  });
  const progressFn = fn("ProgressFn6B9D101A");

  it("통과: 원인이 같은 변경 세트에서 교체되지 않는(Replacement=False) 함수의 Arn 참조뿐", () => {
    const p = permission("ProgressFn6B9D101A.Arn");
    expect(isRisky(p, [progressFn, p])).toBe(false);
  });

  it("멈춤: 참조 대상 함수가 교체(True)·조건부 교체(Conditional)되거나 변경 세트에 없음", () => {
    const p = permission("ProgressFn6B9D101A.Arn");
    expect(isRisky(p, [fn("ProgressFn6B9D101A", "True"), p])).toBe(true);
    expect(isRisky(p, [fn("ProgressFn6B9D101A", "Conditional"), p])).toBe(true);
    expect(isRisky(p, [p])).toBe(true);
  });

  it("멈춤: 직접 속성 변경, Arn이 아닌 속성 참조, 상세 없음, 상세 중 하나라도 다른 원인", () => {
    expect(isRisky(permission("ProgressFn6B9D101A.Arn", "DirectModification"), [progressFn])).toBe(true);
    expect(isRisky(permission("ProgressFn6B9D101A.Version", "ResourceAttribute"), [progressFn])).toBe(true);
    expect(isRisky({ ...permission("ProgressFn6B9D101A.Arn"), Details: [] }, [progressFn])).toBe(true);
    const mixed = permission("ProgressFn6B9D101A.Arn");
    mixed.Details!.push({ ChangeSource: "DirectModification", Target: { Attribute: "Properties", Name: "Principal" } });
    expect(isRisky(mixed, [progressFn, mixed])).toBe(true);
  });

  it("멈춤: 다른 리소스 종류(API 연동·테이블)는 같은 모양이어도 예외가 아님", () => {
    expect(isRisky(permission("ProgressFn6B9D101A.Arn", "ResourceAttribute", "AWS::ApiGatewayV2::Integration"), [progressFn])).toBe(true);
    expect(isRisky(permission("ProgressFn6B9D101A.Arn", "ResourceAttribute", "AWS::DynamoDB::Table"), [progressFn])).toBe(true);
  });
});
