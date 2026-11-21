// 랜딩(/, /about): 클릭재킹 "직접 해 보기" 체험 하나와 [용어 둘러보기]·[회원가입]. 배경은 페이지의 은은한 색 번짐만(WebGL 없음).
// 숫자·용어 이름은 /content/index.json에서 읽는다(하드코딩 금지). 창 모양 후보는 ?win=chrome|holo|aqua(미리보기 비교용, 하나로 정하면 나머지는 지운다)
import { lazy, Suspense, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { IndexEntry, Term } from "@app/content-schema";
import { useJson } from "../../useJson.ts";
import type { Win } from "./ClickjackTrick.tsx";
import "../../styles/landing.css";

// 체험(Motion 포함)은 따로 받되, 이 모듈을 읽는 즉시 받기 시작해 용어 JSON과 병렬로 받는다(첫 화면 묶음 120KB 이하 유지)
const trickChunk = import("./ClickjackTrick.tsx");
const ClickjackTrick = lazy(() => trickChunk);

const WINS: Win[] = ["chrome", "holo", "aqua"];
const DEMO_ID = "clickjacking";

/** 굴절 필터(backdrop-filter: url(#…))는 Chromium만 그린다. 나머지는 일반 blur(landing.css 기본값) */
function supportsRefraction() {
  const brands = (navigator as { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  return brands.some((b) => /Chromium/.test(b.brand)) && CSS.supports("backdrop-filter", "url(#liquid-refract)");
}

/** 리퀴드 글래스 굴절 필터: 잡음으로 뒤 배경을 휘게 한다(외부 이미지 없이 feTurbulence) */
function LiquidFilter() {
  return (
    <svg className="liquid-defs" aria-hidden="true" focusable="false">
      <filter id="liquid-refract" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="34" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export default function LandingPage() {
  const [params] = useSearchParams();
  const win = WINS.find((w) => w === params.get("win")) ?? "chrome";
  const load = useJson<IndexEntry[]>("/content/index.json");
  const index = load.state === "ok" ? load.data : null;
  const demo = useJson<Term>(index?.some((t) => t.id === DEMO_ID) ? `/content/terms/${DEMO_ID}.json` : null);

  useEffect(() => {
    document.documentElement.classList.toggle("has-refraction", supportsRefraction());
    // 개발 서버 전용(?freeze): 움직임 캡처(impeccable motion-capture)가 멈춘 화면에서 시작하도록 배경 빛 움직임을 멈춘다
    if (import.meta.env.DEV && params.has("freeze")) document.documentElement.classList.add("freeze-backdrop");
  }, [params]);

  return (
    <div className="landing">
      <LiquidFilter />
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-head">
          <h1 id="landing-title" className="name-tag name-tag-lg">
            보안·CS 개념 시각화 사전
          </h1>
          <p className="landing-note">
            보안 공격과 CS 개념 {index ? <span className="num">{index.length}</span> : null}
            {index ? "개를" : "을"} 단계별 3D 장면과 자막으로 재생해요.
          </p>
        </div>
        {demo.state === "ok" ? (
          <Suspense fallback={<div className="trick-placeholder" aria-hidden="true" />}>
            <ClickjackTrick term={demo.data} win={win} />
          </Suspense>
        ) : load.state === "error" || load.state === "notfound" || demo.state === "error" ? (
          <p role="alert" className="landing-error">
            체험을 불러오지 못했어요. <Link to="/terms">용어 목록</Link>에서 바로 볼 수 있어요.
          </p>
        ) : (
          <div className="trick-placeholder" aria-hidden="true" />
        )}
      </section>

      <nav className="landing-next" aria-label="다음으로">
        <Link to="/terms" className="btn-chrome">
          용어 둘러보기
        </Link>
        <Link to="/auth/signup" className="btn-chrome is-quiet">
          회원가입
        </Link>
      </nav>
    </div>
  );
}
