// 자동 배포(GitHub Actions, FR-DEP-05, 7단계): AWS 키를 GitHub에 두지 않고 OIDC로 역할을 맡는다. docs/03 2.6
// 이 스택은 로컬에서 한 번만(사용자 승인 후) 배포한다. CI는 자기 역할을 바꾸지 못한다(app.ts가 githubRepo context가 있을 때만 이 스택을 넣는다)
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { OidcProviderNative, PolicyStatement, Role, WebIdentityPrincipal } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

const GITHUB_OIDC = "token.actions.githubusercontent.com";
/** CDK 부트스트랩 한정자(기본값). 부트스트랩 역할 이름에 들어간다 */
const QUALIFIER = "hnb659fds";

/** githubRepo: "소유자/저장소". 저장소 파일에 적지 않고 배포할 때 CDK context(-c githubRepo=…)로 넣는다 */
export type CiStackProps = StackProps & { githubRepo: string };

export class CiStack extends Stack {
  constructor(scope: Construct, id: string, props: CiStackProps) {
    super(scope, id, props);
    if (!/^[\w.-]+\/[\w.-]+$/.test(props.githubRepo)) throw new Error("githubRepo는 '소유자/저장소' 형식이어야 합니다");

    const provider = new OidcProviderNative(this, "GitHubOidc", { url: `https://${GITHUB_OIDC}`, clientIds: ["sts.amazonaws.com"] });

    // 신뢰: 이 저장소의 main 브랜치에서 실행된 워크플로만(정확히 일치, 와일드카드 없음). 다른 브랜치·풀 리퀘스트·포크는 맡을 수 없다
    const role = new Role(this, "DeployRole", {
      description: "GitHub Actions(main)에서 CDK 배포: 부트스트랩 역할 맡기와 배포 확인용 읽기만",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC}:aud`]: "sts.amazonaws.com",
          [`${GITHUB_OIDC}:sub`]: `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });

    // 실제 배포 권한은 CDK 부트스트랩 역할에 있다. CI 역할은 그 역할을 맡기만 한다(S3·CloudFormation·IAM을 직접 다루지 않음).
    // deploy: 변경 세트 만들기·실행, file-publishing: 웹·Lambda 묶음 업로드, lookup: diff. 이미지 자산은 없어 image-publishing은 뺀다
    role.addToPolicy(
      new PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: ["deploy", "file-publishing", "lookup"].map((r) => `arn:${this.partition}:iam::${this.account}:role/cdk-${QUALIFIER}-${r}-role-${this.account}-${this.region}`),
      }),
    );

    // 배포 관문(scripts/ci-gate.ts)과 배포 후 확인(scripts/check-aws.ts)용 읽기 권한. 이 프로젝트 리소스로 좁힐 수 있는 것은 좁힌다
    const arn = (service: string, resource: string, region = this.region) => `arn:${this.partition}:${service}:${region}:${this.account}:${resource}`;
    role.addToPolicy(
      new PolicyStatement({
        sid: "ReadProjectStacks",
        actions: ["cloudformation:DescribeStacks", "cloudformation:ListStackResources", "cloudformation:DescribeChangeSet"],
        resources: [arn("cloudformation", "stack/VisualDictionary*/*")],
      }),
    );
    role.addToPolicy(new PolicyStatement({ sid: "ReadApi", actions: ["apigateway:GET"], resources: [`arn:${this.partition}:apigateway:${this.region}::/apis/*`] }));
    role.addToPolicy(
      new PolicyStatement({ sid: "ReadTables", actions: ["dynamodb:DescribeTable", "dynamodb:DescribeTimeToLive"], resources: [arn("dynamodb", "table/VisualDictionaryApi-*")] }),
    );
    role.addToPolicy(new PolicyStatement({ sid: "ReadQueues", actions: ["sqs:GetQueueAttributes"], resources: [arn("sqs", "VisualDictionaryApi-*")] }));
    role.addToPolicy(new PolicyStatement({ sid: "ReadAlarms", actions: ["cloudwatch:DescribeAlarms"], resources: [arn("cloudwatch", "alarm:VisualDictionaryApi-*")] }));
    role.addToPolicy(new PolicyStatement({ sid: "ReadFunctions", actions: ["lambda:GetFunctionConfiguration"], resources: [arn("lambda", "function:VisualDictionaryApi-*")] }));
    role.addToPolicy(
      new PolicyStatement({
        sid: "ReadFunctionRoles",
        actions: ["iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:GetRolePolicy"],
        resources: [`arn:${this.partition}:iam::${this.account}:role/VisualDictionaryApi-*`],
      }),
    );
    role.addToPolicy(new PolicyStatement({ sid: "ReadLogGroups", actions: ["logs:DescribeLogGroups"], resources: [arn("logs", "log-group:*")] }));
    role.addToPolicy(
      new PolicyStatement({
        sid: "ReadCloudFront",
        actions: ["cloudfront:GetDistributionConfig", "cloudfront:DescribeFunction", "cloudfront:GetResponseHeadersPolicy"],
        resources: ["distribution/*", "function/*", "response-headers-policy/*"].map((r) => `arn:${this.partition}:cloudfront::${this.account}:${r}`),
      }),
    );
    role.addToPolicy(
      new PolicyStatement({ sid: "ReadUserPool", actions: ["cognito-idp:DescribeUserPool", "cognito-idp:DescribeUserPoolClient"], resources: [arn("cognito-idp", "userpool/*")] }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn, description: "GitHub 저장소 Secret AWS_DEPLOY_ROLE_ARN에 넣는다(저장소 파일에는 적지 않음)" });
  }
}
