// 카메라 리그(모든 3D 장면 공통): 목표(위치·초점)를 정하면 매 프레임 부드럽게 따라간다. 규칙은 docs/06 3절 "카메라 규칙"
import { Box3, PerspectiveCamera, Vector3 } from "three";

export type Distance = "near" | "mid" | "far";
/** 위에서 비스듬히(약 40°) 내려다본다: 앞줄 물체가 뒷줄을 덜 가린다 */
const OFFSET: Record<Distance, Vector3> = { near: new Vector3(-0.6, 3.9, 4.6), mid: new Vector3(0.4, 6.4, 7.6), far: new Vector3(0, 12.5, 14) };
const VIEW_DIR = new Vector3(0, 0.84, 1).normalize();
export const FOV = 40;
/** frame()이 점들을 담는 화면 범위(NDC). 가장자리 9%는 여유로 남긴다 */
const FRAME_MARGIN = 0.82;
/** 한 행위자만 담을 때도 주변(부모 상자·이웃)이 보이게 이보다 가까이 가지 않는다 */
const MIN_FRAME_DISTANCE = 9;

export class CameraRig {
  /** 바라보는 방향(초점 → 카메라). 흐름형은 약 40° 내려다보기, 세로로 쌓이는 스택형은 거의 정면 */
  private readonly viewDir: Vector3;
  constructor(viewDir: Vector3 = VIEW_DIR) {
    this.viewDir = viewDir.clone().normalize();
  }
  readonly target = new Vector3(0, 0.8, -1.2);
  readonly position = new Vector3(0, 12.5, 14);
  private probe = new PerspectiveCamera(FOV, 1.8, 0.1, 200);
  private aspect = 1.8;

  setAspect(aspect: number) {
    this.aspect = aspect;
  }
  /** 화면이 좁으면(휴대폰) 멀리서 찍어 장면이 잘리지 않게 */
  private scale() {
    return Math.max(1, 1.7 / this.aspect);
  }
  shot(focus: Vector3, distance: Distance = "mid") {
    this.target.copy(focus);
    this.position.copy(focus).add(OFFSET[distance].clone().multiplyScalar(this.scale()));
  }
  /** 여러 점이 모두 화면 안에 여유 있게 들어오는 가장 가까운 거리를 찾는다 (화면 비율 반영) */
  frame(points: Vector3[]) {
    if (points.length === 0) return;
    const center = new Box3().setFromPoints(points).getCenter(new Vector3());
    const cam = this.probe;
    cam.aspect = this.aspect;
    cam.updateProjectionMatrix();
    const place = (d: number) => {
      cam.position.copy(center).addScaledVector(this.viewDir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      return points.map((p) => p.clone().project(cam));
    };
    const fits = (d: number) => place(d).every((q) => q.z < 1 && Math.abs(q.x) <= FRAME_MARGIN && Math.abs(q.y) <= FRAME_MARGIN);
    let dist = 90;
    // 원근 때문에 3D 상자의 가운데가 화면 가운데가 아니다: 거리를 맞추고, 화면에 투영된 범위의 가운데로 초점을 옮기기를 몇 번 되풀이한다
    for (let pass = 0; pass < 3; pass++) {
      let lo = MIN_FRAME_DISTANCE;
      let hi = 90;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      dist = hi;
      const qs = place(dist);
      const cx = (Math.min(...qs.map((q) => q.x)) + Math.max(...qs.map((q) => q.x))) / 2;
      const cy = (Math.min(...qs.map((q) => q.y)) + Math.max(...qs.map((q) => q.y))) / 2;
      const halfH = dist * Math.tan(((FOV / 2) * Math.PI) / 180);
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      center.addScaledVector(right, cx * halfH * this.aspect).addScaledVector(up, cy * halfH);
    }
    let lo = MIN_FRAME_DISTANCE;
    let hi = 90;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.target.copy(center);
    this.position.copy(center).addScaledVector(this.viewDir, hi);
  }
  /** 목표 샷(카메라가 가려는 자리)에서 점들이 모두 화면 안에 들어오는지 */
  covers(points: Vector3[]) {
    const cam = this.probe;
    cam.aspect = this.aspect;
    cam.updateProjectionMatrix();
    cam.position.copy(this.position);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    return points.every((p) => {
      const q = p.clone().project(cam);
      return q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1;
    });
  }
  /** 실제 카메라가 목표에 거의 닿았는지 (테스트 빌드의 겹침 검사가 기다린다) */
  settled(camera: PerspectiveCamera) {
    return camera.position.distanceTo(this.position) < 0.05;
  }
  /** dt초만큼 실제 카메라를 목표 쪽으로. 즉시(jump)면 바로 옮긴다 */
  apply(camera: PerspectiveCamera, dt: number, jump = false) {
    const k = jump ? 1 : 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(this.position, k);
    const look = (camera.userData.look as Vector3 | undefined) ?? this.target.clone();
    look.lerp(this.target, k);
    camera.userData.look = look;
    camera.lookAt(look);
    return camera.position.distanceTo(this.position) < 0.02;
  }
}
