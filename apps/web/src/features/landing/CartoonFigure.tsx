// [그림 1] 움직이는 카툰 삽화: 예시 용어(CSRF)의 단계를 만화 그림으로 재생한다(three.js·WebGL 없음, SVG + Web Animations API).
// 단계 순서·출발/도착·효과(쿠키 저장·탭 등장·화면 바꿈·쿠키 붙이기·토큰·송금)·차단 단계는 모두 용어 JSON(stepView)에서 읽는다.
// 캐릭터는 행위자 종류(kind)로 그린다. 동작 줄이기면 움직임 없이 단계별 정지 컷만 바뀐다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Term } from "@app/content-schema";
import { kindOf, lastStepIndex, modeDefenses, stepView, type StepView } from "@app/content-schema/scene";

type Pt = { x: number; y: number };
const SLOT = {
  tab: [{ x: 110, y: 118 }, { x: 250, y: 118 }],
  jar: { x: 180, y: 226 },
  bank: { x: 560, y: 150 },
  server: { x: 440, y: 70 },
  attacker: { x: 440, y: 318 },
};
const GATE: Pt = { x: 474, y: 206 }; // 은행 앞 검문소(차단되면 편지가 여기서 멈춘다)
const BANK_DOOR: Pt = { x: 540, y: 206 };
const FLY = 760;
const HOLD = 950;
const CUT = 2200; // 동작 줄이기: 정지 컷 하나를 보여 주는 시간

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 행위자 id → 그림 위치. 같은 종류가 여럿이면 나온 순서대로 자리를 채운다 */
function place(term: Term) {
  const pos = new Map<string, Pt & { kind: string; name: string; look?: string }>();
  let tabs = 0;
  for (const a of term.scenario.actors) {
    const kind = kindOf(a);
    const p =
      kind === "tab"
        ? SLOT.tab[tabs++] ?? SLOT.tab[1]!
        : kind === "cookieJar"
          ? SLOT.jar
          : kind === "server"
            ? a.look === "bank"
              ? SLOT.bank
              : SLOT.server
            : kind === "attacker"
              ? SLOT.attacker
              : { x: 175, y: 160 };
    pos.set(a.id, { ...p, kind, name: a.name, look: a.look });
  }
  return pos;
}

/** 0..upto 단계의 효과를 쌓은 장면 상태 */
function sceneAt(views: StepView[], upto: number) {
  const s = { jarCookie: false, token: false, shown: new Set<string>(), flipped: new Map<string, string>(), coins: false };
  for (const v of views.slice(0, upto + 1)) {
    for (const e of v.effects) {
      if (e.type === "store" && e.item === "cookie") s.jarCookie = true;
      if (e.type === "give" && e.item === "token" && !e.refused) s.token = true;
      if (e.type === "appear") s.shown.add(e.target);
      if (e.type === "rewrite" && e.screen?.title) s.flipped.set(e.target, e.screen.title);
      if (e.type === "transfer") s.coins = true;
    }
  }
  return s;
}

