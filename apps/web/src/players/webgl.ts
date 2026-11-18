/** 3D 묶음을 불러오기 전에 WebGL을 쓸 수 있는지 확인한다. ?no3d 를 붙이면 2D 대체 화면을 강제로 볼 수 있다(확인용) */
export function canUseWebGL(): boolean {
  if (new URLSearchParams(location.search).has("no3d")) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
