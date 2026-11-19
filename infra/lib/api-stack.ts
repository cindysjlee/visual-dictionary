// 학습 진행·회원 탈퇴 API(6단계, FR-PRG, FR-AUTH-06, FR-DEP-03, NFR-01). docs/03 2.5
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod, HttpStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import type { IUserPool, IUserPoolClient } from "aws-cdk-lib/aws-cognito";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

/** 스테이지 기본 요청 제한: 한 사람이 상세 페이지를 넘기며 내는 요청은 초당 몇 건이다. 과제 규모에서 넉넉하고, 반복 호출로 비용이 커지는 것을 막는다(docs/03) */
export const API_THROTTLE = { rateLimit: 10, burstLimit: 20 };
/** 정리 Lambda 시간 제한. 큐의 가시성 시간은 이것의 6배(AWS 권장) */
const CLEANUP_TIMEOUT = Duration.seconds(30);

export type ApiStackProps = StackProps & { userPool: IUserPool; client: IUserPoolClient; termIds: string[] };

export class ApiStack extends Stack {
  readonly api: HttpApi;
  /** CloudFront가 /api/*를 보낼 오리진 도메인 */
  readonly apiDomain: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // 회원·용어 한 쌍에 기록 하나(키가 곧 제약). 탈퇴 표시도 같은 테이블의 termId "#deleted"(TTL 속성 ttl)
    const table = new Table(this, "LearningRecord", {
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "termId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 최근 본 용어(7단계): 같은 키 구조, 다시 보면 덮어쓰고 30일 뒤 TTL로 사라진다
    const recent = new Table(this, "RecentView", {
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "termId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 탈퇴 정리: 실패하면 큐가 다시 보내고(가시성 시간 뒤), 5번 실패하면 DLQ(14일 보관)
    const dlq = new Queue(this, "CleanupDlq", { retentionPeriod: Duration.days(14), enforceSSL: true });
    const queue = new Queue(this, "CleanupQueue", {
      visibilityTimeout: Duration.seconds(CLEANUP_TIMEOUT.toSeconds() * 6),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      enforceSSL: true,
    });
    new Alarm(this, "CleanupDlqAlarm", {
      alarmDescription: "탈퇴 정리 실패가 DLQ에 쌓임(기록 삭제가 안 된 사용자가 있음, docs/03 탈퇴 실패 표)",
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const entry = fileURLToPath(new URL("../../services/api/src/handlers.ts", import.meta.url));
    const fn = (name: string, handler: string, timeout = Duration.seconds(10)) =>
      new NodejsFunction(this, name, {
        entry,
        handler,
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: 256,
        timeout,
        // 로그는 14일만 보관한다. 토큰·이메일·본문은 남기지 않는다(handlers.ts)
        logGroup: new LogGroup(this, `${name}Logs`, { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        bundling: { minify: true, sourceMap: false }, // AWS SDK v3는 런타임에 있으므로 묶지 않는다(Node 22 기본)
        environment: { TABLE_NAME: table.tableName, ACTIVITY_TABLE_NAME: recent.tableName },
      });

    // 권한은 하는 일만큼만
    const progress = fn("ProgressFn", "progressHandler");
    progress.addEnvironment("TERM_IDS", props.termIds.join(","));
    table.grant(progress, "dynamodb:Query", "dynamodb:ConditionCheckItem", "dynamodb:PutItem");

    // 최근 본 용어: RecentView 조회·기록, 탈퇴 표시 확인(LearningRecord ConditionCheck)만
    const activity = fn("ActivityFn", "activityHandler");
    activity.addEnvironment("TERM_IDS", props.termIds.join(","));
    recent.grant(activity, "dynamodb:Query", "dynamodb:PutItem");
    table.grant(activity, "dynamodb:ConditionCheckItem");

    const account = fn("AccountFn", "accountHandler");
    account.addEnvironment("QUEUE_URL", queue.queueUrl);
    account.addEnvironment("USER_POOL_ID", props.userPool.userPoolId);
    table.grant(account, "dynamodb:PutItem", "dynamodb:DeleteItem");
    queue.grantSendMessages(account);
    account.addToRolePolicy(new PolicyStatement({ actions: ["cognito-idp:AdminDeleteUser"], resources: [props.userPool.userPoolArn] }));

    const cleanup = fn("CleanupFn", "cleanupHandler", CLEANUP_TIMEOUT);
    cleanup.addEnvironment("USER_POOL_ID", props.userPool.userPoolId);
    table.grant(cleanup, "dynamodb:Query", "dynamodb:BatchWriteItem");
    recent.grant(cleanup, "dynamodb:Query", "dynamodb:BatchWriteItem");
    cleanup.addToRolePolicy(new PolicyStatement({ actions: ["cognito-idp:AdminGetUser"], resources: [props.userPool.userPoolArn] }));
    cleanup.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }));

    // HTTP API: 모든 경로에 JWT 인가(Cognito 발급자 + 웹 클라이언트). CloudFront /api/*에서 같은 출처로 부르므로 CORS 없음
    const authorizer = new HttpJwtAuthorizer("CognitoJwt", `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`, {
      jwtAudience: [props.client.userPoolClientId],
    });
    this.api = new HttpApi(this, "Api", { createDefaultStage: false });
    new HttpStage(this, "DefaultStage", { httpApi: this.api, autoDeploy: true, throttle: API_THROTTLE });
    const progressIntegration = new HttpLambdaIntegration("ProgressIntegration", progress);
    this.api.addRoutes({ path: "/api/progress", methods: [HttpMethod.GET], integration: progressIntegration, authorizer });
    this.api.addRoutes({ path: "/api/progress/{termId}", methods: [HttpMethod.PUT], integration: progressIntegration, authorizer });
    const activityIntegration = new HttpLambdaIntegration("ActivityIntegration", activity);
    this.api.addRoutes({ path: "/api/activity", methods: [HttpMethod.GET], integration: activityIntegration, authorizer });
    this.api.addRoutes({ path: "/api/activity/{termId}", methods: [HttpMethod.PUT], integration: activityIntegration, authorizer });
    this.api.addRoutes({ path: "/api/account", methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration("AccountIntegration", account), authorizer });

    this.apiDomain = `${this.api.apiId}.execute-api.${this.region}.amazonaws.com`;
    new CfnOutput(this, "ApiDomain", { value: this.apiDomain });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "ActivityTableName", { value: recent.tableName });
    new CfnOutput(this, "CleanupDlqUrl", { value: dlq.queueUrl });
  }
}
