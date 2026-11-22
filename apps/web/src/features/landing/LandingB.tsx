// 시안 B "학습 노선도": 분야 = 노선, 용어 = 역. 배울 길 전체가 지하철 노선도처럼 한눈에 보이고,
// 역을 고르면 안내판에 그 용어가, 환승 구간에서는 공격선과 방어선이 갈라지는 곳이, 정기권(가입)에는 노선별 진행률이 보인다
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Category, IndexEntry, Term } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { lastStepIndex, modeDefenses, stepView } from "@app/content-schema/scene";
import "../../styles/landing-b.css";
import type { LandingData } from "./LandingPage.tsx";

type Props = { data: LandingData | null; failed: boolean };

const lineName = (c: Category) => `${CATEGORY_LABELS[c]}선`;

// 노선도 좌표(viewBox 1100 × 높이). 모든 노선은 왼쪽 출발역에서 45° 꺾여 자기 줄로 간다
const MAP_W = 1100;
const ROW_GAP = 116;
const TOP = 70;
const HUB_X = 70;
const BEND_X = 150;

type Station = { t: IndexEntry; x: number; y: number; above: boolean };
type Line = { c: Category; path: string; stations: Station[]; y: number };

function layout(groups: LandingData["groups"]): { lines: Line[]; hubY: number; height: number } {
  const hubY = TOP + ((groups.length - 1) * ROW_GAP) / 2;
  const lines = groups.map(([c, list], r) => {
    const y = TOP + r * ROW_GAP;
    const dy = Math.abs(y - hubY);
    const start = BEND_X + dy + 60;
    const step = list.length > 1 ? Math.min(150, (MAP_W - 160 - start) / (list.length - 1)) : 0;
    const stations = list.map((t, i) => ({ t, x: start + i * step, y, above: i % 2 === 1 }));
    const end = stations.at(-1)!.x;
    return { c, y, stations, path: `M${HUB_X} ${hubY} H${BEND_X} L${BEND_X + dy} ${y} H${end}` };
  });
  return { lines, hubY, height: TOP * 2 + (groups.length - 1) * ROW_GAP };
}

