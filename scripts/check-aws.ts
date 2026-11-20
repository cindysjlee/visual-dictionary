// 배포된 AWS 리소스 설정 확인: node scripts/check-aws.ts. 읽기 전용 명령(describe·get·list)만 쓴다(AWS CLI, 프로필 vd).
// 콘솔에서 보던 항목을 기대값과 비교한다: API 라우트·JWT 인가·요청 제한, 테이블, 정리 큐·DLQ·경보, Lambda 런타임·역할 권한·로그 보존,
// CloudFront 동작·함수·오류 페이지·CSP, Cognito 사용자 풀·앱 클라이언트, CI 배포 역할(신뢰 정책·권한), 고아 정리 권한·일정·경보. ARN은 계정 ID가 들어 있어 출력하지 않는다
import { execFileSync } from "node:child_process";
import { CSP, LOGIN_DOMAIN_PREFIX, SITE_ORIGIN } from "../infra/lib/csp.ts";

const OAUTH_CALLBACK = `${SITE_ORIGIN}/auth/callback`;
const OAUTH_LOGOUT = `${SITE_ORIGIN}/`;
/** 앱 클라이언트의 로그인 수단: 이메일(COGNITO)과 구글(8단계) */
const IDENTITY_PROVIDERS = ["COGNITO", "Google"] as const;

const REGION = "ap-northeast-2";
// CI(GitHub Actions)는 OIDC로 받은 환경 자격 증명을 쓴다. 로컬은 프로필 vd
const profileArgs = process.env.CI ? [] : ["--profile", process.env.AWS_PROFILE ?? "vd"];