export default function CartoonFigure({ term }: { term: Term }) {
  const modes = modeDefenses(term);
  const [mode, setMode] = useState<number | null>(null);
  const views = Array.from({ length: lastStepIndex(term, mode) + 1 }, (_, i) => stepView(term, mode, i));
  const pos = place(term);
  // i: 지금 단계(-1 = 시작 전), done: 그 단계의 움직임이 끝났는가
  const [cur, setCur] = useState({ i: -1, done: true });
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const root = useRef<SVGSVGElement>(null);
  const run = useRef(0);
  const viewsRef = useRef(views);
  viewsRef.current = views;

  const anims = () => root.current?.getAnimations({ subtree: true }) ?? [];
  const stop = () => {
    run.current++;
    for (const a of anims()) a.cancel();
  };
  const wait = (ms: number) => root.current!.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms }).finished;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  /** from 단계부터 끝까지(once면 그 단계만) 재생 */
  const play = useCallback(async (from: number, once = false) => {
    stop();
    const token = run.current;
    setState("playing");
    try {
      for (let i = from; i < viewsRef.current.length; i++) {
        setCur({ i, done: false });
        await frame();
        if (token !== run.current) return;
        if (!reduced()) await animateStep(root.current!, viewsRef.current[i]!, pos);
        if (token !== run.current) return;
        setCur({ i, done: true });
        await wait(reduced() ? CUT : HOLD);
        if (token !== run.current || once) break;
      }
      if (token === run.current) setState("ended");
    } catch {
      // 취소(cancel)되면 finished가 거부된다: 다른 재생이 이어받았으므로 조용히 끝낸다
    }
    // pos는 렌더마다 같은 값(용어 고정)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    for (const a of anims()) a.pause();
    setState("paused");
  };
  const resume = () => {
    for (const a of anims()) a.play();
    setState("playing");
  };

  // 화면에 들어오면 한 번 재생, 화면 밖으로 나가면 멈춘다(다시 들어오면 이어서)
  const seen = useRef(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting && !seen.current) {
          seen.current = true;
          void play(0);
        } else if (!e.isIntersecting) {
          for (const a of anims()) if (a.playState === "running") a.pause();
        } else {
          for (const a of anims()) if (a.playState === "paused") a.play();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      run.current++;
    };
  }, [play]);

  const pickMode = (m: number | null) => {
    stop();
    setMode(m);
    setCur({ i: -1, done: true });
    setState("idle");
    // 모드가 바뀌면 단계가 달라지므로 다음 그림에서 처음부터
    requestAnimationFrame(() => void play(0));
  };

  const view = cur.i >= 0 ? views[cur.i] : undefined;
  const scene = sceneAt(views, cur.done ? cur.i : cur.i - 1);
  const blockedNow = !!view?.blocked && cur.done;
  const appearing = !cur.done ? view?.effects.find((e) => e.type === "appear") : undefined; // 지금 나타나는 중인 탭
  const browser = term.scenario.actors.find((a) => kindOf(a) === "browser");
  const modeName = mode === null ? "공격 흐름" : `방어: ${term.defenses[mode]!.name}`;

  return (
    <figure className="la-fig" aria-labelledby="la-fig-cap">
      <div className="la-fig-modes" role="group" aria-label="그림 1 장면 고르기">
        <button type="button" aria-pressed={mode === null} onClick={() => pickMode(null)}>
          공격 흐름
        </button>
        {modes.map((m) => (
          <button key={m} type="button" className="is-defense" aria-pressed={mode === m} onClick={() => pickMode(m)}>
            방어: {term.defenses[m]!.name}
          </button>
        ))}
      </div>

      <svg ref={root} className="la-toon" viewBox="0 0 640 400" role="img" aria-label={`${term.name} ${modeName} 만화 삽화`}>
        <rect className="t-plate" x="0" y="0" width="640" height="400" rx="6" />
        {/* 사용자와 브라우저 창 */}
        <g className="t-browser">
          <rect x="18" y="30" width="318" height="272" rx="16" className="t-fill-browser t-line" />
          <path d="M18 46a16 16 0 0 1 16-16h286a16 16 0 0 1 16 16v14H18z" className="t-fill-plate t-line" />
          <circle cx="38" cy="45" r="4.5" className="t-fill-attack" />
          <circle cx="52" cy="45" r="4.5" className="t-fill-coin" />
          <circle cx="66" cy="45" r="4.5" className="t-fill-bank" />
          <text x="86" y="50" className="t-label">
            {browser?.name ?? "브라우저"}
          </text>
        </g>
        <User mood={scene.coins ? "shock" : blockedNow ? "relief" : "calm"} />
        <Jar at={pos.get("jar") ?? { ...SLOT.jar, name: "쿠키 보관함" }} full={scene.jarCookie} />
        {[...pos.entries()].map(([id, p]) =>
          p.kind === "tab" ? (
            <Tab key={id} p={p} hidden={id !== firstTab(pos) && !scene.shown.has(id) && !(appearing?.type === "appear" && appearing.target === id)} flipped={scene.flipped.get(id)} token={scene.token && id === firstTab(pos)} id={id} />
          ) : p.kind === "server" ? (
            p.look === "bank" ? (
              <Bank key={id} p={p} />
            ) : (
              <EvilServer key={id} p={p} />
            )
          ) : p.kind === "attacker" ? (
            <Attacker key={id} p={p} coins={scene.coins} foiled={blockedNow} />
          ) : null,
        )}
        <Gate shut={blockedNow} />

        {/* 움직이는 것들: 평소엔 숨어 있다가 단계마다 Web Animations로 움직인다 */}
        <g data-part="env" className="t-move">
          <Envelope label={view?.label ?? ""} cookie={!!view?.effects.some((e) => e.type === "attach" && !e.refused)} />
        </g>
        <g data-part="cookie" className="t-move">
          <Cookie r={11} />
        </g>
        <g data-part="key" className="t-move">
          <Key />
        </g>
        <g data-part="coins" className="t-move">
          <Coin x={-12} y={0} />
          <Coin x={8} y={-8} />
          <Coin x={4} y={10} />
        </g>
        <g data-part="word" className="t-move">
          <text className="t-word" textAnchor="middle" />
        </g>
        <g data-part="nope" className="t-move">
          <Bubble text="안 붙어!" />
        </g>

        {blockedNow && view && (
          <g className="t-stamp" transform={`translate(${GATE.x - 46} ${GATE.y + 52}) rotate(-8)`}>
            <Burst />
            <text className="t-bang" textAnchor="middle" y="-30">
              쾅!
            </text>
            <rect x="-76" y="-14" width="152" height="34" rx="4" className="t-stamp-box" />
            <text className="t-stamp-text" textAnchor="middle" y="8">
              {view.blockedLabel ?? "차단"}
            </text>
          </g>
        )}
      </svg>

      <div className="la-player">
        <div className="la-steps-nav" role="group" aria-label="단계로 가기">
          {views.map((v, i) => (
            <button
              key={i}
              type="button"
              className={v.blocked ? "la-step-no is-block" : v.tone === "attack" ? "la-step-no is-danger" : "la-step-no"}
              aria-pressed={cur.i === i}
              onClick={() => void play(i, true)}
            >
              {i + 1}
              <span className="visually-hidden">단계: {v.title}</span>
            </button>
          ))}
        </div>
        <div className="la-player-ctl">
          {state === "playing" ? (
            <button type="button" className="la-btn la-btn-sm" onClick={pause}>
              일시정지
            </button>
          ) : state === "paused" ? (
            <button type="button" className="la-btn la-btn-sm" onClick={resume}>
              이어서 재생
            </button>
          ) : (
            <button type="button" className="la-btn la-btn-sm la-btn-ink" onClick={() => void play(0)}>
              {state === "ended" ? "다시 보기" : "재생"}
            </button>
          )}
          {state !== "idle" && state !== "ended" && (
            <button type="button" className="la-btn la-btn-sm" onClick={() => void play(0)}>
              다시 보기
            </button>
          )}
        </div>
      </div>

      <p className="la-subtitle" aria-live="polite">
        {view ? (
          <>
            <b className={view.blocked ? "is-block" : view.tone === "attack" ? "is-danger" : undefined}>
              {cur.i + 1}단계. {view.title}
            </b>{" "}
            {view.caption}
          </>
        ) : (
          `${term.name}의 ${views.length}단계를 만화로 보여 줍니다. 위에서 공격 흐름이나 방어를 고르세요.`
        )}
      </p>

      <figcaption id="la-fig-cap">
        <b>그림 1.</b> {term.name} {modeName}.
        {mode !== null && views.at(-1)?.blocked && ` ${views.length}단계에서 막힌다.`}{" "}
        <span className="la-see-inline">
          → 3D 장면: <Link to={`/terms/${term.id}`}>{term.name} 표제어</Link>
        </span>
      </figcaption>
    </figure>
  );
}

