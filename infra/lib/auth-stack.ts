// 회원 인증: Cognito 사용자 풀(Lite) + 웹 앱 클라이언트. FR-AUTH-02·03·05, NFR-01 (docs/03 인증)
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { AccountRecovery, FeaturePlan, Mfa, UserPool, UserPoolClient, UserPoolEmail, VerificationEmailStyle } from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

/** 토큰 유효 시간: 액세스·ID 1시간, 리프레시 30일(브라우저를 닫았다 열어도 로그인 유지, FR-AUTH-03) */
export const TOKEN_VALIDITY = { access: Duration.hours(1), id: Duration.hours(1), refresh: Duration.days(30) };

export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "UserPool", {
      // Lite: 비밀번호 로그인·이메일 코드만 쓴다. CDK 기본은 Essentials라서 명시한다(둘 다 월 1만 MAU 무료)
      featurePlan: FeaturePlan.LITE,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      // 서버는 8자 + 숫자. "영문 포함"은 Cognito가 대·소문자를 따로만 강제할 수 있어 화면에서 검사한다(docs/03 보안 메모)
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: false, requireUppercase: false, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OFF,
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: "보안·CS 개념 시각화 사전 인증 코드",
        emailBody: "인증 코드는 {####} 입니다. 24시간 안에 입력해 주세요.",
      },
      // 기본 메일(no-reply@verificationemail.com, 계정 전체 하루 50통). 늘어나면 SES로 바꾼다(docs/03)
      email: UserPoolEmail.withCognito(),
      // 가입자 계정 보호: 스택을 지워도 풀은 남고, 콘솔에서 삭제 보호를 꺼야 지울 수 있다(docs/03 정리 순서)
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.client = this.userPool.addClient("WebClient", {
      // 브라우저 앱: 비밀 키 없음, SRP만(비밀번호를 Cognito에 그대로 보내지 않는다). 리프레시는 CDK가 함께 켠다
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: TOKEN_VALIDITY.access,
      idTokenValidity: TOKEN_VALIDITY.id,
      refreshTokenValidity: TOKEN_VALIDITY.refresh,
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.client.userPoolClientId });
  }
}
