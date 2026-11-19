// Lambda 진입점 3개(infra/lib/api-stack.ts). 사용자 ID는 JWT 인가가 검증한 토큰의 sub에서만 읽는다(NFR-01).
// 로그에는 경로·상태 코드·오류 이름만 남긴다. 토큰·이메일·요청 본문·사용자 ID는 남기지 않는다(로그 보관 14일)
import { AdminDeleteUserCommand, AdminGetUserCommand, CognitoIdentityProviderClient, UserNotFoundException } from "@aws-sdk/client-cognito-identity-provider";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { withdraw } from "./account.ts";
import { getActivity, putActivity } from "./activity.ts";
import { cleanup } from "./cleanup.ts";
import { deleteActivity, deleteRecords, dynamoActivityRepo, dynamoProgressRepo, markWithdrawn, unmarkWithdrawn } from "./dynamo.ts";
import { getProgress, putProgress, type ApiResult } from "./progress.ts";

const env = (name: string) => process.env[name] ?? "";
const TABLE = env("TABLE_NAME");
const ACTIVITY_TABLE = env("ACTIVITY_TABLE_NAME");
/** 배포 때 published 용어 ID 목록을 넣는다(쉼표 구분). 이 목록에 있는 용어만 저장할 수 있다 */
const TERM_IDS = new Set(env("TERM_IDS").split(",").filter(Boolean));
const sqs = new SQSClient({});
const cognito = new CognitoIdentityProviderClient({});

const errorName = (e: unknown) => (e instanceof Error ? e.name : typeof e);
const log = (fields: Record<string, string | number>) => console.log(JSON.stringify(fields));

function respond(route: string, r: ApiResult): APIGatewayProxyResultV2 {
  log({ route, status: r.status });
  return {
    statusCode: r.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: r.body === undefined ? "" : JSON.stringify(r.body),
  };
}

const bodyOf = (e: APIGatewayProxyEventV2WithJWTAuthorizer) => (e.body && e.isBase64Encoded ? Buffer.from(e.body, "base64").toString("utf8") : e.body);

export async function progressHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const route = event.routeKey;
  const sub = String(event.requestContext.authorizer.jwt.claims.sub ?? "");
  try {
    if (!sub) return respond(route, { status: 401, body: { error: "no-subject" } });
    const repo = dynamoProgressRepo(TABLE);
    if (route === "GET /api/progress") return respond(route, await getProgress(sub, repo));
    if (route === "PUT /api/progress/{termId}") return respond(route, await putProgress(sub, event.pathParameters?.termId, bodyOf(event), TERM_IDS, repo));
    return respond(route, { status: 404, body: { error: "not-found" } });
  } catch (e) {
    log({ route, status: 500, error: errorName(e) });
    return respond(route, { status: 500, body: { error: "internal" } });
  }
}

export async function activityHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const route = event.routeKey;
  const sub = String(event.requestContext.authorizer.jwt.claims.sub ?? "");
  try {
    if (!sub) return respond(route, { status: 401, body: { error: "no-subject" } });
    const repo = dynamoActivityRepo(ACTIVITY_TABLE, TABLE);
    if (route === "GET /api/activity") return respond(route, await getActivity(sub, repo));
    if (route === "PUT /api/activity/{termId}") return respond(route, await putActivity(sub, event.pathParameters?.termId, bodyOf(event), TERM_IDS, repo));
    return respond(route, { status: 404, body: { error: "not-found" } });
  } catch (e) {
    log({ route, status: 500, error: errorName(e) });
    return respond(route, { status: 500, body: { error: "internal" } });
  }
}

export async function accountHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const route = event.routeKey;
  const claims = event.requestContext.authorizer.jwt.claims;
  const sub = String(claims.sub ?? "");
  // 이메일 로그인 풀에서 Cognito 사용자 이름은 sub와 같다(액세스 토큰의 username)
  const username = String(claims.username ?? sub);
  if (!sub) return respond(route, { status: 401, body: { error: "no-subject" } });
  const result = await withdraw(sub, username, {
    markWithdrawn: (u) => markWithdrawn(TABLE, u),
    unmarkWithdrawn: (u) => unmarkWithdrawn(TABLE, u),
    enqueueCleanup: async (job) => {
      await sqs.send(new SendMessageCommand({ QueueUrl: env("QUEUE_URL"), MessageBody: JSON.stringify(job) }));
    },
    deleteCognitoUser: async (name) => {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env("USER_POOL_ID"), Username: name }));
    },
    log: (stage, e) => log({ route, stage, error: errorName(e) }),
  });
  return respond(route, result);
}

export async function cleanupHandler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
  for (const record of event.Records) {
    try {
      const result = await cleanup(record.body, {
        cognitoUserExists: async (username) => {
          try {
            await cognito.send(new AdminGetUserCommand({ UserPoolId: env("USER_POOL_ID"), Username: username }));
            return true;
          } catch (e) {
            if (e instanceof UserNotFoundException) return false;
            throw e;
          }
        },
        deleteRecords: (userId) => deleteRecords(TABLE, userId),
        deleteActivity: (userId) => deleteActivity(ACTIVITY_TABLE, userId),
      });
      log({ route: "cleanup", result });
    } catch (e) {
      // 이 메시지만 다시 받는다(부분 실패 보고). 계속 실패하면 큐 설정대로 DLQ로 간다
      log({ route: "cleanup", status: 500, error: errorName(e) });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