/** 읽기 전용 AWS CLI 호출. 명령 이름이 describe·get·list로 시작하지 않으면 거부한다 */
function aws<T = Record<string, unknown>>(service: string, command: string, ...args: string[]): T {
  if (!/^(describe|get|list)-/.test(command)) throw new Error(`읽기 전용이 아닌 명령: ${service} ${command}`);
  const out = execFileSync("aws", [service, command, ...args, "--region", REGION, ...profileArgs, "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return (out.trim() ? JSON.parse(out) : {}) as T;
}

const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (xs: string[]) => [...xs].sort();

type StackResource = { LogicalResourceId: string; PhysicalResourceId: string; ResourceType: string };
const resources = (stack: string) =>
  aws<{ StackResourceSummaries: StackResource[] }>("cloudformation", "list-stack-resources", "--stack-name", stack).StackResourceSummaries;
const find = (list: StackResource[], type: string, logicalPrefix = "") => list.filter((r) => r.ResourceType === type && r.LogicalResourceId.startsWith(logicalPrefix));
const outputs = (stack: string) =>
  Object.fromEntries(
    aws<{ Stacks: { Outputs: { OutputKey: string; OutputValue: string }[] }[] }>("cloudformation", "describe-stacks", "--stack-name", stack).Stacks[0]!.Outputs.map((o) => [
      o.OutputKey,
      o.OutputValue,
    ]),
  );

const auth = outputs("VisualDictionaryAuth");
const apiOut = outputs("VisualDictionaryApi");
const apiRes = resources("VisualDictionaryApi");
const webRes = resources("VisualDictionaryWeb");

// ---------- API Gateway ----------
const apiId = apiOut.ApiDomain!.split(".")[0]!;
const routes = aws<{ Items: { RouteKey: string; AuthorizationType: string }[] }>("apigatewayv2", "get-routes", "--api-id", apiId).Items;
check(
  same(sorted(routes.map((r) => r.RouteKey)), ["DELETE /api/account", "GET /api/activity", "GET /api/progress", "PUT /api/activity/{termId}", "PUT /api/progress/{termId}"]),
  `API 라우트 5개: ${sorted(routes.map((r) => r.RouteKey)).join(", ")}`,
);
check(routes.every((r) => r.AuthorizationType === "JWT"), `모든 라우트 JWT 인가: ${routes.map((r) => r.AuthorizationType).join(", ")}`);
const authorizers = aws<{ Items: { AuthorizerType: string; JwtConfiguration?: { Issuer: string; Audience: string[] } }[] }>("apigatewayv2", "get-authorizers", "--api-id", apiId).Items;
const jwt = authorizers[0]?.JwtConfiguration;
check(
  authorizers.length === 1 &&
    authorizers[0]!.AuthorizerType === "JWT" &&
    jwt?.Issuer === `https://cognito-idp.${REGION}.amazonaws.com/${auth.UserPoolId}` &&
    same(jwt.Audience, [auth.UserPoolClientId]),
  "JWT 인가: 발급자 = 사용자 풀, 대상 = 웹 클라이언트",
);
const stage = aws<{ DefaultRouteSettings?: { ThrottlingRateLimit?: number; ThrottlingBurstLimit?: number } }>("apigatewayv2", "get-stage", "--api-id", apiId, "--stage-name", "$default");
check(
  stage.DefaultRouteSettings?.ThrottlingRateLimit === 10 && stage.DefaultRouteSettings?.ThrottlingBurstLimit === 20,
  `요청 제한: 초당 ${stage.DefaultRouteSettings?.ThrottlingRateLimit}, 버스트 ${stage.DefaultRouteSettings?.ThrottlingBurstLimit} (기대 10/20)`,
);

// ---------- DynamoDB(학습 기록·최근 본 용어) ----------
for (const [label, name] of [["학습 기록", apiOut.TableName!], ["최근 본 용어", apiOut.ActivityTableName!]] as const) {
const table = aws<{ Table: { KeySchema: { AttributeName: string; KeyType: string }[]; BillingModeSummary?: { BillingMode: string }; DeletionProtectionEnabled?: boolean } }>(
  "dynamodb",
  "describe-table",
  "--table-name",
  name,
).Table;
check(
  same(table.KeySchema, [
    { AttributeName: "userId", KeyType: "HASH" },
    { AttributeName: "termId", KeyType: "RANGE" },
  ]),
  `${label} 테이블 키: ${table.KeySchema.map((k) => `${k.AttributeName}(${k.KeyType})`).join(", ")}`,
);
check(table.BillingModeSummary?.BillingMode === "PAY_PER_REQUEST", `${label} 테이블 과금: ${table.BillingModeSummary?.BillingMode} (기대 온디맨드)`);
check(table.DeletionProtectionEnabled === true, `${label} 테이블 삭제 보호: ${table.DeletionProtectionEnabled}`);
const ttl = aws<{ TimeToLiveDescription: { TimeToLiveStatus: string; AttributeName?: string } }>("dynamodb", "describe-time-to-live", "--table-name", name).TimeToLiveDescription;
check(ttl.TimeToLiveStatus === "ENABLED" && ttl.AttributeName === "ttl", `${label} 테이블 TTL: ${ttl.TimeToLiveStatus} (${ttl.AttributeName ?? "-"})`);
}

// ---------- SQS ----------
const queueUrls = find(apiRes, "AWS::SQS::Queue").map((r) => r.PhysicalResourceId);
const dlqUrl = apiOut.CleanupDlqUrl!;
const mainUrl = queueUrls.find((u) => u !== dlqUrl)!;
const attrs = (url: string, ...names: string[]) =>
  aws<{ Attributes: Record<string, string> }>("sqs", "get-queue-attributes", "--queue-url", url, "--attribute-names", ...names).Attributes;
const main = attrs(mainUrl, "RedrivePolicy", "VisibilityTimeout");
const dlq = attrs(dlqUrl, "QueueArn", "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "MessageRetentionPeriod");
const redrive = JSON.parse(main.RedrivePolicy ?? "{}") as { deadLetterTargetArn?: string; maxReceiveCount?: number };
check(redrive.deadLetterTargetArn === dlq.QueueArn && Number(redrive.maxReceiveCount) === 5, `정리 큐 → DLQ 연결, 최대 수신 ${redrive.maxReceiveCount} (기대 5)`);
check(main.VisibilityTimeout === "180", `정리 큐 가시성 시간: ${main.VisibilityTimeout}초 (기대 180)`);
check(dlq.MessageRetentionPeriod === String(14 * 24 * 3600), `DLQ 보관: ${Number(dlq.MessageRetentionPeriod) / 86400}일 (기대 14)`);
check(dlq.ApproximateNumberOfMessages === "0" && dlq.ApproximateNumberOfMessagesNotVisible === "0", `DLQ 메시지: ${dlq.ApproximateNumberOfMessages} (처리 중 ${dlq.ApproximateNumberOfMessagesNotVisible})`);

// ---------- CloudWatch ----------
for (const [prefix, label] of [["CleanupDlqAlarm", "DLQ 경보"], ["OrphanSweepErrorsAlarm", "고아 정리 오류 경보"]] as const) {
  const alarmName = find(apiRes, "AWS::CloudWatch::Alarm", prefix)[0]?.PhysicalResourceId;
  const alarm = alarmName ? aws<{ MetricAlarms: { StateValue: string }[] }>("cloudwatch", "describe-alarms", "--alarm-names", alarmName).MetricAlarms[0] : undefined;
  check(alarm?.StateValue === "OK" || alarm?.StateValue === "INSUFFICIENT_DATA", `${label} 상태: ${alarm?.StateValue ?? "없음"} (ALARM이 아니면 통과)`);
}

// ---------- Lambda·IAM·로그 ----------
/** 함수별 허용 권한(인프라 테스트와 같은 범위). required는 반드시 있어야 하는 것 */
const EXPECTED: Record<string, { required: string[]; allowed: string[] }> = {
  ProgressFn: { required: ["dynamodb:ConditionCheckItem", "dynamodb:PutItem", "dynamodb:Query"], allowed: [] },
  ActivityFn: { required: ["dynamodb:ConditionCheckItem", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"], allowed: [] },
  AccountFn: {
    required: ["cognito-idp:AdminDeleteUser", "dynamodb:DeleteItem", "dynamodb:PutItem", "sqs:SendMessage"],
    allowed: ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
  },
  CleanupFn: {
    required: ["cognito-idp:AdminGetUser", "dynamodb:BatchWriteItem", "dynamodb:Query", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
    allowed: ["sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
  },
  // 고아 기록 정리: 읽기와 정리 큐 넣기만(삭제 없음)
  OrphanSweepFn: { required: ["cognito-idp:ListUsers", "dynamodb:Scan", "sqs:SendMessage"], allowed: ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"] },
};
for (const [prefix, expected] of Object.entries(EXPECTED)) {
  const fn = find(apiRes, "AWS::Lambda::Function", prefix)[0]!.PhysicalResourceId;
  const conf = aws<{ Runtime: string; Architectures: string[]; Role: string }>("lambda", "get-function-configuration", "--function-name", fn);
  check(conf.Runtime === "nodejs22.x" && same(conf.Architectures, ["arm64"]), `${prefix}: ${conf.Runtime}, ${conf.Architectures.join(",")}`);
  const roleName = conf.Role.split("/").pop()!;
  const managed = aws<{ AttachedPolicies: { PolicyName: string }[] }>("iam", "list-attached-role-policies", "--role-name", roleName).AttachedPolicies.map((p) => p.PolicyName);
  const inline = aws<{ PolicyNames: string[] }>("iam", "list-role-policies", "--role-name", roleName).PolicyNames;
  const actions = inline.flatMap((name) => {
    const doc = aws<{ PolicyDocument: { Statement: { Effect: string; Action: string | string[] }[] } }>("iam", "get-role-policy", "--role-name", roleName, "--policy-name", name).PolicyDocument;
    return doc.Statement.filter((s) => s.Effect === "Allow").flatMap((s) => [s.Action].flat());
  });
  const missing = expected.required.filter((a) => !actions.includes(a));
  const extra = actions.filter((a) => !expected.required.includes(a) && !expected.allowed.includes(a));
  check(same(managed, ["AWSLambdaBasicExecutionRole"]), `${prefix} 관리형 정책: ${managed.join(", ") || "없음"} (기대 AWSLambdaBasicExecutionRole만)`);
  check(
    !missing.length && !extra.length && !actions.some((a) => a.includes("*")),
    `${prefix} 권한: ${sorted([...new Set(actions)]).join(", ")}${missing.length ? ` / 없음: ${missing.join(", ")}` : ""}${extra.length ? ` / 범위 밖: ${extra.join(", ")}` : ""}`,
  );
}
for (const lg of find(apiRes, "AWS::Logs::LogGroup")) {
  const groups = aws<{ logGroups: { logGroupName: string; retentionInDays?: number }[] }>("logs", "describe-log-groups", "--log-group-name-prefix", lg.PhysicalResourceId).logGroups;
  const g = groups.find((x) => x.logGroupName === lg.PhysicalResourceId);
  check(g?.retentionInDays === 14, `로그 보존 ${lg.LogicalResourceId.replace(/Logs.*/, "")}: ${g?.retentionInDays ?? "무기한"}일 (기대 14)`);
}

// ---------- 고아 기록 정리 일정(EventBridge Scheduler) ----------
// CI 안에서는 건너뛴다: CI 역할에는 Scheduler 읽기 권한이 없고 이 검사를 위해 넓히지 않는다
if (process.env.CI) console.log("건너뜀  고아 정리 일정(CI 역할은 Scheduler를 읽지 않음)");
else {
  const scheduleName = find(apiRes, "AWS::Scheduler::Schedule")[0]?.PhysicalResourceId;
  const schedule = scheduleName
    ? aws<{ State: string; ScheduleExpression: string; ScheduleExpressionTimezone: string }>("scheduler", "get-schedule", "--name", scheduleName)
    : undefined;
  check(
    schedule?.State === "ENABLED" && schedule.ScheduleExpression === "cron(0 3 * * ? *)" && schedule.ScheduleExpressionTimezone === "Asia/Seoul",
    `고아 정리 일정: ${schedule ? `${schedule.State}, ${schedule.ScheduleExpression} ${schedule.ScheduleExpressionTimezone}` : "없음"} (기대 매일 03:00 서울)`,
  );
}

// ---------- CloudFront ----------
const distId = find(webRes, "AWS::CloudFront::Distribution")[0]!.PhysicalResourceId;
type Behavior = {
  PathPattern?: string;
  ViewerProtocolPolicy: string;
  CachePolicyId?: string;
  OriginRequestPolicyId?: string;
  ResponseHeadersPolicyId?: string;
  AllowedMethods: { Items: string[] };
  FunctionAssociations: { Quantity: number; Items?: { EventType: string; FunctionARN: string }[] };
};
const dist = aws<{
  DistributionConfig: { DefaultCacheBehavior: Behavior; CacheBehaviors: { Items?: Behavior[] }; CustomErrorResponses: { Quantity: number } };
}>("cloudfront", "get-distribution-config", "--id", distId).DistributionConfig;
const fnName = find(webRes, "AWS::CloudFront::Function")[0]!.PhysicalResourceId.split("/").pop()!;
const assoc = dist.DefaultCacheBehavior.FunctionAssociations.Items ?? [];
check(
  assoc.length === 1 && assoc[0]!.EventType === "viewer-request" && assoc[0]!.FunctionARN.endsWith(`:function/${fnName}`),
  `기본 동작: viewer-request 함수 ${assoc.length}개(SPA 라우팅)`,
);
check(dist.DefaultCacheBehavior.ViewerProtocolPolicy === "redirect-to-https", `기본 동작 프로토콜: ${dist.DefaultCacheBehavior.ViewerProtocolPolicy}`);
const apiBehavior = dist.CacheBehaviors.Items?.find((b) => b.PathPattern === "/api/*");
check(
  apiBehavior?.CachePolicyId === "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" &&
    apiBehavior.OriginRequestPolicyId === "b689b0a8-53d0-40ab-baf2-68738e2966ac" &&
    apiBehavior.ViewerProtocolPolicy === "https-only" &&
    apiBehavior.AllowedMethods.Items.length === 7 &&
    apiBehavior.ResponseHeadersPolicyId === dist.DefaultCacheBehavior.ResponseHeadersPolicyId,
  "/api/* 동작: 캐시 끔(CachingDisabled), Host 제외 헤더 전달(AllViewerExceptHostHeader), HTTPS만, 모든 메서드, 같은 보안 헤더",
);
check(dist.CustomErrorResponses.Quantity === 0, `오류 페이지(대체 응답): ${dist.CustomErrorResponses.Quantity}개 (기대 0)`);
const cfFn = aws<{ FunctionSummary: { FunctionConfig: { Runtime: string }; FunctionMetadata: { Stage: string } } }>("cloudfront", "describe-function", "--name", fnName, "--stage", "LIVE").FunctionSummary;
check(cfFn.FunctionConfig.Runtime === "cloudfront-js-2.0" && cfFn.FunctionMetadata.Stage === "LIVE", `SPA 함수: ${cfFn.FunctionConfig.Runtime}, ${cfFn.FunctionMetadata.Stage}`);
const headers = aws<{ ResponseHeadersPolicy: { ResponseHeadersPolicyConfig: { SecurityHeadersConfig: { ContentSecurityPolicy?: { ContentSecurityPolicy: string } } } } }>(
  "cloudfront",
  "get-response-headers-policy",
  "--id",
  dist.DefaultCacheBehavior.ResponseHeadersPolicyId!,
).ResponseHeadersPolicy.ResponseHeadersPolicyConfig.SecurityHeadersConfig;
check(headers.ContentSecurityPolicy?.ContentSecurityPolicy === CSP, "응답 헤더 정책 CSP = infra/lib/csp.ts");

// ---------- Cognito ----------
type Pool = {
  UserPoolTier?: string;
  Domain?: string;
  DeletionProtection?: string;
  MfaConfiguration?: string;
  UsernameAttributes?: string[];
  AutoVerifiedAttributes?: string[];
  Policies: { PasswordPolicy: { MinimumLength: number; RequireNumbers: boolean; RequireLowercase: boolean; RequireUppercase: boolean; RequireSymbols: boolean } };
  AccountRecoverySetting?: { RecoveryMechanisms: { Name: string }[] };
  EmailConfiguration?: { EmailSendingAccount?: string };
};
const pool = aws<{ UserPool: Pool }>("cognito-idp", "describe-user-pool", "--user-pool-id", auth.UserPoolId!).UserPool;
const pw = pool.Policies.PasswordPolicy;
check(pool.UserPoolTier === "ESSENTIALS", `사용자 풀 등급: ${pool.UserPoolTier} (기대 ESSENTIALS: managed login의 prompt)`);
check(pool.Domain === LOGIN_DOMAIN_PREFIX, `로그인 도메인 접두어: ${pool.Domain} (기대 ${LOGIN_DOMAIN_PREFIX})`);
check(pool.DeletionProtection === "ACTIVE", `사용자 풀 삭제 보호: ${pool.DeletionProtection}`);
check(pool.MfaConfiguration === "OFF", `MFA: ${pool.MfaConfiguration}`);
check(same(pool.UsernameAttributes, ["email"]) && same(pool.AutoVerifiedAttributes, ["email"]), "이메일 로그인·이메일 자동 인증");
check(
  pw.MinimumLength === 8 && pw.RequireNumbers && !pw.RequireLowercase && !pw.RequireUppercase && !pw.RequireSymbols,
  `비밀번호 정책: ${pw.MinimumLength}자, 숫자 ${pw.RequireNumbers} (기대 8자+숫자)`,
);
check(same(pool.AccountRecoverySetting?.RecoveryMechanisms.map((m) => m.Name), ["verified_email"]), "계정 복구: 이메일만");
check(pool.EmailConfiguration?.EmailSendingAccount === "COGNITO_DEFAULT", `메일 발송: ${pool.EmailConfiguration?.EmailSendingAccount}`);
const client = aws<{
  UserPoolClient: {
    ExplicitAuthFlows: string[];
    ClientSecret?: string;
    PreventUserExistenceErrors?: string;
    EnableTokenRevocation?: boolean;
    AccessTokenValidity?: number;
    IdTokenValidity?: number;
    RefreshTokenValidity?: number;
    TokenValidityUnits?: Record<string, string>;
    AllowedOAuthFlows?: string[];
    AllowedOAuthScopes?: string[];
    CallbackURLs?: string[];
    LogoutURLs?: string[];
    SupportedIdentityProviders?: string[];
  };
}>("cognito-idp", "describe-user-pool-client", "--user-pool-id", auth.UserPoolId!, "--client-id", auth.UserPoolClientId!).UserPoolClient;
check(same(sorted(client.ExplicitAuthFlows), ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]), `앱 클라이언트 인증 흐름: ${sorted(client.ExplicitAuthFlows).join(", ")}`);
check(!client.ClientSecret && client.PreventUserExistenceErrors === "ENABLED" && client.EnableTokenRevocation === true, "앱 클라이언트: 비밀 없음, 존재 노출 방지, 토큰 취소");
check(
  client.AccessTokenValidity === 60 && client.IdTokenValidity === 60 && client.RefreshTokenValidity === 43200 && client.TokenValidityUnits?.RefreshToken === "minutes",
  `토큰 유효 시간(분): 액세스 ${client.AccessTokenValidity}, ID ${client.IdTokenValidity}, 리프레시 ${client.RefreshTokenValidity} (기대 60/60/43200=30일)`,
);
// OAuth: 인가 코드만(implicit 없음), 콜백·로그아웃은 이 사이트 주소만(CDK 기본 https://example.com 없음)
check(
  same(client.AllowedOAuthFlows, ["code"]) && same(client.CallbackURLs, [OAUTH_CALLBACK]) && same(client.LogoutURLs, [OAUTH_LOGOUT]),
  `앱 클라이언트 OAuth: 흐름 ${client.AllowedOAuthFlows?.join(",")}, 콜백 ${client.CallbackURLs?.join(",")}, 로그아웃 ${client.LogoutURLs?.join(",")}`,
);
check(
  same(sorted(client.AllowedOAuthScopes ?? []), ["email", "openid", "profile"]),
  `앱 클라이언트 OAuth 범위: ${sorted(client.AllowedOAuthScopes ?? []).join(", ")} (사용자 관리 범위 없음)`,
);
check(same(sorted(client.SupportedIdentityProviders ?? []), [...IDENTITY_PROVIDERS]), `로그인 수단: ${sorted(client.SupportedIdentityProviders ?? []).join(", ")}`);

// ---------- CI 배포 역할(GitHub OIDC, docs/03 2.6) ----------
// CI 안에서는 건너뛴다: CI 역할은 자기 역할을 읽는 권한(iam:GetRole)이 없고, 이 검사를 위해 넓히지 않는다
const ciRes = process.env.CI ? undefined : (() => {
  try {
    return resources("VisualDictionaryCi");
  } catch {
    return undefined; // 아직 배포 안 됨
  }
})();
if (ciRes) {
  // 기대 저장소는 파일에 적지 않고 git remote에서 읽는다
  const repo = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim().replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
  const roleName = find(ciRes, "AWS::IAM::Role", "DeployRole")[0]!.PhysicalResourceId;
  type Stmt = { Effect: string; Action: string | string[]; Resource?: string | string[]; Principal?: { Federated?: string }; Condition?: Record<string, Record<string, string>> };
  const role = aws<{ Role: { MaxSessionDuration: number; AssumeRolePolicyDocument: { Statement: Stmt[] } } }>("iam", "get-role", "--role-name", roleName).Role;
  const trust = role.AssumeRolePolicyDocument.Statement;
  const t = trust[0];
  check(
    trust.length === 1 && t!.Effect === "Allow" && t!.Action === "sts:AssumeRoleWithWebIdentity" && !!t!.Principal?.Federated?.endsWith(":oidc-provider/token.actions.githubusercontent.com"),
    "CI 역할 신뢰: GitHub OIDC 공급자(Federated)만, sts:AssumeRoleWithWebIdentity",
  );
  check(
    same(Object.keys(t?.Condition ?? {}), ["StringEquals"]) &&
      // IAM이 돌려주는 조건 키 순서는 호출마다 다를 수 있어 정렬해서 비교한다
      same(Object.keys(t!.Condition!.StringEquals!).sort(), ["token.actions.githubusercontent.com:aud", "token.actions.githubusercontent.com:sub"]) &&
      t!.Condition!.StringEquals!["token.actions.githubusercontent.com:aud"] === "sts.amazonaws.com" &&
      // 변하지 않는 sub면 소유자·저장소 뒤에 @숫자 ID가 붙는다. 이름은 git remote와 정확히 같아야 한다
      new RegExp(`^repo:${repo.split("/")[0]}(@\\d+)?/${repo.split("/")[1]}(@\\d+)?:ref:refs/heads/main$`).test(t!.Condition!.StringEquals!["token.actions.githubusercontent.com:sub"]!),
    `CI 역할 조건: StringEquals만, aud = sts.amazonaws.com, sub = ${t?.Condition?.StringEquals?.["token.actions.githubusercontent.com:sub"]} (${repo}의 main, 와일드카드 없음)`,
  );
  check(role.MaxSessionDuration <= 3600, `CI 역할 최대 세션: ${role.MaxSessionDuration}초 (기대 3600 이하)`);
  const managed = aws<{ AttachedPolicies: unknown[] }>("iam", "list-attached-role-policies", "--role-name", roleName).AttachedPolicies;
  const stmts = aws<{ PolicyNames: string[] }>("iam", "list-role-policies", "--role-name", roleName).PolicyNames.flatMap(
    (name) => aws<{ PolicyDocument: { Statement: Stmt[] } }>("iam", "get-role-policy", "--role-name", roleName, "--policy-name", name).PolicyDocument.Statement,
  );
  const actions = stmts.flatMap((s) => [s.Action].flat());
  const assume = stmts.filter((s) => [s.Action].flat().includes("sts:AssumeRole"));
  const bootstrap = ["deploy", "file-publishing", "lookup"].map((r) => new RegExp(`^arn:aws:iam::(\\d{12}):role/cdk-hnb659fds-${r}-role-\\1-${REGION}$`));
  const assumeTargets = assume.flatMap((s) => [s.Resource ?? []].flat());
  check(
    assume.length === 1 && same([assume[0]!.Action].flat(), ["sts:AssumeRole"]) && assumeTargets.length === 3 && bootstrap.every((re) => assumeTargets.some((a) => re.test(a))),
    "CI 역할 sts:AssumeRole: cdk-hnb659fds deploy·file-publishing·lookup 역할 3개만(이 계정·서울)",
  );
  // IAM 동작 이름은 대소문자를 가리지 않는다(apigateway:GET = 읽기)
  const others = actions.filter((a) => a !== "sts:AssumeRole");
  const notRead = others.filter((a) => !/^[\w-]+:(describe|get|list)/i.test(a));
  check(!managed.length && stmts.every((s) => s.Effect === "Allow") && !notRead.length, `CI 역할 나머지 권한은 읽기만(Describe·Get·List)${notRead.length ? ` / 범위 밖: ${notRead.join(", ")}` : ""}, 관리형 정책 ${managed.length}개`);
  const forbidden = actions.filter((a) => a === "*" || /^(iam:(PassRole|Create|Put|Attach)|s3:(Put|Delete)|dynamodb:Delete|cognito-idp:Admin)/i.test(a) || a.endsWith(":*"));
  check(!forbidden.length && !stmts.some((s) => [s.Resource ?? []].flat().includes("*")), `CI 역할 금지 권한 없음(PassRole·IAM 쓰기·S3 쓰기·삭제·Admin·*)${forbidden.length ? `: ${forbidden.join(", ")}` : ""}`);
} else console.log(process.env.CI ? "건너뜀  CI 역할 검사(CI 안에서는 자기 역할을 읽지 않음)" : "건너뜀  CI 역할 검사(VisualDictionaryCi 스택 없음)");

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `check:aws 실패 ${failed}건` : `check:aws 통과 ${results.length}건 (읽기 전용 명령만 사용)`);
process.exit(failed ? 1 : 0);