const firstTab = (pos: ReturnType<typeof place>) => [...pos.entries()].find(([, p]) => p.kind === "tab")?.[0];

/** 한 단계의 움직임. 끝나면 resolve(취소되면 reject) */
async function animateStep(svg: SVGSVGElement, v: StepView, pos: ReturnType<typeof place>) {
  const part = (n: string) => svg.querySelector<SVGGElement>(`[data-part="${n}"]`)!;
  const at = (id: string) => pos.get(id) ?? { x: 320, y: 200 };
  const to = (p: Pt) => `translate(${p.x}px, ${p.y}px)`;
  const arc = (a: Pt, b: Pt, lift = 34): Keyframe[] => [
    { transform: to(a), opacity: 1, offset: 0 },
    { transform: `${to({ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift })} rotate(-6deg)`, offset: 0.5 },
    { transform: to(b), opacity: 1, offset: 1 },
  ];
  const ease = "cubic-bezier(0.65, 0, 0.35, 1)";
  const go = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => el.animate(k, { fill: "forwards", easing: ease, ...o }).finished;
  const say = (text: string, p: Pt, tone: string) => {
    const w = part("word");
    const t = w.querySelector("text")!;
    t.textContent = text;
    t.setAttribute("class", `t-word t-word-${tone}`);
    return go(
      w,
      [
        { transform: `${to(p)} scale(0.4)`, opacity: 0 },
        { transform: `${to(p)} scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `${to(p)} scale(1)`, opacity: 1, offset: 0.75 },
        { transform: `${to(p)} scale(1)`, opacity: 0 },
      ],
      { duration: 900, easing: "ease-out" },
    );
  };
  const tone = v.blocked ? "defense" : v.tone;
  const fx = (t: string) => v.effects.find((e) => e.type === t);

  // 탭이 새로 나타난다(뿅!)
  const appear = fx("appear");
  if (appear?.type === "appear") {
    const tab = svg.querySelector(`[data-actor="${appear.target}"]`);
    if (tab) await go(tab, [{ transform: "scale(0.2)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: "ease-out" });
    void say("뿅!", { x: at(appear.target).x, y: at(appear.target).y - 70 }, "neutral");
  }

  // SameSite처럼 쿠키가 붙으려다 튕긴다
  const attach = fx("attach");
  const from = at(v.from);
  if (attach?.type === "attach" && attach.refused) {
    const jar = at(attach.from ?? "jar");
    const c = part("cookie");
    await go(c, [{ transform: to(jar), opacity: 1 }, { transform: to({ x: (jar.x + from.x) / 2, y: jar.y - 50 }), offset: 0.55 }, { transform: to({ x: jar.x - 6, y: jar.y }), opacity: 1 }], { duration: 760 });
    void go(part("nope"), [{ transform: `${to({ x: jar.x, y: jar.y - 70 })} scale(0.5)`, opacity: 0 }, { transform: `${to({ x: jar.x, y: jar.y - 70 })} scale(1)`, opacity: 1, offset: 0.25 }, { transform: `${to({ x: jar.x, y: jar.y - 70 })} scale(1)`, opacity: 0 }], { duration: 1300, easing: "ease-out" });
    c.getAnimations().forEach((a) => a.cancel());
  }

  // 편지가 날아간다(슝!). 은행으로 가는 편지는 검문소를 지나 문 앞까지, 막히면 검문소에서 멈춘다
  const target = pos.get(v.to)?.look === "bank" ? (v.blocked ? GATE : BANK_DOOR) : at(v.to);
  const env = part("env");
  void say("슝!", { x: (from.x + target.x) / 2, y: Math.max(36, Math.min(from.y, target.y) - 58) }, tone);
  await go(env, arc(from, target), { duration: FLY });
  if (v.roundTrip) await go(env, arc(target, from, 40), { duration: FLY * 0.8 });
  if (v.blocked) {
    await go(env, [{ transform: `${to(GATE)} translateX(0)` }, { transform: `${to(GATE)} translateX(-14px) rotate(-12deg)` }, { transform: `${to({ x: GATE.x - 22, y: GATE.y + 18 })} rotate(-24deg)`, opacity: 0.0 }], { duration: 520, easing: "ease-out" });
    return;
  }
  env.getAnimations().forEach((a) => a.cancel());

  // 도착한 뒤: 쿠키 저장 / 토큰 받기 / 송금
  const store = fx("store");
  if (store?.type === "store") {
    const c = part("cookie");
    await go(c, arc(target, at(store.into), 40), { duration: 560 });
    c.getAnimations().forEach((a) => a.cancel());
  }
  const give = fx("give");
  if (give?.type === "give" && !give.refused) {
    const k = part("key");
    await go(k, arc(at(give.from), at(give.to)), { duration: FLY });
    k.getAnimations().forEach((a) => a.cancel());
  }
  const transfer = fx("transfer");
  if (transfer?.type === "transfer") {
    const c = part("coins");
    void say("짤랑!", { x: at(transfer.to).x - 70, y: at(transfer.to).y - 70 }, "coin");
    await go(c, arc(at(transfer.from), at(transfer.to), 40), { duration: 900 });
    c.getAnimations().forEach((a) => a.cancel());
  }
  if (fx("flip")) {
    const tab = svg.querySelector(`[data-actor="${v.from}"]`);
    if (tab) await go(tab, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 480 });
  }
}

/* ── 캐릭터(원작). 외곽선·면 색은 landing.css의 t-* 클래스(--la-ill-* 토큰) ── */

function User({ mood }: { mood: "calm" | "shock" | "relief" }) {
  return (
    <g className="t-user" transform="translate(52 344)">
      <path d="M-30 50c0-24 13-38 30-38s30 14 30 38z" className="t-fill-bank t-line" />
      <circle cx="0" cy="-6" r="22" className="t-fill-skin t-line" />
      <path d="M-22-10c2-16 12-22 22-22s21 7 22 22c-7-6-15-8-22-8s-15 2-22 8z" className="t-fill-hair t-line" />
      <circle cx="-8" cy="-4" r="2.6" className="t-fill-line" />
      <circle cx="8" cy="-4" r="2.6" className="t-fill-line" />
      {mood === "shock" ? <ellipse cx="0" cy="8" rx="4" ry="5" className="t-fill-line" /> : <path d={mood === "relief" ? "M-9 4q9 10 18 0" : "M-7 6q7 6 14 0"} className="t-stroke" />}
      {mood === "shock" && <path d="M28-30l8-8M32-18h10M24-40l2-10" className="t-stroke" />}
    </g>
  );
}

function Tab({ p, id, hidden, flipped, token }: { p: Pt & { name: string }; id: string; hidden: boolean; flipped?: string; token: boolean }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`} style={{ visibility: hidden ? "hidden" : "visible" }}>
      <g data-actor={id} className="t-tab">
        <rect x="-62" y="-48" width="124" height="98" rx="12" className={flipped ? "t-fill-evil t-line" : "t-fill-paper t-line"} />
        <rect x="-62" y="-48" width="124" height="22" rx="12" className="t-fill-plate t-line" />
        <text x="0" y="-32" textAnchor="middle" className="t-label t-small">
          {p.name}
        </text>
        {flipped ? (
          <>
            <path d="M0-14l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" className="t-fill-coin t-line" />
            <text x="0" y="38" textAnchor="middle" className="t-label t-on-evil">
              {flipped}
            </text>
          </>
        ) : (
          <>
            <rect x="-40" y="-14" width="80" height="10" rx="5" className="t-fill-plate" />
            <rect x="-40" y="2" width="56" height="10" rx="5" className="t-fill-plate" />
            <rect x="-40" y="20" width="44" height="18" rx="6" className="t-fill-bank t-line" />
          </>
        )}
        {token && (
          <g transform="translate(36 28) rotate(-20)">
            <Key />
          </g>
        )}
      </g>
    </g>
  );
}

function Jar({ at, full }: { at: Pt & { name: string }; full: boolean }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <path d="M-34-22h68v8c8 4 10 10 10 20v26c0 12-8 18-20 18h-48c-12 0-20-6-20-18V6c0-10 2-16 10-20z" className="t-fill-glass t-line" />
      <rect x="-38" y="-34" width="76" height="14" rx="5" className="t-fill-cookie t-line" />
      {full && (
        <>
          <Cookie r={11} x={-12} y={18} />
          <Cookie r={10} x={12} y={22} />
        </>
      )}
      <text x="0" y="62" textAnchor="middle" className="t-label t-small">
        {at.name}
      </text>
    </g>
  );
}

function Bank({ p }: { p: Pt & { name: string } }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <path d="M-58-30L0-66l58 36z" className="t-fill-bank t-line" />
      <rect x="-54" y="-30" width="108" height="12" className="t-fill-paper t-line" />
      {[-36, -12, 12, 36].map((x) => (
        <rect key={x} x={x - 6} y="-18" width="12" height="58" className="t-fill-paper t-line" />
      ))}
      <rect x="-62" y="40" width="124" height="14" rx="3" className="t-fill-bank t-line" />
      <circle cx="-9" cy="-42" r="3" className="t-fill-line" />
      <circle cx="9" cy="-42" r="3" className="t-fill-line" />
      <path d="M-6-34q6 4 12 0" className="t-stroke" />
      <text x="0" y="76" textAnchor="middle" className="t-label">
        {p.name}
      </text>
    </g>
  );
}

