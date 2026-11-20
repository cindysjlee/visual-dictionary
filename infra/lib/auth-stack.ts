// 회원 인증: Cognito 사용자 풀(Essentials) + 웹 앱 클라이언트 + 로그인 도메인. FR-AUTH-02·03·05·07, NFR-01 (docs/03 인증)
import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  ProviderAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolIdentityProviderGoogle,
  UserPoolEmail,
  VerificationEmailStyle,
} from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";
import { LOGIN_DOMAIN_PREFIX, LOGIN_ORIGIN, SITE_ORIGIN } from "./csp.ts";

/** OAuth 콜백·로그아웃 주소(8단계 구글 로그인). 개발 서버는 가짜 인증이라 localhost는 등록하지 않는다 */
export const OAUTH_CALLBACK = `${SITE_ORIGIN}/auth/callback`;
export const OAUTH_LOGOUT = `${SITE_ORIGIN}/`;
/** 구글 OAuth 클라이언트(키 client_id·client_secret). 사용자가 콘솔에서 넣고, 템플릿에는 dynamic reference만 남는다 */
export const GOOGLE_SECRET_NAME = "visual-dictionary/google-oauth";

/** 토큰 유효 시간: 액세스·ID 1시간, 리프레시 30일(브라우저를 닫았다 열어도 로그인 유지, FR-AUTH-03) */
export const TOKEN_VALIDITY = { access: Duration.hours(1), id: Duration.hours(1), refresh: Duration.days(30) };

export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "UserPool", {
      // Essentials(8단계): managed login에서만 prompt(탈퇴 재확인 때 구글 계정 선택 강제)를 쓸 수 있다. Lite와 같이 월 1만 MAU 무료(docs/03)
      featurePlan: FeaturePlan.ESSENTIALS,
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
      // OAuth(로그인 도메인)는 인가 코드 + PKCE만. CDK 기본(implicit + https://example.com 콜백)을 쓰지 않는다:
      // 도메인이 생기면 그 기본값으로 토큰을 다른 사이트로 보내는 로그인 주소를 만들 수 있다
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, OAuthScope.COGNITO_ADMIN],
        callbackUrls: [OAUTH_CALLBACK],
        logoutUrls: [OAUTH_LOGOUT],
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO, UserPoolClientIdentityProvider.GOOGLE],
    });

    // 구글 로그인(FR-AUTH-07). 같은 이메일의 이메일 가입 계정과 합치지 않는다(연결 트리거 없음, docs/03).
    // 클라이언트 ID·비밀값은 Secrets Manager에서 CloudFormation dynamic reference로 읽는다(값이 템플릿·저장소에 남지 않음)
    const google = new UserPoolIdentityProviderGoogle(this, "Google", {
      userPool: this.userPool,
      clientId: SecretValue.secretsManager(GOOGLE_SECRET_NAME, { jsonField: "client_id" }).unsafeUnwrap(),
      clientSecretValue: SecretValue.secretsManager(GOOGLE_SECRET_NAME, { jsonField: "client_secret" }),
      scopes: ["openid", "email", "profile"],
      // email_verified를 매핑하지 않으면 Cognito가 이메일을 미인증으로 본다
      attributeMapping: { email: ProviderAttribute.GOOGLE_EMAIL, emailVerified: ProviderAttribute.GOOGLE_EMAIL_VERIFIED },
    });
    this.client.node.addDependency(google);

    // 로그인 도메인: managed login(Essentials). 화면은 Cognito 기본 모양(브랜딩)을 쓰고, 앱은 identity_provider=Google로 구글 화면에 바로 보낸다
    this.userPool.addDomain("LoginDomain", {
      cognitoDomain: { domainPrefix: LOGIN_DOMAIN_PREFIX },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    new CfnManagedLoginBranding(this, "LoginBranding", {
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    new CfnOutput(this, "LoginDomain", { value: LOGIN_ORIGIN });
    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.client.userPoolClientId });
  }
}
