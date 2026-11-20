// scripts는 셸을 거치지 않고 실행한다(DF-45: 셸로 인자를 넘기면 DEP0190 경고, 인자 속 |·& 같은 문자가 명령으로 읽힐 수 있음).
// shell: true나 child_process의 exec·execSync(늘 셸을 씀)가 들어가면 verify(npm test)가 실패한다. spawnSync·execFileSync에 인자 배열을 넘긴다
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("./", import.meta.url);
const BANNED = [/shell:\s*true/, /\bexec(Sync)?\s*\(/, /import\s*\{[^}]*\bexec(Sync)?\b[^}]*\}\s*from\s*["']node:child_process["']/];
const offenders = (source: string) => BANNED.filter((re) => re.test(source)).map(String);

describe("scripts는 셸 없이 실행한다", () => {
  it("검사 규칙: shell: true, exec(), execSync(), exec import를 잡고 spawnSync·execFileSync는 통과", () => {
    expect(offenders('spawnSync("npx", ["x"], { shell: true })')).toHaveLength(1);
    expect(offenders('import { exec } from "node:child_process"; exec("ls")')).toHaveLength(2);
    expect(offenders('execSync("ls")')).toHaveLength(1);
    expect(offenders('spawnSync(process.execPath, [cli], { shell: false }); execFileSync("aws", ["s3"])')).toEqual([]);
  });

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "no-shell.test.ts")) {
    it(file, () => {
      expect(offenders(readFileSync(new URL(file, dir), "utf8"))).toEqual([]);
    });
  }
});
