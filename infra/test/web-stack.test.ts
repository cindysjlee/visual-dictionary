import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CSP, WebStack } from "../lib/web-stack.ts";

const distPath = mkdtempSync(join(tmpdir(), "dist-"));
writeFileSync(join(distPath, "index.html"), "<!doctype html>");
const template = Template.fromStack(new WebStack(new App(), "Test", { distPath }));

describe("WebStack", () => {
  it("버킷은 비공개·SSE-S3", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
      },
    });
  });

  it("CloudFront: OAC, HTTPS 리다이렉트, GET/HEAD, 403·404 → /index.html 200", () => {
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
          AllowedMethods: ["GET", "HEAD"],
        }),
        CustomErrorResponses: [403, 404].map((ErrorCode) => ({
          ErrorCode,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
          ErrorCachingMinTTL: 10,
        })),
      }),
    });
  });

  it("보안 헤더와 CSP", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ AccessControlMaxAgeSec: 31536000 }),
          FrameOptions: Match.objectLike({ FrameOption: "DENY" }),
          ReferrerPolicy: Match.objectLike({ ReferrerPolicy: "strict-origin-when-cross-origin" }),
          ContentSecurityPolicy: Match.objectLike({ ContentSecurityPolicy: CSP }),
        }),
      }),
    });
    expect(CSP).toContain("frame-ancestors 'none'");
  });

  it("nosniff·HSTS 하위 도메인, 배포가 OAC로 버킷에 붙는다", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentTypeOptions: { Override: true },
          StrictTransportSecurity: Match.objectLike({ IncludeSubdomains: true, Override: true }),
        }),
      }),
    });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Origins: [Match.objectLike({ OriginAccessControlId: Match.anyValue(), S3OriginConfig: Match.objectLike({ OriginAccessIdentity: "" }) })],
      }),
    });
  });
});