export default function LandingB({ data, failed }: Props) {
  const navigate = useNavigate();
  const [sel, setSel] = useState<string | null>(null);
  const map = useMemo(() => (data ? layout(data.groups) : null), [data]);
  const current = data?.index.find((t) => t.id === (sel ?? data.demo?.id)) ?? data?.index[0];
  const total = data?.index.length;

  return (
    <div className="lb">
      <header className="lb-sign">
        <h1 className="lb-title">
          <span className="lb-title-ko">보안·CS 용어 사전</span>
          <span className="lb-title-en">Visual Dictionary of Security &amp; CS</span>
        </h1>
        <p className="lb-lede">
          보안 공격과 CS 개념이 단계별 3D 장면으로 움직이고, 방어를 켜면 어느 단계에서 막히는지 보입니다. 분야는 노선, 용어는 역.
          {total !== undefined && data && (
            <>
              {" "}
              지금 <b className="lb-num">{data.groups.length}</b>개 노선에 <b className="lb-num">{total}</b>개 역이 있습니다.
            </>
          )}
        </p>
        <p className="lb-actions">
          <Link className="lb-btn lb-btn-main" to="/terms">
            용어 둘러보기
          </Link>
          <Link className="lb-btn" to="/auth/signup">
            회원가입
          </Link>
          <span className="lb-actions-note">가입하면 지나온 역과 노선별 진행률이 저장됩니다</span>
        </p>
        {failed && (
          <p className="lb-alert" role="alert">
            노선도를 불러오지 못했습니다. 새로고침하거나 용어 둘러보기로 가 주세요.
          </p>
        )}
      </header>

      <section className="lb-mapwrap" aria-labelledby="lb-map-title">
        <h2 id="lb-map-title" className="lb-sr">
          노선도
        </h2>
        {map && data ? (
          <>
            <RouteMap map={map} selected={current?.id} onPick={setSel} onGo={(id) => navigate(`/terms/${id}`)} />
            {/* 좁은 화면: 노선도 대신 노선별 역 목록 */}
            <ol className="lb-list">
              {data.groups.map(([c, list]) => (
                <li key={c} className={`lb-c-${c}`}>
                  <p className="lb-list-line">{lineName(c)}</p>
                  <ol>
                    {list.map((t) => (
                      <li key={t.id}>
                        <Link to={`/terms/${t.id}`}>{t.name}</Link>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
            {current && <Board t={current} />}
          </>
        ) : (
          <div className="lb-map-wait" aria-busy="true" />
        )}
      </section>

      {data?.demo && <Transfer demo={data.demo} />}

      <section className="lb-pass-sec" aria-labelledby="lb-pass-title">
        <div>
          <h2 id="lb-pass-title">정기권을 만들면 지나온 역이 남습니다</h2>
          <p>가입하면 기록이 계정에 저장되어, 다른 브라우저에서 열어도 같은 노선도가 보입니다.</p>
          <ul className="lb-perks">
            <li>
              <b>탑승 기록</b> 끝까지 본 용어의 역에 불이 들어옵니다.
            </li>
            <li>
              <b>노선별 진행률</b> 노선마다 몇 역을 지났는지 보입니다.
            </li>
            <li>
              <b>이어 타기</b> 최근 내린 역이 목록 첫머리에 남습니다.
            </li>
          </ul>
          <p className="lb-actions">
            <Link className="lb-btn lb-btn-main" to="/auth/signup">
              회원가입하고 정기권 만들기
            </Link>
            <Link className="lb-btn" to="/auth/login">
              로그인
            </Link>
          </p>
        </div>
        {data && (
          <figure className="lb-pass" aria-labelledby="lb-pass-cap">
            <figcaption id="lb-pass-cap">
              <span className="lb-pass-brand">시각화 사전 정기권</span>
              <span className="lb-pass-note">가입하면 0역에서 출발</span>
            </figcaption>
            <ul>
              {data.groups.map(([c, list]) => (
                <li key={c} className={`lb-c-${c}`}>
                  <span className="lb-pass-line">{lineName(c)}</span>
                  <span className="lb-pass-dots" aria-hidden="true">
                    {list.map((t) => (
                      <i key={t.id} />
                    ))}
                  </span>
                  <span className="lb-num">0 / {list.length}역</span>
                </li>
              ))}
            </ul>
          </figure>
        )}
      </section>
    </div>
  );
}

function RouteMap({ map, selected, onPick, onGo }: { map: ReturnType<typeof layout>; selected?: string; onPick: (id: string) => void; onGo: (id: string) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [reduce, setReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  // 열차는 꾸밈 반복이므로 노선도가 화면 밖이면 멈춘다
  useEffect(() => {
    const el = svg.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? el.unpauseAnimations() : el.pauseAnimations()));
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <svg ref={svg} className="lb-map" viewBox={`0 0 ${MAP_W} ${map.height}`} aria-label="분야별 노선도. 역을 고르면 아래 안내판에 용어 설명이 나옵니다">
      {map.lines.map((l) => (
        <g key={l.c} className={`lb-line lb-c-${l.c}`}>
          <path id={`lb-path-${l.c}`} d={l.path} className="lb-track" />
          <text x={l.stations.at(-1)!.x + 26} y={l.y + 5} className="lb-line-name">
            {lineName(l.c)}
          </text>
          {!reduce && (
            <rect className="lb-train" x="-11" y="-5" width="22" height="10" rx="5">
              <animateMotion dur={`${8 + l.stations.length * 1.6}s`} repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;0.86;1" calcMode="linear">
                <mpath href={`#lb-path-${l.c}`} />
              </animateMotion>
            </rect>
          )}
          {l.stations.map(({ t, x, y, above }) => (
            <a
              key={t.id}
              href={`/terms/${t.id}`}
              className={t.id === selected ? "lb-st is-on" : "lb-st"}
              aria-label={`${t.name}, ${lineName(t.category)}, ${t.stepCount}단계`}
              onMouseEnter={() => onPick(t.id)}
              onFocus={() => onPick(t.id)}
              onClick={(e) => {
                e.preventDefault();
                onGo(t.id);
              }}
            >
              <circle cx={x} cy={y} r="16" className="lb-st-hit" />
              <circle cx={x} cy={y} r="9" className="lb-st-dot" />
              <text x={x} y={above ? y - 22 : y + 34} textAnchor="middle" className="lb-st-name">
                {t.name}
              </text>
            </a>
          ))}
        </g>
      ))}
      <g className="lb-hub" aria-hidden="true">
        <circle cx={HUB_X} cy={map.hubY} r="26" />
        <text x={HUB_X} y={map.hubY + 5} textAnchor="middle">
          출발
        </text>
      </g>
    </svg>
  );
}

/** 역 안내판: 고른 역(용어)의 노선·이름·설명·장면 정보. 바뀔 때 한 번 넘어간다 */
function Board({ t }: { t: IndexEntry }) {
  return (
    <aside className={`lb-board lb-c-${t.category}`} aria-label="역 안내판">
      <div key={t.id} className="lb-board-flip">
        <p className="lb-board-line">{lineName(t.category)}</p>
        <p className="lb-board-name">
          {t.name}
          {t.englishName && <span lang="en">{t.englishName}</span>}
        </p>
        <p className="lb-board-sum">{t.summary}</p>
        <dl className="lb-board-facts">
          <div>
            <dt>장면</dt>
            <dd className="lb-num">{t.stepCount}단계</dd>
          </div>
          <div>
            <dt>방어</dt>
            <dd className="lb-num">{t.defenseCount > 0 ? `${t.defenseCount}가지` : "없음"}</dd>
          </div>
          {t.blockedAt.length > 0 && (
            <div>
              <dt>차단</dt>
              <dd className="lb-num">{t.blockedAt.join("·")}단계</dd>
            </div>
          )}
        </dl>
      </div>
      <p className="lb-board-cta">
        <Link className="lb-btn lb-btn-main" to={`/terms/${t.id}`}>
          {t.name} 3D 장면 보기
        </Link>
        <span>가입하면 본 역에 불이 들어옵니다</span>
      </p>
    </aside>
  );
}

/** 환승 구간: 같은 장면을 방어를 켜고 달리면 방어선이 몇 번째 역에서 멈추는지 */
function Transfer({ demo }: { demo: Term }) {
  const modes = modeDefenses(demo);
  const [mode, setMode] = useState(modes[0] ?? null);
  const attack = Array.from({ length: lastStepIndex(demo, null) + 1 }, (_, i) => stepView(demo, null, i));
  const guarded = mode === null ? [] : Array.from({ length: lastStepIndex(demo, mode) + 1 }, (_, i) => stepView(demo, mode, i));
  const stop = guarded.findIndex((v) => v.blocked);

  return (
    <section className="lb-transfer" aria-labelledby="lb-tr-title">
      <div className="lb-tr-head">
        <h2 id="lb-tr-title">환승: 공격선과 방어선</h2>
        <p>
          {demo.name}을 공격만으로 달리면 끝까지 가고, 방어를 켜고 달리면
          {stop >= 0 ? ` ${stop + 1}번째 역에서 멈춥니다.` : " 다른 길로 갑니다."}
        </p>
        {modes.length > 1 && (
          <div className="lb-tr-modes" role="group" aria-label="방어 고르기">
            {modes.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {demo.defenses[m]!.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="lb-tracks" style={{ ["--n" as string]: attack.length }}>
        <p className="lb-track-name lb-track-attack">공격선</p>
        <ol className="lb-row lb-row-attack">
          {attack.map((v, i) => (
            <li key={i} className={v.tone === "attack" ? "is-danger" : undefined}>
              <span className="lb-row-dot" aria-hidden="true" />
              <span className="lb-num lb-row-no">{i + 1}</span>
              {v.title}
              {v.tone === "attack" && <span className="lb-tag">위험</span>}
            </li>
          ))}
        </ol>
        <p className="lb-track-name lb-track-defense">{mode === null ? "방어선" : `방어선: ${demo.defenses[mode]!.name}`}</p>
        <ol className="lb-row lb-row-defense">
          {attack.map((_, i) => {
            const g = guarded[i];
            if (!g) return <li key={i} className="is-gone" aria-hidden="true" />;
            return (
              <li key={i} className={g.blocked ? "is-stop" : g.tone === "attack" ? "is-danger" : undefined}>
                <span className="lb-row-dot" aria-hidden="true" />
                <span className="lb-num lb-row-no">{i + 1}</span>
                {g.title}
                {g.blocked && <span className="lb-tag lb-tag-stop">종점 · {g.blockedLabel ?? "차단"}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      <Link className="lb-link" to={`/terms/${demo.id}`}>
        {demo.name} 3D 장면으로 타 보기
      </Link>
    </section>
  );
}
