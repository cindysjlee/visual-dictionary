// 추천 학습 경로(색인 /terms 왼쪽, docs/05): 처음이라면 이 순서로 읽는 길 3개. 경로 데이터는 지연 로드(/content/paths.json, 홈 묶음에 넣지 않는다)이고,
// 색인과 함께 도착한 뒤에 그려진다(HomePage가 둘을 같이 기다려 늦게 와서 아래가 밀리는 일이 없다).
// 경로 하나 = 분야 색 괘선이 위에 걸린 "한 쪽"(카드). 단계는 읽는 순서대로 나열한 ol이고 실 하나가 마디(번호)를 꿴다.
// 완독한 용어는 번호 마디가 完 도장으로 바뀌고(로그인했을 때만), 쪽 머리에 "n/3 완독"이 붙는다
import { Link } from "react-router";
import type { IndexEntry, LearningPath } from "@app/content-schema";
import { Seal, sealLabel } from "../dictionary/Seal.tsx";

export function LearningPaths({
  paths,
  byId,
  lined,
  records,
  readAt,
}: {
  paths: LearningPath[];
  byId: ReadonlyMap<string, IndexEntry>;
  lined: ReadonlySet<string>;
  /** 로그인해서 기록을 불러왔을 때만 도장·n/3 완독을 보인다 */
  records: boolean;
  readAt: (id: string) => string | undefined;
}) {
  return (
    <section className="la-paths" aria-labelledby="la-paths-title">
      <h2 id="la-paths-title">처음이라면 이 순서로</h2>
      <ul role="list">
        {paths.map((path) => {
          const steps = path.steps.filter((id) => byId.has(id));
          const done = steps.filter((id) => lined.has(id)).length;
          return (
            <li key={path.id} className={`la-path la-tab-${path.category}`}>
              <div className="la-path-head">
                <h3>{path.title}</h3>
                {records && (
                  <span className="la-path-count la-num">
                    {done}/{steps.length} 완독
                  </span>
                )}
              </div>
              <ol role="list">
                {steps.map((id, i) => {
                  const term = byId.get(id)!;
                  const on = lined.has(id);
                  return (
                    <li key={id} className={on ? "is-done" : undefined}>
                      <Link to={`/terms/${id}`}>
                        <span className="la-path-node" aria-hidden="true">
                          {on ? <Seal size={30} light /> : <span className="la-num">{i + 1}</span>}
                        </span>
                        <span className="la-path-name">
                          {term.name}
                          {on && <span className="visually-hidden"> ({sealLabel(readAt(id))})</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
              <p className="la-path-why">{path.why}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