function Gate({ shut }: { shut: boolean }) {
  return (
    <g transform={`translate(${GATE.x} ${GATE.y})`} className="t-gate">
      <rect x="-6" y="-30" width="12" height="54" rx="3" className="t-fill-plate t-line" />
      <g className={shut ? "t-bar is-shut" : "t-bar"}>
        <rect x="0" y="-30" width="54" height="10" rx="5" className="t-fill-paper t-line" />
        <rect x="12" y="-30" width="10" height="10" className="t-fill-defense" />
        <rect x="34" y="-30" width="10" height="10" className="t-fill-defense" />
      </g>
      <text x="0" y="42" textAnchor="middle" className="t-label t-small">
        검문소
      </text>
    </g>
  );
}

function EvilServer({ p }: { p: Pt & { name: string } }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <path d="M-30-30l-8-18 18 10zM30-30l8-18-18 10z" className="t-fill-evil t-line" />
      <rect x="-40" y="-32" width="80" height="64" rx="14" className="t-fill-evil t-line" />
      <path d="M-22-8l14 5M22-8l-14 5" className="t-stroke-on-evil" />
      <path d="M-16 12q16 12 32 0" className="t-stroke-on-evil" />
      <text x="58" y="6" className="t-label t-small">
        {p.name}
      </text>
    </g>
  );
}

