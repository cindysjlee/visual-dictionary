// 종이 삽화 칠(세 플레이어 공통, docs/06 "종이 삽화"): 물체는 3단계 명암 툰 재질 + 먹색 외곽선.
// 외곽선은 뒷면만 그린 같은 모양을 법선 방향으로 조금 밀어낸 껍질(inverted hull). 상자 모서리에서 선이 끊기지 않게 부드러운 법선을 새로 계산한다.
// 저사양(코어 4개 이하·메모리 4GB 이하·좁은 화면)에서는 외곽선을 끄고 해상도를 낮춘다
import { BackSide, Color, DataTexture, Mesh, MeshBasicMaterial, MeshToonMaterial, NearestFilter, RedFormat, type BufferGeometry, type Material, type Object3D } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** 저사양 기기: 외곽선을 끄고 픽셀 밀도를 낮춘다(한 번만 판단) */
export const lowEnd = (() => {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4 || matchMedia("(max-width: 639px)").matches;
})();

let ramp: DataTexture | undefined;
/** 명암 3단계(그늘·중간·밝음). 단계 사이는 섞지 않는다 */
function toonRamp() {
  if (!ramp) {
    ramp = new DataTexture(new Uint8Array([150, 205, 255]), 3, 1, RedFormat);
    ramp.minFilter = NearestFilter;
    ramp.magFilter = NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/** 물체 재질: 툰(색·투명도·발광은 기존 재질과 같은 이름으로 칠한다) */
export const toon = () => new MeshToonMaterial({ gradientMap: toonRamp() });

const hulls = new WeakMap<BufferGeometry, BufferGeometry>();
/** 법선을 부드럽게 다시 계산한 껍질용 모양(같은 모양은 한 번만 만든다) */
function hullOf(geo: BufferGeometry) {
  let hull = hulls.get(geo);
  if (!hull) {
    const g = geo.clone();
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    hull = mergeVertices(g);
    hull.computeVertexNormals();
    hulls.set(geo, hull);
  }
  return hull;
}

const THICKNESS = 0.028; // 세계 단위. 무대 폭 약 28 기준으로 화면에서 1~2px

/**
 * 메시에 먹색 외곽선을 붙인다. 부모 재질의 투명도(가림·등장 페이드)를 매 프레임 따라가고, 광선 검사(가림·자유 시점)에는 잡히지 않는다
 */
export function outline(mesh: Mesh, color: string) {
  if (lowEnd) return;
  const mat = new MeshBasicMaterial({ color: new Color(color), side: BackSide, toneMapped: false });
  // MeshBasicMaterial 셰이더는 objectNormal을 만들지 않으므로 normal 속성(항상 선언됨)을 쓴다
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed += normalize(normal) * ${THICKNESS.toFixed(3)};`);
  };
  const hull = new Mesh(hullOf(mesh.geometry), mat);
  hull.userData.outline = true;
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.raycast = () => {};
  hull.onBeforeRender = () => {
    const parent = mesh.material as Material & { opacity?: number };
    const opacity = parent.opacity ?? 1;
    mat.opacity = opacity;
    mat.transparent = opacity < 1;
    mat.depthWrite = opacity > 0.5;
  };
  mesh.add(hull);
}

/** 테마가 바뀌면 외곽선 색을 다시 칠한다 */
export function paintOutlines(root: Object3D, color: string) {
  root.traverse((o) => {
    if (o.userData.outline) ((o as Mesh).material as MeshBasicMaterial).color.set(color);
  });
}

/**
 * 아래 모든 툰 메시에 외곽선을 붙인다(이미 붙은 것·납작한 판은 건너뛴다). 장면을 다 만든 뒤, 새로 만든 무리마다 부른다
 */
export function outlineAll(root: Object3D, color: string) {
  if (lowEnd) return;
  const targets: Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o.userData.outline || o.userData.outlined) return;
    const mat = o.material as Material & { opacity?: number };
    // 투명도는 등장·가림에 따라 바뀌므로 가리지 않는다(외곽선이 부모 투명도를 따라간다)
    if (!(mat instanceof MeshToonMaterial) || o.geometry.type === "PlaneGeometry") return;
    targets.push(o);
  });
  for (const m of targets) {
    m.userData.outlined = true;
    outline(m, color);
  }
}
