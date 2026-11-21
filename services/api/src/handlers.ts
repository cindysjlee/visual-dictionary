// Lambda 진입점 3개(infra/lib/api-stack.ts). 사용자 ID는 JWT 인가가 검증한 토큰의 sub에서만 읽는다(NFR-01).
// 로그에는 경로·상태 코드·오류 이름만 남긴다. 토큰·이메일·요청 본문·사용자 ID는 남기지 않는다(로그 보관 14일)
import { AdminDeleteUserCommand, AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersCommand, UserNotFoundException } from "@aws-sdk/client-cognito-identity-provider";
import { z } from "zod";
import { sweepOrphans } from "./orphans.ts";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { reauthFresh, withdraw } from "./account.ts";
import { getActivity, putActivity } from "./activity.ts";
import { cleanup } from "./cleanup.ts";
import { deleteActivity, deleteRecords, dynamoActivityRepo, dynamoProgressRepo, markWithdrawn, scanOwnedItems, unmarkWithdrawn } from "./dynamo.ts";
import { accessSubject, getProgress, putProgress, type ApiResult } from "./progress.ts";

const env = (name: string) => process.env[name] ?? "";
const TABLE = env("TABLE_NAME");
const ACTIVITY_TABLE = env("ACTIVITY_TABLE_NAME");
/** 배포 때 published 용어 ID 목록을 넣는다(쉼표 구분). 이 목록에 있는 용어만 저장할 수 있다 */
const TERM_IDS = new Set(env("TERM_IDS").split(",").filter(Boolean));
const sqs = new SQSClient({});
const cognito = new CognitoIdentityProviderClient({});

/** 탈퇴 정리 작업의 전달 지연(초). Cognito 삭제가 먼저 끝나게 한다(늦어져도 재시도·DLQ가 받친다) */
export const CLEANUP_DELAY_SECONDS = 10;
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
  // 액세스 토큰만 받는다(ID 토큰 거부, DF-50)
  const sub = accessSubject(event.requestContext.authorizer.jwt.claims);
  try {
    if (!sub) return respond(route, { status: 401, body: { error: "access-token-required" } });
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
  // 액세스 토큰만 받는다(ID 토큰 거부, DF-50)
  const sub = accessSubject(event.requestContext.authorizer.jwt.claims);
  try {
    if (!sub) return respond(route, { status: 401, body: { error: "access-token-required" } });
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
  // 액세스 토큰만 받는다(DF-50): ID 토큰에는 username이 없어 구글 사용자의 탈퇴가 잘못된 이름으로 진행될 수 있었다
  const sub = accessSubject(claims);
  if (!sub) return respond(route, { status: 401, body: { error: "access-token-required" } });
  const username = typeof claims.username === "string" && claims.username ? claims.username : null;
  if (!username) return respond(route, { status: 401, body: { error: "access-token-required" } });
  // 화면의 재확인만 믿지 않는다: API를 직접 불러도 최근 5분 안에 인증한 토큰이어야 한다
  if (!reauthFresh(claims.auth_time, Math.floor(Date.now() / 1000))) return respond(route, { status: 403, body: { error: "reauth-required" } });
  const result = await withdraw(sub, username, {
    markWithdrawn: (u) => markWithdrawn(TABLE, u),
    unmarkWithdrawn: (u) => unmarkWithdrawn(TABLE, u),
    enqueueCleanup: async (job) => {
      // 10초 늦게 전달: 큐에 넣은 다음 Cognito 사용자를 지우므로, 떠 있는 CleanupFn이 바로 받으면 사용자가 아직 있어 재시도(3분 뒤)로 밀린다
      await sqs.send(new SendMessageCommand({ QueueUrl: env("QUEUE_URL"), MessageBody: JSON.stringify(job), DelaySeconds: CLEANUP_DELAY_SECONDS }));
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

/** 고아 기록 정리(하루 한 번 Scheduler, smoke는 onlyUserIds로 자기 테스트 사용자만). 읽기와 정리 큐 넣기만 한다 */
const sweepEvent = z.object({ onlyUserIds: z.array(z.string().min(1).max(128)).min(1).max(10).optional() }).strict();

export async function orphanSweepHandler(event: unknown): Promise<{ status: string; orphans: number }> {
  const { onlyUserIds } = sweepEvent.parse(event ?? {});
  const result = await sweepOrphans(
    {
      scanItems: async () => [...(await scanOwnedItems(TABLE)), ...(await scanOwnedItems(ACTIVITY_TABLE))],
      listUserSubs: async () => {
        const subs = new Set<string>();
        let token: string | undefined;
        do {
          // sub만 읽는다(이메일 등은 받지 않음). ListUsers는 MAU에 잡히지 않는다(Cognito 할당량 문서)
          const out = await cognito.send(new ListUsersCommand({ UserPoolId: env("USER_POOL_ID"), AttributesToGet: ["sub"], Limit: 60, PaginationToken: token }));
          for (const u of out.Users ?? []) {
            const sub = u.Attributes?.find((a) => a.Name === "sub")?.Value;
            if (sub) subs.add(sub);
          }
          token = out.PaginationToken;
        } while (token);
        return subs;
      },
      enqueueCleanup: async (job) => {
        await sqs.send(new SendMessageCommand({ QueueUrl: env("QUEUE_URL"), MessageBody: JSON.stringify(job) }));
      },
    },
    onlyUserIds,
  );
  // sub는 로그에 남기지 않는다(개수만)
  log({ route: "orphan-sweep", status: result.status, orphans: result.orphans.length, ...(result.status === "aborted" ? { reason: result.reason } : {}) });
  if (result.status === "aborted") throw new Error(`orphan sweep aborted: ${result.reason}`); // Lambda 오류 → 경보
  return { status: result.status, orphans: result.orphans.length };
}
