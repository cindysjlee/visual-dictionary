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

/**
 * 구역 줄의 앞뒤 위치. 앞뒤로 붙으면 위에서 내려다볼 때 서로 가리므로 넉넉히 띄운다.
 * between(사용자와 서버 사이의 길목)이 있으면 그 자리만큼 서버·사내망 줄을 뒤로 민다.
 * 서버·사내망 줄에 하나뿐이면 좌우로 비켜 놓는다(서버 왼쪽, 사내망 오른쪽): 모두 x=0이면 앞에서 볼 때 한 줄로 겹친다.
 * 길목이 하나면 바깥(공격자) 쪽으로 비켜 선다: 가운데면 브라우저 상자 뒤에 가려진다
 */
const ROW_Z = { client: 3, between: -1.8, server: -5.6, internal: -11.5 };
const OUTSIDE_X = 10.5;
const BETWEEN_DEPTH = 3;
/** 같은 줄에 둘 이상이면 하나 걸러 높이고(받침) 뒤로 물린다: 나란히 서면 이름·모양이 겹쳐 보인다 */
export const STAGGER = { y: 0.9, back: 1.4 };
const zoneRow = (zone: Zone, n: number, push: number): Vec3[] => {
  const lift = (i: number) => (n > 1 && i % 2 === 1 ? 1 : 0);
  switch (zone) {
    case "client":
      return spread(n, -(n - 1) * 3.5, (n - 1) * 3.5).map((x, i): Vec3 => [x, lift(i) * STAGGER.y, ROW_Z.client - lift(i) * STAGGER.back]);
    case "between":
      return (n === 1 ? [4.5] : spread(n, -(n - 1) * 3.4, (n - 1) * 3.4)).map((x, i): Vec3 => [x, lift(i) * STAGGER.y, ROW_Z.between - lift(i) * STAGGER.back]);
    case "server":
      return (n === 1 ? [-3.5] : spread(n, -6, 6)).map((x, i): Vec3 => [x, lift(i) * STAGGER.y, ROW_Z.server - push - lift(i) * STAGGER.back]);
    case "internal":
      return (n === 1 ? [3.5] : spread(n, -5, 5)).map((x, i): Vec3 => [x, lift(i) * STAGGER.y, ROW_Z.internal - push - lift(i) * STAGGER.back]);
    case "outside":
      return spread(n, 2.6, 2.6 - (n - 1) * 4.5).map((z, i): Vec3 => [OUTSIDE_X + lift(i) * STAGGER.back, lift(i) * STAGGER.y, z]);
  }
};

const anchorOf = (kind: ActorKind, [x, y, z]: Vec3): Vec3 => {
  switch (kind) {
    case "tab":
      return [x, y + 0.2, z + 0.5];
    case "cookieJar":
      return [x, y + 0.55, z];
    case "browser":
      return [x, y + 1.5, z + 1.4];
    case "attacker":
    case "person":
      return [x, y + 2.2, z];
    default:
      return [x, y + 1.5, z + 0.6];
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
      const [x, y, z] = position;
      // 검문소는 서버 앞(사용자 쪽)에 선다
      const gate = actor.gate
        ? { position: [x, y, z + 2.2] as Vec3, entry: [x, y + 1.15, z + 3.1] as Vec3, mid: [x, y + 1.15, z + 2.25] as Vec3 }
        : undefined;
      placed.set(actor.id, { id: actor.id, kind, zone, position, anchor: anchorOf(kind, position), gate });
    });
  }

  // 자식: 브라우저 안의 탭은 뒤쪽에 나란히, 보관함은 앞 가운데. 그 밖의 부모는 위로 쌓는다
  for (const parent of [...placed.values()]) {
    const children = actors.filter((a) => a.parent === parent.id);
    const [px, py, pz] = parent.position;
    const tabs = children.filter((c) => kindOf(c) === "tab");
    // 탭이 하나면 왼쪽 자리(가운데면 브라우저 이름 라벨과 겹친다)
    const tabX = tabs.length === 1 ? [px - 1.45] : spread(tabs.length, px - 1.45, px + 1.45);
    let stacked = 0;
    for (const child of children) {
      const kind = kindOf(child);
      let position: Vec3;
      if (parent.kind === "browser" && kind === "tab") position = [tabX[tabs.indexOf(child)]!, py + 1.55, pz - 0.3];
      else if (parent.kind === "browser" && kind === "cookieJar") position = [px, py + 0.25, pz + 0.85];
      else position = [px, py + 2.4 + 0.9 * stacked++, pz];
      placed.set(child.id, { id: child.id, kind, zone: parent.zone, position, anchor: anchorOf(kind, position), parent: parent.id });
    }
  }
  return placed;
}
