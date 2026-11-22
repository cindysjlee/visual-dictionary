// 시안 C "극장": 들어오자마자 막이 열리고 실제 3D 플레이어가 스크린에 상영된다(설명보다 장면이 먼저).
// 상영 시간표 = 분야별 관·용어별 상영작(누르면 같은 스크린에서 바로 상영), 관람 기록 = 가입 혜택
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Term } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import "@fontsource/black-han-sans/400.css";
import "../../styles/landing-c.css";
import { useJson } from "../../useJson.ts";
import { josa, type LandingData } from "./LandingPage.tsx";

// 3D 플레이어는 첫 화면 글자를 그린 뒤 따로 받는다(three.js는 이 묶음에만)
const Player = lazy(() => import("../../players/Player.tsx"));

type Props = { data: LandingData | null; failed: boolean };

export default function LandingC({ data, failed }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const picked = useJson<Term>(pick ? `/content/terms/${pick}.json` : null);
  const term = pick ? (picked.state === "ok" ? picked.data : null) : (data?.demo ?? null);
  const entry = data?.index.find((t) => t.id === (pick ?? data.demo?.id));
  const screen = useRef<HTMLElement>(null);
  // 첫 그림(제목) 뒤 한가할 때 플레이어를 붙인다: LCP는 제목, 3D 준비는 그다음
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = typeof requestIdleCallback === "function" ? requestIdleCallback(() => setReady(true), { timeout: 800 }) : window.setTimeout(() => setReady(true), 200);
    return () => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
  }, []);

  const show = (id: string) => {
    setPick(id);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    screen.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // 키보드·화면 읽기 사용자도 스크린으로 옮긴다(재생 버튼까지 되돌아가지 않게)
    document.getElementById("lc-now")?.focus({ preventScroll: true });
  };
  // 플레이어 탭 이름과 맞춘다(PlayerShell: 보안 용어 "방어 모드", CS 용어 "해결 방법")
  const solutions = !!term && term.defenses.length > 0 && term.defenses.every((d) => d.kind === "solution");
  const modeTab = solutions ? "해결 방법" : "방어 모드";
  const isCs = (c: string) => c === "os" || c === "runtime";

  return (
    <div className="lc">
      <div className="lc-top">
      <header className="lc-marquee">
        <h1 className="lc-title">
          보안·CS
          <br />
          용어 사전
        </h1>
        <p className="lc-tagline">공격이 어떻게 진행되고 어디서 막히는지 3D 장면으로 봅니다.</p>
        {data && (
          <p className="lc-lede">
            용어 <b>{data.index.length}</b>개, 분야 <b>{data.groups.length}</b>개. 로그인 없이 모두 볼 수 있고, 가입하면 본 장면이 기록됩니다.
          </p>
        )}
        <p className="lc-actions">
          <Link className="lc-btn lc-btn-spot" to="/auth/signup">
            회원가입
          </Link>
          <Link className="lc-btn" to="/terms">
            용어 둘러보기
          </Link>
        </p>
        {failed && (
          <p className="lc-alert" role="alert">
            상영작 목록을 불러오지 못했습니다. 새로고침하거나 용어 둘러보기로 가 주세요.
          </p>
        )}
      </header>

      <section ref={screen} className="lc-hall" aria-labelledby="lc-now">
        <h2 id="lc-now" className="lc-now" tabIndex={-1}>
          <span>지금 상영</span> {entry ? entry.name : "…"}
          {entry?.englishName && <span className="lc-now-en">{entry.englishName}</span>}
        </h2>
        <div className="lc-stage">
          <div className="lc-curtain lc-curtain-l" aria-hidden="true" />
          <div className="lc-curtain lc-curtain-r" aria-hidden="true" />
          <div className="lc-screen">
            {term && ready ? (
              <Suspense fallback={<ScreenWait />}>
                <Player key={term.id} term={term} />
              </Suspense>
            ) : (
              <ScreenWait />
            )}
          </div>
        </div>
        <p className="lc-hint">
          재생 버튼을 누르면 단계마다 자막이 나옵니다.
          {term && term.defenses.length > 0 && ` 스크린 위쪽의 ${modeTab} 탭을 누르고 다시 보세요.`}
          {entry && entry.blockedAt.length > 0 && ` ${josa(entry.name, "은", "는")} 방어를 켜면 ${entry.blockedAt[0]}단계에서 막힙니다.`}
          {entry && (
            <>
              {" "}
              <Link to={`/terms/${entry.id}`}>{entry.name} 자세히 보기</Link>
            </>
          )}
        </p>
      </section>
      </div>

      <section className="lc-times" aria-labelledby="lc-times-title">
        <h2 id="lc-times-title" className="lc-h2">
          상영 시간표
        </h2>
        <p className="lc-sub">모든 용어가 같은 방식으로 상영됩니다. 고르면 위 스크린에서 바로 틀어 드립니다.</p>
        <div className="lc-board">
          {data?.groups.map(([c, list]) => (
            <section key={c} className="lc-room" aria-labelledby={`lc-r-${c}`}>
              <h3 id={`lc-r-${c}`}>{CATEGORY_LABELS[c]}관</h3>
              <ul>
                {list.map((t) => {
                  const on = t.id === entry?.id;
                  return (
                    <li key={t.id}>
                      <button type="button" className="lc-film" aria-pressed={on} onClick={() => show(t.id)}>
                        <span className="lc-film-name">{t.name}</span>
                        <span className="lc-film-meta">
                          {t.stepCount}장면{t.defenseCount > 0 ? `, ${isCs(t.category) ? "해결" : "방어"} ${t.defenseCount}` : ""}
                        </span>
                        <span className="lc-film-state">{on ? "상영 중" : "상영하기"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="lc-stubs" aria-labelledby="lc-stubs-title">
        <div className="lc-stubs-text">
          <h2 id="lc-stubs-title" className="lc-h2">
            가입하면 관람 기록이 남습니다
          </h2>
          <p className="lc-sub">기록은 계정에 저장되어, 다른 브라우저에서도 이어서 볼 수 있습니다.</p>
          <p className="lc-actions">
            <Link className="lc-btn lc-btn-spot" to="/auth/signup">
              회원가입
            </Link>
            <Link className="lc-btn" to="/auth/login">
              로그인
            </Link>
          </p>
        </div>
        <ul className="lc-tickets">
          <li>
            <b>읽음 도장</b>끝까지 본 용어에 도장이 찍힙니다.
          </li>
          <li>
            <b>관별 진행률</b>
            {entry && data
              ? `${josa(entry.name, "을", "를")} 끝까지 보면 ${CATEGORY_LABELS[entry.category]} 진행률이 0/${data.index.filter((t) => t.category === entry.category).length}에서 1로 올라갑니다.`
              : "분야마다 몇 개를 봤는지 보입니다."}
          </li>
          <li>
            <b>이어 보기</b>최근 본 상영작이 첫 화면에 남습니다.
          </li>
        </ul>
      </section>
    </div>
  );
}

const ScreenWait = () => (
  <div className="lc-screen-wait" aria-busy="true">
    <p>영사기를 켜는 중…</p>
  </div>
);
