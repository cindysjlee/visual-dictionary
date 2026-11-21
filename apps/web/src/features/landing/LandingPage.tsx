// 랜딩(/, /about). Y2K 크롬 + 리퀴드 글래스 + 스크롤 3D(docs/05 "랜딩").
// 첫 화면은 미리 렌더한 정지 이미지(LCP)와 머리 글만 그리고, 3D 장면(LandingStory: three.js·motion)은 첫 페인트 뒤 따로 받는다.
// 동작 줄이기·WebGL 없음이면 3D를 받지 않고 정지 이미지 + 일반 스크롤. 숫자·용어 이름은 /content/index.json에서 읽는다(하드코딩 금지)
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Form, Link, useSearchParams } from "react-router";
import type { Category, IndexEntry, Term } from "@app/content-schema";
import { CATEGORY_LABELS, PLAYER_LABELS } from "@app/content-schema/labels";
import { SearchIcon } from "../../icons.tsx";
import { canUseWebGL } from "../../players/webgl.ts";
import { useJson } from "../../useJson.ts";
import type { Hero } from "./LandingScene.tsx";
import heroADark from "./posters/hero-a-dark.webp";
import heroALight from "./posters/hero-a-light.webp";
import heroBDark from "./posters/hero-b-dark.webp";
import heroBLight from "./posters/hero-b-light.webp";
import "../../styles/landing.css";

/** 미리 렌더한 정지 이미지(첫 화면 LCP, scripts/render-landing-posters.ts). 유리 굴절 바탕이 테마 바탕색이라 테마별 */
const POSTERS = { a: { light: heroALight, dark: heroADark }, b: { light: heroBLight, dark: heroBDark } };

const StepLedger = lazy(() => import("./StepLedger.tsx"));
const LandingStory = lazy(() => import("./LandingStory.tsx"));
// 개발 서버 전용(배포 빌드에서는 DEV가 false라 청크째 빠진다)
const PosterCapture = import.meta.env.DEV ? lazy(() => import("./PosterCapture.tsx")) : null;

/** 첫 화면에 재생할 용어: CSRF가 있으면 CSRF, 없으면 차단 단계가 있는 첫 흐름형 용어 */
export const pickHero = (index: IndexEntry[]) =>
  (index.find((t) => t.id === "csrf") ?? index.find((t) => t.playerType === "flow" && t.blockedAt.length > 0) ?? index[0])?.id ?? null;

/** 화면 읽기 프로그램용 단계 막대 설명: "6단계, 3단계부터 위험, 5단계에서 차단" */
export const stepSummary = (t: Pick<IndexEntry, "stepCount" | "dangerFrom" | "blockedAt">) =>
  [`${t.stepCount}단계`, t.dangerFrom ? `${t.dangerFrom}단계부터 위험` : "", t.blockedAt.length ? `${t.blockedAt.join("·")}단계에서 차단` : ""].filter(Boolean).join(", ");

/** 크롬 글자로 쓰는 용어 이름: 라틴 글자 이름(CSRF)은 그대로, 한글 이름은 영문 이름(Deadlock) */
export const displayName = (t: Pick<IndexEntry, "name" | "englishName">) => (/^[\x20-\x7e]+$/.test(t.name) ? t.name : (t.englishName ?? t.name));

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 지금 테마(html data-theme). 테마 버튼으로 바꾸면 정지 이미지와 3D 장면(토큰 색을 읽음)도 따라 바꾼다 */
function useDocTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (notify) => {
      const mo = new MutationObserver(notify);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
  );
}

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

