// 배포 변경 관문의 판단(순수, scripts/ci-gate.ts가 쓴다). 데이터가 있을 수 있는 리소스의 삭제·교체는 사람이 확인하도록 멈춘다(docs/03 2.6)

export type ResourceChange = { Action: string; Replacement?: string; LogicalResourceId: string; ResourceType: string };

/** 데이터 없는 가상 리소스: 로컬과 CI에서 값이 달라 매번 "교체: Conditional"로 잡히므로 변경으로 치지 않는다 */
const IGNORED_TYPES = new Set(["AWS::CDK::Metadata"]);
/**
 * 조건부 교체만 허용하는 리소스: CDK 파일 배포(Custom::CDKBucketDeployment)는 화면 파일이 바뀔 때마다 Conditional로 잡힌다.
 * 데이터를 담지 않고, retainOnDelete 기본값(true)이라 교체돼도 S3 파일을 지우지 않는다. 확정 교체(True)와 삭제는 계속 멈춘다
 */
const CONDITIONAL_OK = new Set(["Custom::CDKBucketDeployment"]);

/** 관문이 보는 실제 변경(가상 리소스 제외). 비면 그 스택은 배포하지 않는다 */
export const realChanges = (changes: ResourceChange[]) => changes.filter((c) => !IGNORED_TYPES.has(c.ResourceType));

/** 멈춰야 하는 변경: 삭제, 확정 교체, 허용 목록 밖의 조건부 교체 */
export function isRisky(c: ResourceChange): boolean {
  if (c.Action === "Remove" || c.Replacement === "True") return true;
  return c.Replacement === "Conditional" && !CONDITIONAL_OK.has(c.ResourceType);
}
