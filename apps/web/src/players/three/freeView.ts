// 자유 시점(모든 3D 장면 공통): 켜면 지금 보던 곳을 중심으로 돌린다. 무대에 포커스가 있으면 화살표로도 돌릴 수 있다 (docs/06 6절)
import { useEffect, type RefObject } from "react";
import { Spherical, Vector3, type Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type Options = {
  freeView: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  controls: RefObject<OrbitControlsImpl | null>;
  camera: Camera;
  /** 켤 때 돌리는 중심(지금 카메라가 보던 곳) */
  target: Vector3;
  invalidate: () => void;
  /** 켜고 끌 때마다(그리기 깨우기 등) */
  onToggle: (on: boolean) => void;
};

export function useFreeView({ freeView, stageRef, controls, camera, target, invalidate, onToggle }: Options) {
  useEffect(() => {
    onToggle(freeView);
    if (!freeView) return;
    const c = controls.current;
    if (c) {
      c.target.copy(target);
      c.update();
    }
    const el = stageRef.current;
    const onKey = (e: KeyboardEvent) => {
      const ctl = controls.current;
      if (!ctl || e.target !== el || !e.key.startsWith("Arrow")) return;
      const offset = camera.position.clone().sub(ctl.target);
      const s = new Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") s.theta -= 0.2;
      if (e.key === "ArrowRight") s.theta += 0.2;
      if (e.key === "ArrowUp") s.phi = Math.max(0.25, s.phi - 0.12);
      if (e.key === "ArrowDown") s.phi = Math.min(1.35, s.phi + 0.12);
      camera.position.copy(ctl.target).add(new Vector3().setFromSpherical(s));
      ctl.update();
      invalidate();
      e.preventDefault();
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 켜고 끌 때만 다시 건다
  }, [freeView]);
}
