// 가림 자동 투명(모든 3D 장면 공통, docs/06 2절): 카메라 → 목표 점들을 막는 물체만 서서히 흐리게, 안 막으면 원래대로.
// 물체 메시는 userData.actor(어느 행위자 것인지)를 가진다. 이 단계의 등장 행위자 자신은 흐리지 않는다(보여 줘야 할 것)
import { Raycaster, type Camera, type Material, type Mesh, type Vector3 } from "three";

export class Occlusion {
  private ray = new Raycaster();

  /** dt초만큼 투명도를 목표 쪽으로. 아직 바뀌는 중이면 true(그리기를 멈추지 않게) */
  update(camera: Camera, occluders: readonly Mesh[], goals: readonly Vector3[], shown: ReadonlySet<string>, dt: number): boolean {
    const hit = new Set<Material>();
    for (const goal of goals) {
      const dir = goal.clone().sub(camera.position);
      this.ray.set(camera.position, dir.clone().normalize());
      this.ray.far = dir.length() - 0.3;
      for (const h of this.ray.intersectObjects(occluders as Mesh[], false)) {
        if (!shown.has(h.object.userData.actor as string)) hit.add((h.object as Mesh).material as Material);
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    const seen = new Set<Material>(); // 재질을 같이 쓰는 메시(검문소 차단봉·링)는 재질 하나로 한 번만
    let fading = false;
    for (const m of occluders) {
      const mat = m.material as Material & { opacity: number };
      if (seen.has(mat)) continue;
      seen.add(mat);
      const base = (mat.userData.baseOpacity ??= mat.opacity) as number;
      const goal = hit.has(mat) ? Math.min(base, 0.1) : base;
      mat.opacity += (goal - mat.opacity) * k;
      if (Math.abs(goal - mat.opacity) > 0.01) fading = true;
      mat.transparent = true;
      mat.depthWrite = mat.opacity > 0.9;
    }
    return fading;
  }
}
