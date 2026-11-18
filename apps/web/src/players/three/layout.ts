// zone·parent로 행위자 좌표를 자동으로 정한다(JSON에 좌표를 쓰지 않는다, docs/06 3절). 기준 배치는 시안(docs/06 2절)
import type { Actor, ActorKind, Zone } from "@app/content-schema";
import { kindOf, zoneOf } from "@app/content-schema/scene";

export type Vec3 = [number, number, number];

export type Placed = {
  id: string;
  kind: ActorKind;
  zone: Zone;
  position: Vec3; // 바닥 기준 위치
  anchor: Vec3; // 봉투·물건이 닿는 점
  parent?: string;
  gate?: { position: Vec3; entry: Vec3; mid: Vec3 }; // 검문소와 그 앞·가운데 점
};

export const BROWSER_SIZE: Vec3 = [6, 3, 2.8];

const spread = (n: number, min: number, max: number): number[] =>
  n === 0 ? [] : n === 1 ? [(min + max) / 2] : Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));

/** between(사용자와 서버 사이의 길목)이 있으면 그 자리만큼 서버·사내망 줄을 뒤로 민다 */
const BETWEEN_DEPTH = 2.6;
const zoneRow = (zone: Zone, n: number, push: number): Vec3[] => {
  switch (zone) {
    case "client":
      return spread(n, -(n - 1) * 3.5, (n - 1) * 3.5).map((x): Vec3 => [x, 0, 2.2]);
    case "between":
      return spread(n, -(n - 1) * 3, (n - 1) * 3).map((x): Vec3 => [x, 0, -1.2]);
    case "server":
      return spread(n, -5, 5).map((x): Vec3 => [x, 0, -4.2 - push]);
    case "internal":
      return spread(n, -4, 4).map((x): Vec3 => [x, 0, -9.5 - push]);
    case "outside":
      return spread(n, 1.6, 1.6 - (n - 1) * 4).map((z): Vec3 => [8.6, 0, z]);
  }
};

const anchorOf = (kind: ActorKind, [x, y, z]: Vec3): Vec3 => {
  switch (kind) {
    case "tab":
      return [x, y + 0.2, z + 0.5];
    case "cookieJar":
      return [x, y + 0.55, z];
    case "browser":
      return [x, 1.5, z + 1.4];
    case "attacker":
    case "person":
      return [x, 2.2, z];
    default:
      return [x, 1.5, z + 0.6];
  }
};

export function layoutScene(actors: readonly Actor[]): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const roots = actors.filter((a) => !a.parent || !actors.some((p) => p.id === a.parent));

  const push = roots.some((a) => zoneOf(a, actors) === "between") ? BETWEEN_DEPTH : 0;
  for (const zone of ["client", "between", "server", "internal", "outside"] as const) {
    const inZone = roots.filter((a) => zoneOf(a, actors) === zone);
    zoneRow(zone, inZone.length, push).forEach((position, i) => {
      const actor = inZone[i]!;
      const kind = kindOf(actor);
      const [x, , z] = position;
      // 검문소는 서버 앞(사용자 쪽)에 선다
      const gate = actor.gate
        ? { position: [x, 0, z + 2.2] as Vec3, entry: [x, 1.15, z + 3.1] as Vec3, mid: [x, 1.15, z + 2.25] as Vec3 }
        : undefined;
      placed.set(actor.id, { id: actor.id, kind, zone, position, anchor: anchorOf(kind, position), gate });
    });
  }

  // 자식: 브라우저 안의 탭은 뒤쪽에 나란히, 보관함은 앞 가운데. 그 밖의 부모는 위로 쌓는다
  for (const parent of [...placed.values()]) {
    const children = actors.filter((a) => a.parent === parent.id);
    const [px, , pz] = parent.position;
    const tabs = children.filter((c) => kindOf(c) === "tab");
    const tabX = spread(tabs.length, px - 1.45, px + 1.45);
    let stacked = 0;
    for (const child of children) {
      const kind = kindOf(child);
      let position: Vec3;
      if (parent.kind === "browser" && kind === "tab") position = [tabX[tabs.indexOf(child)]!, 1.55, pz - 0.3];
      else if (parent.kind === "browser" && kind === "cookieJar") position = [px, 0.25, pz + 0.85];
      else position = [px, 2.4 + 0.9 * stacked++, pz];
      placed.set(child.id, { id: child.id, kind, zone: parent.zone, position, anchor: anchorOf(kind, position), parent: parent.id });
    }
  }
  return placed;
}
