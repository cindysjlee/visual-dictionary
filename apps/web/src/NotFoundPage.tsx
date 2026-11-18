import { Link } from "react-router";

export default function NotFoundPage({ message = "찾는 페이지가 없습니다." }: { message?: string }) {
  return (
    <section className="glass card card-lg notice">
      <h1>{message}</h1>
      <Link to="/" className="btn btn-cta">
        용어 목록으로
      </Link>
    </section>
  );
}
