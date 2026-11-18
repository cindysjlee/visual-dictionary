// 단계 안의 움직임을 위한 작은 타임라인(순수). useFrame에서 advance(delta)로 돌린다. setTimeout을 쓰지 않는다 (CLAUDE.md 8번)

export type Ease = (t: number) => number;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut: Ease = (t) => 1 - (1 - t) ** 3;
export const linear: Ease = (t) => t;

type Item = { start: number; duration: number; update?: (t: number) => void; call?: () => void; ease: Ease; done: boolean };

export class Timeline {
  private items: Item[] = [];
  private cursor = 0; // 다음 순차 항목이 시작할 시각(ms)
  private lastStart = 0; // 직전 순차 항목의 시작 시각(with가 여기서 함께 시작)
  private time = 0;

  /** 앞 항목이 끝난 뒤 duration ms 동안 update(0→1) */
  tween(duration: number, update: (t: number) => void, ease: Ease = easeInOut) {
    this.items.push({ start: this.cursor, duration, update, ease, done: false });
    this.lastStart = this.cursor;
    this.cursor += duration;
    return this;
  }

  /** 직전 tween과 동시에 시작 (순서 커서는 움직이지 않는다) */
  with(duration: number, update: (t: number) => void, ease: Ease = easeInOut) {
    this.items.push({ start: this.lastStart, duration, update, ease, done: false });
    return this;
  }

  wait(duration: number) {
    this.cursor += duration;
    return this;
  }

  call(fn: () => void) {
    this.items.push({ start: this.cursor, duration: 0, call: fn, ease: linear, done: false });
    return this;
  }

  get duration() {
    return Math.max(this.cursor, ...this.items.map((i) => i.start + i.duration));
  }

  get finished() {
    return this.time >= this.duration && this.items.every((i) => i.done);
  }

  /** dt ms만큼 진행. 시작 시각 순서대로 적용하고, 끝난 항목은 마지막 값(1)을 한 번 적용한다 */
  advance(dt: number) {
    this.time += dt;
    for (const item of this.items) {
      if (item.done || this.time < item.start) continue;
      const t = item.duration === 0 ? 1 : Math.min(1, (this.time - item.start) / item.duration);
      item.update?.(item.ease(t));
      if (t >= 1) {
        item.done = true;
        item.call?.();
      }
    }
    return this.finished;
  }

  /** 남은 항목을 즉시 끝 상태로 */
  finish() {
    return this.advance(Number.POSITIVE_INFINITY);
  }
}
