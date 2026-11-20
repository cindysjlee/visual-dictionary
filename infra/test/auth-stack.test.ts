import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AuthStack } from "../lib/auth-stack.ts";
import { hashOf, nonAscii } from "./non-ascii.ts";

/** 인증 메일 문구(제목·본문, 이전·새 형식 4곳)의 sha256. 문구를 일부러 바꿨으면 실패 메시지의 새 해시로 고친다 */
const MAIL_HASH = "f2255d47a3673793ce8a6e38b2e1b849a1dd299c406f6638fdbd191363d6d8fc";

const template = Template.fromStack(new AuthStack(new App(), "Test", { env: { region: "ap-northeast-2" } }));

describe("AuthStack", () => {
  it("사용자 풀: Essentials, 이메일 로그인·자동 인증, 8자+숫자, 이메일 복구, MFA 없음", () => {
    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolTier: "ESSENTIALS",
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      Policies: {
        PasswordPolicy: { MinimumLength: 8, RequireNumbers: true, RequireLowercase: false, RequireUppercase: false, RequireSymbols: false },
      },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }] },
      MfaConfiguration: "OFF",
      EmailConfiguration: { EmailSendingAccount: "COGNITO_DEFAULT" },
      VerificationMessageTemplate: Match.objectLike({ DefaultEmailOption: "CONFIRM_WITH_CODE" }),
      DeletionProtection: "ACTIVE",
    });
  });

  it("스택을 지워도 사용자 풀은 남는다(RETAIN)", () => {
    template.hasResource("AWS::Cognito::UserPool", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" });
  });

  it("웹 앱 클라이언트: 비밀 없음, SRP·리프레시만, 존재 노출 방지, 토큰 취소, 1시간/1시간/30일", () => {
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      PreventUserExistenceErrors: "ENABLED",
      EnableTokenRevocation: true,
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      RefreshTokenValidity: 43200,
      TokenValidityUnits: { AccessToken: "minutes", IdToken: "minutes", RefreshToken: "minutes" },
    });
  });

  it("OAuth: 인가 코드만(implicit·example.com 없음), 콜백·로그아웃은 이 사이트, 로그인 수단은 아직 COGNITO만", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: ["openid", "email", "profile", "aws.cognito.signin.user.admin"],
      CallbackURLs: ["https://d1y3rvak3nd08u.cloudfront.net/auth/callback"],
      LogoutURLs: ["https://d1y3rvak3nd08u.cloudfront.net/"],
      SupportedIdentityProviders: ["COGNITO"],
    });
    expect(JSON.stringify(template.toJSON())).not.toContain("example.com");
  });

  it("로그인 도메인: 접두어 visual-dictionary-auth, managed login(버전 2), Cognito 기본 브랜딩", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolDomain", { Domain: "visual-dictionary-auth", ManagedLoginVersion: 2 });
    template.hasResourceProperties("AWS::Cognito::ManagedLoginBranding", { UseCognitoProvidedValues: true });
  });

  // 사용자가 받는 인증 메일만 한글이다. cdk diff는 이 때문에 Auth에 "비ASCII 생략 1건"을 계속 내지만, CI 관문(보안: IAM 표, 변경: 실제 변경 세트)은 이를 실패로 보지 않는다.
  // 대신 메일 문구가 실제로 바뀌면 여기서 알 수 있게 해시를 고정한다
  it("비ASCII는 인증 메일 문구 4곳뿐이고, 문구는 고정 해시와 같다", () => {
    const found = nonAscii(template);
    expect(Object.keys(found).map((k) => k.replace(/^Resources\.\w+\.Properties\./, "")).sort()).toEqual([
      "EmailVerificationMessage",
      "EmailVerificationSubject",
      "VerificationMessageTemplate.EmailMessage",
      "VerificationMessageTemplate.EmailSubject",
    ]);
    expect(hashOf(found), "인증 메일 문구가 바뀌었다. 의도한 변경이면 MAIL_HASH를 이 값으로 고친다").toBe(MAIL_HASH);
  });
});
