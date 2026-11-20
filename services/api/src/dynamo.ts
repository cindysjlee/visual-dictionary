// DynamoDB 저장소(LearningRecord: PK userId, SK termId). 탈퇴 표시는 같은 테이블의 termId "#deleted" 항목(TTL 속성 ttl)
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { VIEW_TTL_DAYS, type ActivityRepo } from "./activity.ts";
import type { ProgressRecord, ProgressRepo } from "./progress.ts";

export const MARKER = "#deleted";
/** 탈퇴 표시 유지 시간: 액세스 토큰(1시간)보다 길게 */
export const MARKER_TTL_SECONDS = 2 * 60 * 60;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const nowSec = () => Math.floor(Date.now() / 1000);

type Item = { userId: string; termId: string; read?: boolean; source?: ProgressRecord["source"]; updatedAt?: string; viewedAt?: string; ttl?: number };

async function queryAll(table: string, userId: string): Promise<Item[]> {
  const items: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const out = await doc.send(
      new QueryCommand({ TableName: table, KeyConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": userId }, ExclusiveStartKey: start }),
    );
    items.push(...((out.Items ?? []) as Item[]));
    start = out.LastEvaluatedKey;
  } while (start);
  return items;
}

const isLiveMarker = (i: Item) => i.termId === MARKER && (i.ttl ?? 0) > nowSec();

export function dynamoProgressRepo(table: string): ProgressRepo {
  return {
    async list(userId) {
      const items = await queryAll(table, userId);
      return {
        withdrawn: items.some(isLiveMarker),
        records: items
          .filter((i) => !i.termId.startsWith("#"))
          .map((i) => ({ termId: i.termId, read: Boolean(i.read), source: i.source ?? "manual", updatedAt: i.updatedAt ?? "" })),
      };
    },
    async put(userId, record) {
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                // 탈퇴 표시가 없거나(또는 TTL이 지났는데 아직 안 지워졌거나) 할 때만 저장한다
                ConditionCheck: {
                  TableName: table,
                  Key: { userId, termId: MARKER },
                  ConditionExpression: "attribute_not_exists(userId) OR #ttl < :now",
                  ExpressionAttributeNames: { "#ttl": "ttl" },
                  ExpressionAttributeValues: { ":now": nowSec() },
                },
              },
              { Put: { TableName: table, Item: { userId, ...record } } },
            ],
          }),
        );
        return "saved";
      } catch (e) {
        if (e instanceof TransactionCanceledException && e.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") return "withdrawn";
        throw e;
      }
    },
  };
}

/** 탈퇴 표시가 없거나 TTL이 지났을 때만 통과하는 조건(LearningRecord "#deleted"). 학습 기록·최근 본 용어 저장이 같이 쓴다 */
const notWithdrawn = (progressTable: string, userId: string) => ({
  ConditionCheck: {
    TableName: progressTable,
    Key: { userId, termId: MARKER },
    ConditionExpression: "attribute_not_exists(userId) OR #ttl < :now",
    ExpressionAttributeNames: { "#ttl": "ttl" },
    ExpressionAttributeValues: { ":now": nowSec() },
  },
});
const isWithdrawnCancel = (e: unknown) => e instanceof TransactionCanceledException && e.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed";

/** 최근 본 용어(RecentView: PK userId, SK termId, viewedAt, ttl 30일). 저장은 두 테이블 트랜잭션: 탈퇴 표시 확인 + 기록 */
export function dynamoActivityRepo(activityTable: string, progressTable: string): ActivityRepo {
  return {
    async list(userId) {
      // 학습 기록 전체가 아니라 탈퇴 표시 하나만 읽는다(ActivityFn 권한은 GetItem만)
      const [views, marker] = await Promise.all([
        queryAll(activityTable, userId),
        doc.send(new GetCommand({ TableName: progressTable, Key: { userId, termId: MARKER } })).then((r) => r.Item as Item | undefined),
      ]);
      return {
        withdrawn: !!marker && isLiveMarker(marker),
        views: views.filter((i) => (i.ttl ?? 0) > nowSec()).map((i) => ({ termId: i.termId, viewedAt: i.viewedAt ?? "" })),
      };
    },
    async put(userId, view) {
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              notWithdrawn(progressTable, userId),
              { Put: { TableName: activityTable, Item: { userId, ...view, ttl: nowSec() + VIEW_TTL_DAYS * 24 * 60 * 60 } } },
            ],
          }),
        );
        return "saved";
      } catch (e) {
        if (isWithdrawnCancel(e)) return "withdrawn";
        throw e;
      }
    },
  };
}

export const markWithdrawn = (table: string, userId: string) =>
  doc.send(new PutCommand({ TableName: table, Item: { userId, termId: MARKER, ttl: nowSec() + MARKER_TTL_SECONDS } })).then(() => undefined);

export const unmarkWithdrawn = (table: string, userId: string) =>
  doc.send(new DeleteCommand({ TableName: table, Key: { userId, termId: MARKER } })).then(() => undefined);

/** 학습 기록을 모두 지운다(탈퇴 표시는 남김) */
export const deleteRecords = (table: string, userId: string) => deleteAll(table, userId, (termId) => !termId.startsWith("#"));
/** 최근 본 용어를 모두 지운다 */
export const deleteActivity = (table: string, userId: string) => deleteAll(table, userId, () => true);

/** 그 사용자의 항목을 일괄 삭제. 처리 못 한 항목은 몇 번 다시 보내고, 그래도 남으면 던져서 큐가 재시도하게 한다 */
async function deleteAll(table: string, userId: string, keep: (termId: string) => boolean): Promise<number> {
  const keys = (await queryAll(table, userId)).filter((i) => keep(i.termId)).map((i) => ({ userId, termId: i.termId }));
  for (let k = 0; k < keys.length; k += 25) {
    let pending = keys.slice(k, k + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const out = await doc.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
      pending = (out.UnprocessedItems?.[table] ?? []) as typeof pending;
    }
    if (pending.length) throw new Error(`unprocessed deletes: ${pending.length}`);
  }
  return keys.length;
}
