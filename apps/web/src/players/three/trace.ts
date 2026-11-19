// 장면 기록(테스트·개발 빌드 전용). E2E가 "기대한 연출이 실제로 일어났는지"를 화면 픽셀이 아니라 이 기록으로 확인한다.
// TRACE는 Vite가 빌드 때 상수로 바꾸므로 배포 빌드(production)에서는 아래 코드가 통째로 빠진다(scripts/check-bundle.ts가 확인)
import type { Mode } from "@app/content-schema/scene";

export const TRACE = import.meta.env.MODE !== "production";

/**
 * stepStart → depart(봉투 출발) → via(경유지 도착) → gate(검문소 도착) → arrive(목적지 도착) → return(왕복해 돌아옴)
 * → effect(효과 실행, 거부면 refused) → blocked(차단 도장) → stepEnd(연출과 대기가 끝남)
 */
export type TraceKind = "stepStart" | "depart" | "via" | "gate" | "arrive" | "return" | "effect" | "blocked" | "stepEnd";
export type TraceEvent = { step: number; mode: Mode; kind: TraceKind; actor?: string; effect?: string; refused?: boolean; t: number };
/** 기록 하나 더하기. 같은 단계 안에서만 쓰므로 단계·모드는 미리 묶어 둔다 */
export type Tracer = (kind: TraceKind, extra?: Pick<TraceEvent, "actor" | "effect" | "refused">) => void;

type TraceWindow = Window & { __sceneTrace?: TraceEvent[]; __sceneSpeed?: number };

export function tracerFor(step: number, mode: Mode): Tracer {
  if (!TRACE) return () => {};
  return (kind, extra) => ((window as TraceWindow).__sceneTrace ??= []).push({ step, mode, kind, ...extra, t: performance.now() });
}

/** E2E가 연출을 빨리 돌리게 하는 배속(테스트·개발 빌드 전용). 배포 빌드에서는 항상 1 */
export const traceSpeed = () => (TRACE ? ((window as TraceWindow).__sceneSpeed ?? 1) : 1);
