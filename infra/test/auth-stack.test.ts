import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { AuthStack } from "../lib/auth-stack.ts";

const template = Template.fromStack(new AuthStack(new App(), "Test", { env: { region: "ap-northeast-2" } }));

describe("AuthStack", () => {
  it("사용자 풀: Lite, 이메일 로그인·자동 인증, 8자+숫자, 이메일 복구, MFA 없음", () => {
    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolTier: "LITE",
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
});
