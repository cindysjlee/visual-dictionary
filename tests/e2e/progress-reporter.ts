// 멈춤 진단용 리포터(playwright.config.ts에 list와 함께 등록). 실행 중 test-results/e2e-progress.json에
// "지금 돌고 있는 테스트 · 시작 시각 · 마지막 단계 15개 · 마지막 출력 줄"을 계속 쓴다. 전체 상한(globalTimeout)이나
// 외부 timeout으로 끊겨도 그 순간의 상태가 파일에 남고, 끊기면 끝에 같은 내용과 trace 경로를 출력한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from "@playwright/test/reporter";

type Running = { title: string; startedAt: string; steps: string[]; output: string[] };
const KEEP = 15;

export default class ProgressReporter implements Reporter {
  private file = "";
  private running = new Map<string, Running>();
  private done = { passed: 0, failed: 0, other: 0 };

  onBegin(config: FullConfig, _suite: Suite) {
    const dir = config.projects[0]?.outputDir ?? "test-results";
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "e2e-progress.json");
    this.write();
  }

  onTestBegin(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name;
    this.running.set(test.id, {
      title: `${project ? `[${project}] ` : ""}${test.titlePath().slice(1).join(" › ")}`,
      startedAt: new Date(result.startTime).toISOString(),
      steps: [],
      output: [],
    });
    this.write();
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category !== "pw:api" && step.category !== "expect" && step.category !== "test.step") return;
    const r = this.running.get(test.id);
    if (!r) return;
    r.steps.push(`${new Date().toISOString().slice(11, 19)} ${step.title}`);
    if (r.steps.length > KEEP) r.steps.shift();
    this.write();
  }

  onStdOut(chunk: string | Buffer, test?: TestCase) {
    this.keepOutput(chunk, test);
  }

  onStdErr(chunk: string | Buffer, test?: TestCase) {
    this.keepOutput(chunk, test);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.running.delete(test.id);
    if (result.status === "passed") this.done.passed++;
    else if (result.status === "failed" || result.status === "timedOut") this.done.failed++;
    else this.done.other++;
    this.write();
  }

  onEnd(result: FullResult) {
    this.write(result.status);
    if (result.status === "passed" || this.running.size === 0) return;
    // 끊긴 순간 돌던 테스트. trace는 retain-on-failure로 각 테스트 출력 폴더(test-results/<테스트>/trace.zip)에 남는다
    console.log(`\n[진단] 실행이 ${result.status}로 끝남. 끊긴 순간 돌던 테스트 ${this.running.size}개 (기록: ${this.file})`);
    for (const r of this.running.values()) {
      console.log(`- ${r.title} (시작 ${r.startedAt})`);
      for (const s of r.steps) console.log(`    ${s}`);
      for (const o of r.output) console.log(`    > ${o}`);
    }
    console.log("[진단] trace: test-results/*/trace.zip → npx playwright show-trace <경로>");
  }

  private keepOutput(chunk: string | Buffer, test?: TestCase) {
    const r = test && this.running.get(test.id);
    if (!r) return;
    r.output.push(...String(chunk).split("\n").filter(Boolean));
    r.output.splice(0, Math.max(0, r.output.length - KEEP));
    this.write();
  }

  private write(status = "running") {
    if (!this.file) return;
    const body = { status, updatedAt: new Date().toISOString(), done: this.done, running: [...this.running.values()] };
    writeFileSync(this.file, JSON.stringify(body, null, 2));
  }
}
