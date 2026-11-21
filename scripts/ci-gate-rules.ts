// 배포 변경 관문의 판단(순수, scripts/ci-gate.ts가 쓴다). 데이터가 있을 수 있는 리소스의 삭제·교체는 사람이 확인하도록 멈춘다(docs/03 2.6)

/** describe-change-set의 ResourceChange.Details 한 줄. CausingEntity는 ResourceAttribute면 "<논리 ID>.<속성>"(예: ProgressFn6B9D101A.Arn) */
export type ChangeDetail = { ChangeSource?: string; CausingEntity?: string; Evaluation?: string; Target?: { Attribute?: string; Name?: string; RequiresRecreation?: string } };
export type ResourceChange = { Action: string; Replacement?: string; LogicalResourceId: string; ResourceType: string; Details?: ChangeDetail[] };

/** 데이터 없는 가상 리소스: 로컬과 CI에서 값이 달라 매번 "교체: Conditional"로 잡히므로 변경으로 치지 않는다 */
const IGNORED_TYPES = new Set(["AWS::CDK::Metadata"]);
/**
 * 조건부 교체만 허용하는 리소스: CDK 파일 배포(Custom::CDKBucketDeployment)는 화면 파일이 바뀔 때마다 Conditional로 잡힌다.
 * 데이터를 담지 않고, retainOnDelete 기본값(true)이라 교체돼도 S3 파일을 지우지 않는다. 확정 교체(True)와 삭제는 계속 멈춘다
 */
const CONDITIONAL_OK = new Set(["Custom::CDKBucketDeployment"]);

/** 관문이 보는 실제 변경(가상 리소스 제외). 비면 그 스택은 배포하지 않는다 */
export const realChanges = (changes: ResourceChange[]) => changes.filter((c) => !IGNORED_TYPES.has(c.ResourceType));

/**
 * Lambda 호출 권한(AWS::Lambda::Permission)의 조건부 교체 예외. 공개 용어가 바뀌면 함수 환경 변수(TERM_IDS)가 바뀌고,
 * 함수 ARN을 참조하는 권한이 "교체될 수도 있음"으로 잡힌다. 아래를 모두 만족할 때만 허용한다(그 밖은 계속 멈춤):
 * 1) 종류가 AWS::Lambda::Permission
 * 2) 변경 상세가 모두 ChangeSource=ResourceAttribute이고, 원인이 다른 리소스의 Arn 참조("<논리 ID>.Arn")
 * 3) 그 원인 리소스가 같은 변경 세트에서 Replacement=False(제자리 수정이라 ARN이 그대로)
 */
function lambdaPermissionFollowsArn(c: ResourceChange, all: readonly ResourceChange[]): boolean {
  if (c.ResourceType !== "AWS::Lambda::Permission" || !c.Details?.length) return false;
  return c.Details.every((d) => {
    const m = d.ChangeSource === "ResourceAttribute" ? /^([A-Za-z0-9]+)\.Arn$/.exec(d.CausingEntity ?? "") : null;
    if (!m || m[1] === c.LogicalResourceId) return false;
    const cause = all.find((x) => x.LogicalResourceId === m[1]);
    return cause?.Action === "Modify" && cause.Replacement === "False";
  });
}

/** 멈춰야 하는 변경: 삭제, 확정 교체, 허용 목록 밖의 조건부 교체. all은 같은 변경 세트의 모든 변경(원인 리소스 확인용) */
export function isRisky(c: ResourceChange, all: readonly ResourceChange[] = []): boolean {
  if (c.Action === "Remove" || c.Replacement === "True") return true;
  if (c.Replacement !== "Conditional") return false;
  return !CONDITIONAL_OK.has(c.ResourceType) && !lambdaPermissionFollowsArn(c, all);
}
