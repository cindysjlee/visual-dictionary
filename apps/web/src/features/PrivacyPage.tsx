// 개인정보처리방침(/privacy, 8단계). 푸터·로그인·가입 화면에서 링크하고, Google 동의 화면의 개인정보처리방침 주소로도 쓴다.
// 실제 처리와 맞춰 쓴다: 저장 항목은 docs/03(LearningRecord·RecentView·Cognito 속성), 보관 기간은 TTL·탈퇴 정리 흐름
const CONTACT = "visualdict.help@gmail.com";

export default function PrivacyPage() {
  return (
    <article className="glass card card-lg privacy">
      <h1>개인정보처리방침</h1>
      <p className="muted">시행일: 2026년 11월 20일</p>
      <p>
        보안·CS 개념 시각화 사전(이하 "서비스")은 로그인과 학습 기록에 꼭 필요한 정보만 처리해요. 로그인하지 않으면 용어를 보고 애니메이션을 재생하는 데 어떤
        개인정보도 받지 않아요.
      </p>

      <h2>1. 처리하는 정보</h2>
      <ul>
        <li>
          <strong>이메일로 가입할 때</strong>: 이메일 주소. 비밀번호는 인증 서비스(Amazon Cognito)가 보관하고 서비스는 알 수 없어요.
        </li>
        <li>
          <strong>Google로 로그인할 때</strong>: Google 계정의 이메일 주소, 이메일 인증 여부, Google 계정 식별자. Google이 함께 보내는 이름 같은 기본 프로필 정보는
          로그인 확인에만 쓰고 저장하지 않아요.
        </li>
        <li>
          <strong>학습 기록</strong>: 다 본(읽음) 용어, 읽음으로 표시한 방법(재생 완료 또는 직접 표시), 표시한 시각.
        </li>
        <li>
          <strong>최근 본 용어</strong>: 로그인한 채로 연 용어와 연 시각.
        </li>
        <li>
          <strong>브라우저에 저장하는 것</strong>: 로그인 상태를 유지하는 토큰, 화면 테마·재생 속도 설정. 이 기기에만 있고 로그아웃하면 토큰은 지워져요.
        </li>
      </ul>

      <h2>2. 이용 목적</h2>
      <ul>
        <li>회원 식별과 로그인 유지</li>
        <li>읽은 용어와 진행률, 최근 본 용어를 여러 기기에서 같게 보여 주기</li>
      </ul>

      <h2>3. 보관 기간</h2>
      <ul>
        <li>계정과 학습 기록: 탈퇴할 때까지. 탈퇴하면 계정을 바로 삭제하고, 학습 기록과 최근 본 용어도 바로 정리 작업을 시작해 지워요.</li>
        <li>최근 본 용어: 연 날로부터 30일이 지나면 자동으로 지워져요.</li>
      </ul>

      <h2>4. 제3자 제공</h2>
      <p>개인정보를 다른 회사나 기관에 제공하지 않아요.</p>

      <h2>5. 처리 위탁</h2>
      <ul>
        <li>
          <strong>Amazon Web Services</strong>: 회원 인증(Amazon Cognito), 학습 기록 저장(Amazon DynamoDB), 서비스 제공(서울 리전)
        </li>
        <li>
          <strong>Google</strong>: Google로 로그인할 때 본인 확인
        </li>
      </ul>

      <h2>6. 이용자의 권리</h2>
      <p>
        내 학습 화면에서 언제든 탈퇴할 수 있고, 탈퇴하면 계정과 기록이 모두 지워져요. 열람·정정·삭제 요청은 아래 문의처로 보내 주세요.
      </p>

      <h2>7. 문의처</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}
