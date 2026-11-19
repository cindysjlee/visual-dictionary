// 빌보드(모든 3D 장면 공통, docs/06 2절): 봉투·물건·도장·카드는 항상 카메라를 향한다
import { Vector3, type Camera, type Mesh, type Object3D, type PlaneGeometry } from "three";

/** 보이는 빌보드를 카메라 쪽으로 돌린다. userData.roll이 있으면 그 위에 기울기를 덧붙인다(튕겨 떨어지는 봉투) */
export function faceCamera(billboards: readonly Object3D[], camera: Camera) {
  for (const b of billboards) {
    if (!b.visible) continue;
    b.quaternion.copy(camera.quaternion);
    if (b.userData.roll) b.rotateZ(b.userData.roll as number);
  }
}

/** 카메라를 향한 판(도장·카드)이 화면에서 차지하는 사각형(px). 라벨이 피할 자리와 겹침 검사에 쓴다 */
export function billboardRect(m: Mesh, camera: Camera, width: number, height: number) {
  const geo = m.geometry as PlaneGeometry;
  const { width: w, height: h } = geo.parameters;
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar((w / 2) * m.scale.x);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar((h / 2) * m.scale.y);
  const pts = [right.clone().add(up), right.clone().sub(up), right.clone().negate().add(up), right.clone().negate().sub(up)].map((d) => {
    const p = m.position.clone().add(d).project(camera);
    return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height] as const;
  });
  return { l: Math.min(...pts.map((p) => p[0])), r: Math.max(...pts.map((p) => p[0])), t: Math.min(...pts.map((p) => p[1])), b: Math.max(...pts.map((p) => p[1])) };
}
