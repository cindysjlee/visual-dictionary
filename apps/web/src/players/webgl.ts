/** 3D 묶음을 불러오기 전에 WebGL을 쓸 수 있는지 확인한다. ?no3d 를 붙이면 2D 대체 화면을 강제로 볼 수 있다(확인용) */
export function canUseWebGL(): boolean {
  if (new URLSearchParams(location.search).has("no3d")) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // 확인용 컨텍스트를 바로 돌려준다(브라우저의 동시 컨텍스트 수 제한)
    return Boolean(gl);
  } catch {
    return false;
  }
}
