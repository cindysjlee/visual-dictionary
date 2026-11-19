// DynamoDB 저장소(LearningRecord: PK userId, SK termId). 탈퇴 표시는 같은 테이블의 termId "#deleted" 항목(TTL 속성 ttl)
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { ProgressRecord, ProgressRepo } from "./progress.ts";

export const MARKER = "#deleted";
/** 탈퇴 표시 유지 시간: 액세스 토큰(1시간)보다 길게 */
export const MARKER_TTL_SECONDS = 2 * 60 * 60;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const nowSec = () => Math.floor(Date.now() / 1000);

type Item = { userId: string; termId: string; read?: boolean; source?: ProgressRecord["source"]; updatedAt?: string; ttl?: number };

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

export const markWithdrawn = (table: string, userId: string) =>
  doc.send(new PutCommand({ TableName: table, Item: { userId, termId: MARKER, ttl: nowSec() + MARKER_TTL_SECONDS } })).then(() => undefined);

export const unmarkWithdrawn = (table: string, userId: string) =>
  doc.send(new DeleteCommand({ TableName: table, Key: { userId, termId: MARKER } })).then(() => undefined);

/** 학습 기록을 모두 지운다(탈퇴 표시는 남김). 처리 못 한 항목은 몇 번 다시 보내고, 그래도 남으면 던져서 큐가 재시도하게 한다 */
export async function deleteRecords(table: string, userId: string): Promise<number> {
  const keys = (await queryAll(table, userId)).filter((i) => !i.termId.startsWith("#")).map((i) => ({ userId, termId: i.termId }));
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