function Attacker({ p, coins, foiled }: { p: Pt & { name: string }; coins: boolean; foiled: boolean }) {
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <path d="M-34 52c0-30 14-46 34-46s34 16 34 46z" className="t-fill-attacker t-line" />
      <path d="M-28 4c-2-30 10-44 28-44s30 14 28 44c-8 8-18 10-28 10s-20-2-28-10z" className="t-fill-attacker t-line" />
      <circle cx="0" cy="-6" r="18" className="t-fill-skin t-line" />
      <rect x="-20" y="-14" width="40" height="11" rx="5" className="t-fill-line" />
      <circle cx="-8" cy="-8.5" r="2.4" className="t-fill-paper" />
      <circle cx="8" cy="-8.5" r="2.4" className="t-fill-paper" />
      <path d={foiled ? "M-8 8q8-7 16 0" : coins ? "M-10 2q10 12 20 0" : "M-8 4q8 7 16 0"} className="t-stroke" />
      {foiled && <path d="M24-28q6 6 0 12q-6-6 0-12z" className="t-fill-glass t-line-thin" />}
      {coins && (
        <g transform="translate(-62 34)">
          <path d="M-20 18c-4-20 2-32 20-32s24 12 20 32z" className="t-fill-cookie t-line" />
          <Coin x={-6} y={-16} />
          <Coin x={8} y={-20} />
        </g>
      )}
      <text x="48" y="40" className="t-label t-small">
        {p.name}
      </text>
    </g>
  );
}

