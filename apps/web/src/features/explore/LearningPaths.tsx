// 추천 학습 경로(색인 /terms 왼쪽, docs/05): 처음이라면 이 순서로 읽는 길 3개. 경로 데이터는 지연 로드(/content/paths.json, 홈 묶음에 넣지 않는다)이고,
// 색인과 함께 도착한 뒤에 그려진다(HomePage가 둘을 같이 기다려 늦게 와서 아래가 밀리는 일이 없다).
// 단계는 읽는 순서대로 나열한 ol이고, 완독한 용어에는 작은 完 도장(로그인했을 때만 lined에 값이 있다)
import { Link } from "react-router";
import type { IndexEntry, LearningPath } from "@app/content-schema";
import { Seal, sealLabel } from "../dictionary/Seal.tsx";

export function LearningPaths({
  paths,
  byId,
  lined,
  readAt,
}: {
  paths: LearningPath[];
  byId: ReadonlyMap<string, IndexEntry>;
  lined: ReadonlySet<string>;
  readAt: (id: string) => string | undefined;
}) {
  return (
    <section className="la-paths" aria-labelledby="la-paths-title">
      <h2 id="la-paths-title">처음이라면 이 순서로</h2>
      <ul role="list">
        {paths.map((path) => (
          <li key={path.id} className="la-path">
            <h3>{path.title}</h3>
            <ol role="list">
              {path.steps.flatMap((id) => {
                const term = byId.get(id);
                if (!term) return [];
                const on = lined.has(id);
                return [
                  <li key={id}>
                    <Link to={`/terms/${id}`}>
                      {term.name}
                      {on && (
                        <span className="visually-hidden">
                          {" "}
                          ({sealLabel(readAt(id))})
                        </span>
                      )}
                    </Link>
                    {on && (
                      <span
                        className="la-seal-mark"
                        title={sealLabel(readAt(id))}
                      >
                        <Seal size={20} light />
                      </span>
                    )}
                  </li>,
                ];
              })}
            </ol>
            <p className="la-path-why">{path.why}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
