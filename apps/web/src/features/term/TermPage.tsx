import { useParams } from "react-router";

// shortcut: 화면 틀만 있다. 2단계에서 /content/terms/<id>.json을 읽어 상세·플레이어를 그린다
export default function TermPage() {
  const { id } = useParams();
  return (
    <section>
      <h1 className="mono">{id}</h1>
      <p>상세 페이지는 준비 중입니다.</p>
    </section>
  );
}