function Envelope({ label, cookie }: { label: string; cookie: boolean }) {
  return (
    <g className="t-env">
      <path d="M-34-8h-16M-36 2h-22M-34 12h-14" className="t-stroke t-speed" />
      <rect x="-26" y="-17" width="52" height="34" rx="4" className="t-fill-paper t-line" />
      <path d="M-26-15l26 18 26-18" className="t-stroke" />
      {cookie && <Cookie r={9} x={22} y={-14} />}
      {label && (
        <>
          <rect x={-label.length * 3.6 - 8} y="22" width={label.length * 7.2 + 16} height="20" rx="10" className="t-fill-plate t-line-thin" />
          <text x="0" y="36" textAnchor="middle" className="t-env-label">
            {label}
          </text>
        </>
      )}
    </g>
  );
}

const Cookie = ({ r, x = 0, y = 0 }: { r: number; x?: number; y?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={r} className="t-fill-cookie t-line" />
    <circle cx={-r * 0.35} cy={-r * 0.25} r={r * 0.16} className="t-fill-chip" />
    <circle cx={r * 0.35} cy={r * 0.1} r={r * 0.16} className="t-fill-chip" />
    <circle cx={-r * 0.05} cy={r * 0.45} r={r * 0.14} className="t-fill-chip" />
  </g>
);

const Coin = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r="9" className="t-fill-coin t-line" />
    <circle r="4.5" className="t-stroke" />
  </g>
);

const Key = () => (
  <g>
    <circle cx="-8" cy="0" r="7" className="t-fill-coin t-line" />
    <path d="M-1 0h18v6M11 0v5" className="t-stroke t-thick" />
  </g>
);

const Bubble = ({ text }: { text: string }) => (
  <g>
    <path d="M-44-16h88a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-36l-8 10-6-10h-38a8 8 0 0 1-8-8v-18a8 8 0 0 1 8-8z" className="t-fill-paper t-line" />
    <text textAnchor="middle" y="6" className="t-label">
      {text}
    </text>
  </g>
);

const Burst = () => <path d="M0-74l10 22 22-12-6 24 24 2-20 14 16 18-24-4-2 24-14-18-14 18-2-24-24 4 16-18-20-14 24-2-6-24 22 12z" className="t-fill-defense-bg t-line" />;