const SPARKS = [
  [8, 22, 18],
  [22, 70, 12],
  [48, 12, 10],
  [74, 26, 16],
  [88, 64, 12],
  [60, 82, 9],
] as const;
function Sparkles() {
  return (
    <div className="sparkles" aria-hidden="true">
      {SPARKS.map(([x, y, s], i) => (
        <svg key={i} className="sparkle" viewBox="0 0 24 24" width={s} height={s} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.7}s` }}>
          <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" />
        </svg>
      ))}
    </div>
  );
}

function StepBar({ term }: { term: IndexEntry }) {
  const firstBlock = term.blockedAt[0] ?? Infinity;
  return (
    <span className="step-bar" aria-hidden="true">
      {Array.from({ length: term.stepCount }, (_, k) => {
        const n = k + 1;
        const danger = term.dangerFrom !== null && n >= term.dangerFrom;
        const cls = term.blockedAt.includes(n) ? "is-block" : n > firstBlock ? (danger ? "is-cut" : "is-after") : danger ? "is-danger" : "";
        return <span key={n} className={`step-cell ${cls}`} />;
      })}
    </span>
  );
}

/** 크롬 글자 용어 이름 띠: 두 줄이 스크롤에 따라 서로 반대로 흐른다(장식 이동은 CSS 스크롤 타임라인, 동작 줄이기면 멈춤). 누르면 그 용어 상세로 */
function NameBand({ index }: { index: IndexEntry[] }) {
  const half = Math.ceil(index.length / 2);
  const rows = [index.slice(0, half), index.slice(half)];
  return (
    <section className="names" aria-labelledby="names-title">
      <h2 id="names-title" className="name-tag">
        용어 <span className="num">{index.length}</span>
      </h2>
      {rows.map((row, r) => (
        <ul key={r} className={`names-row names-row-${r}`}>
          {row.map((t) => (
            <li key={t.id}>
              <Link to={`/terms/${t.id}`} className="chrome-word">
                {displayName(t)}
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

function TermSheet({ index }: { index: IndexEntry[] }) {
  const groups = (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [c, index.filter((t) => t.category === c)] as const).filter(([, list]) => list.length);
  return (
    <section className="sheet" aria-labelledby="sheet-title">
      <div className="sheet-intro">
        <h2 id="sheet-title" className="name-tag">
          단계 막대
        </h2>
        <p className="landing-note">한 칸이 한 단계예요.</p>
        <ul className="sheet-legend">
          <li>
            <span className="step-cell is-danger" aria-hidden="true" />
            위험한 단계
          </li>
          <li>
            <span className="step-cell is-block" aria-hidden="true" />
            방어가 막는 단계
          </li>
          <li>
            <span className="step-cell is-cut" aria-hidden="true" />
            막혀서 실행되지 않는 단계
          </li>
          <li>
            <span className="step-cell" aria-hidden="true" />
            일반 단계
          </li>
        </ul>
      </div>
      <div className="sheet-groups">
        {groups.map(([category, list]) => (
          <div key={category} className="sheet-group">
            <h3>
              {CATEGORY_LABELS[category]} <span className="num sheet-count">{list.length}</span>
            </h3>
            <ul className="sheet-list">
              {list.map((t) => (
                <li key={t.id}>
                  <Link to={`/terms/${t.id}`} className="sheet-row">
                    <span className="sheet-name">
                      {t.name}
                      {t.englishName && <span className="sheet-en">{t.englishName}</span>}
                    </span>
                    <StepBar term={t} />
                    <span className="sheet-meta">{PLAYER_LABELS[t.playerType]}</span>
                    <span className="visually-hidden">{stepSummary(t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [params] = useSearchParams();
  const hero: Hero = params.get("hero") === "b" ? "b" : "a"; // 미리보기 비교용(?hero=a|b). 하나로 정하면 나머지는 지운다
  const poster = import.meta.env.DEV && params.has("poster"); // 개발 서버에서 정지 이미지를 찍는 모드(scripts/render-landing-posters.ts)
  const load = useJson<IndexEntry[]>("/content/index.json");
  const index = load.state === "ok" ? load.data : null;
  const heroId = index ? pickHero(index) : null;
  const heroTerm = useJson<Term>(heroId ? `/content/terms/${heroId}.json` : null);
  const story = useRef<HTMLElement>(null);
  const theme = useDocTheme();
  // 3D는 첫 페인트 뒤에만: 동작 줄이기·WebGL 없음이면 받지 않는다
  const [enhanced] = useState(() => !reducedMotion() && canUseWebGL());
  const [start3d, setStart3d] = useState(false);
  const [ready3d, setReady3d] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("has-refraction", supportsRefraction());
    if (!enhanced || poster) return;
    const id = requestAnimationFrame(() => setTimeout(() => setStart3d(true), 120));
    return () => cancelAnimationFrame(id);
  }, [enhanced, poster]);

  // 리퀴드 글래스의 빛 반사가 마우스를 따라온다(CSS 변수, CSSOM이라 CSP와 무관)
  const glint = (e: PointerEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".liquid");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };

  if (poster && PosterCapture) return <Suspense fallback={null}>{<PosterCapture hero={hero} />}</Suspense>;

  return (
    <div className={`landing hero-${hero}`} onPointerMove={glint}>
      <LiquidFilter />
      <section ref={story} className={`story${enhanced ? " is-scroll" : ""}${ready3d ? " is-ready" : ""}`} aria-labelledby="landing-title">
        <div className="story-stage">
          <img
            className="story-poster"
            src={POSTERS[hero][theme]}
            width={1600}
            height={1000}
            alt=""
            fetchPriority="high"
          />
          <Sparkles />
          {start3d && heroTerm.state === "ok" && (
            <Suspense fallback={null}>
              <LandingStory key={theme} section={story} hero={hero} term={heroTerm.data} onReady={() => setReady3d(true)} />
            </Suspense>
          )}
          <div className="story-hud">
            <h1 id="landing-title" className="name-tag name-tag-lg">
              보안·CS 개념 시각화 사전
            </h1>
            <p className="landing-note">
              보안 공격과 CS 개념 {index ? <span className="num">{index.length}</span> : null}
              {index ? "개를" : "을"} 단계별 3D 장면과 자막으로 재생해요.
            </p>
            <Form action="/terms" method="get" role="search" className="hero-search liquid">
              <label htmlFor="landing-q" className="visually-hidden">
                용어 검색
              </label>
              <SearchIcon />
              <input id="landing-q" name="q" type="search" placeholder="XSS, 데드락…" autoComplete="off" />
              <button type="submit" className="btn-chrome">
                찾기
              </button>
            </Form>
            {enhanced && <p className="scroll-cue">스크롤하면 {heroTerm.state === "ok" ? heroTerm.data.name : "요청"} 요청이 검문소까지 가요</p>}
          </div>
        </div>
      </section>

      {index && <NameBand index={index} />}

      {load.state === "error" || load.state === "notfound" ? (
        <p role="alert" className="landing-error">
          용어 목록을 불러오지 못했어요. <Link to="/terms">용어 목록</Link>에서 다시 시도해 주세요.
        </p>
      ) : (
        <Suspense fallback={<div className="ledger is-placeholder" aria-hidden="true" />}>
          {heroTerm.state === "ok" ? <StepLedger term={heroTerm.data} /> : <div className="ledger is-placeholder" aria-hidden="true" />}
        </Suspense>
      )}

      {index && <TermSheet index={index} />}

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title" className="name-tag">
          기록
        </h2>
        <p className="landing-note">로그인하면 읽은 용어와 분야별 진행률이 저장돼요. 로그인하지 않아도 모든 장면을 볼 수 있어요.</p>
        <div className="closing-actions">
          <Link to="/terms" className="btn-chrome btn-chrome-lg">
            용어 목록 보기
          </Link>
          <Link to="/auth/signup" className="btn-chrome btn-chrome-lg is-quiet">
            회원가입
          </Link>
        </div>
      </section>
    </div>
  );
}
