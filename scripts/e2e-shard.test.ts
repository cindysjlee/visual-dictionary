// CI E2E 분배(scripts/e2e-shard.ts, CH-69): 모든 shard를 합치면 전체가 겹침·빠짐 없이 되고, 연달아 있는 무거운 테스트가 shard마다 고르게 퍼진다
import { describe, expect, it } from "vitest";
import { collectTests, listProblems, parseShardArgs, pickShard, testListLine, type JsonReport, type TestRef } from "./e2e-shard.ts";

const ref = (file: string, ...titles: string[]): TestRef => ({ file, titles });

describe("pickShard", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it.each([1, 2, 3, 5, 7, 23, 30])("전체 수 %i: 모든 shard를 합치면 전체와 같고 겹치지 않는다", (total) => {
    const parts = Array.from({ length: total }, (_, k) => pickShard(items, k + 1, total));
    expect(parts.flat().sort((a, b) => a - b)).toEqual(items);
    expect(new Set(parts.flat()).size).toBe(items.length);
  });

  it("shard 크기 차이는 1개 이하다", () => {
    const sizes = Array.from({ length: 5 }, (_, k) => pickShard(items, k + 1, 5).length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("전체 수가 1이면 전부 한 shard", () => {
    expect(pickShard(items, 1, 1)).toEqual(items);
  });

  it("파일 안에서 연달아 있는 무거운 테스트(용어마다 하나)가 모든 shard에 고르게 퍼진다 — 기본 --shard처럼 이어 자르면 몰리는 구조", () => {
    // a 파일 85개(무거움), b 파일 40개(무거움), c 파일 300개(가벼움)가 이어 붙은 목록
    const tests = [
      ...Array.from({ length: 85 }, (_, i) => ({ heavy: true, id: `a${i}` })),
      ...Array.from({ length: 40 }, (_, i) => ({ heavy: true, id: `b${i}` })),
      ...Array.from({ length: 300 }, (_, i) => ({ heavy: false, id: `c${i}` })),
    ];
    const heavyPer = Array.from({ length: 5 }, (_, k) => pickShard(tests, k + 1, 5).filter((t) => t.heavy).length);
    expect(Math.max(...heavyPer) - Math.min(...heavyPer)).toBeLessThanOrEqual(1);
    // 이어 자르기(기본 --shard)라면 같은 입력에서 무거운 테스트가 앞쪽 두 shard에 몰린다
    const size = Math.ceil(tests.length / 5);
    const contiguous = Array.from({ length: 5 }, (_, k) => tests.slice(k * size, (k + 1) * size).filter((t) => t.heavy).length);
    expect(Math.max(...contiguous) - Math.min(...contiguous)).toBeGreaterThan(30);
  });
});

describe("collectTests", () => {
  const report: JsonReport = {
    suites: [
      { title: "z.e2e.ts", file: "z.e2e.ts", specs: [{ title: "마지막 파일" }] },
      {
        title: "a.e2e.ts",
        file: "a.e2e.ts",
        specs: [{ title: "첫 테스트" }],
        suites: [{ title: "360px", specs: [{ title: "랜딩" }, { title: "색인" }], suites: [{ title: "안쪽", specs: [{ title: "깊은 테스트" }] }] }],
      },
    ],
  };

  it("파일 이름순, 파일 안은 정의 순서로 펴고 describe 제목을 경로에 넣는다", () => {
    expect(collectTests(report)).toEqual([
      ref("a.e2e.ts", "첫 테스트"),
      ref("a.e2e.ts", "360px", "랜딩"),
      ref("a.e2e.ts", "360px", "색인"),
      ref("a.e2e.ts", "360px", "안쪽", "깊은 테스트"),
      ref("z.e2e.ts", "마지막 파일"),
    ]);
  });

  it("같은 입력이면 항상 같은 순서다(shard마다 따로 계산해도 같은 분배가 나온다)", () => {
    expect(collectTests(report)).toEqual(collectTests(structuredClone(report)));
  });
});

describe("testListLine·listProblems", () => {
  it("Playwright --test-list 형식: [프로젝트] › 파일 › describe › 제목", () => {
    expect(testListLine(ref("a.e2e.ts", "360px", "랜딩"), "main")).toBe("[main] \u203A a.e2e.ts \u203A 360px \u203A 랜딩");
  });

  it("제목에 구분자(›)나 줄바꿈이 있거나 같은 제목이 둘이면 문제로 알린다", () => {
    expect(listProblems([ref("a.e2e.ts", "정상"), ref("a.e2e.ts", "다른 제목")])).toEqual([]);
    expect(listProblems([ref("a.e2e.ts", "A \u203A B")])).toHaveLength(1);
    expect(listProblems([ref("a.e2e.ts", "줄\n바꿈")])).toHaveLength(1);
    expect(listProblems([ref("a.e2e.ts", "같다"), ref("a.e2e.ts", "같다")])).toHaveLength(1);
    expect(listProblems([ref("a.e2e.ts", "같다"), ref("b.e2e.ts", "같다")])).toEqual([]); // 다른 파일이면 다른 테스트
  });
});

describe("parseShardArgs", () => {
  it("번호는 1~전체 수의 정수만", () => {
    expect(parseShardArgs("1", "5")).toEqual({ shard: 1, total: 5 });
    expect(parseShardArgs("5", "5")).toEqual({ shard: 5, total: 5 });
    for (const [a, b] of [["0", "5"], ["6", "5"], ["1", "0"], ["x", "5"], ["1", ""], [undefined, "5"], ["-1", "5"], ["1.5", "5"]] as const) {
      expect(parseShardArgs(a, b), `${a} ${b}`).toBeNull();
    }
  });
});
