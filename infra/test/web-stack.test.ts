import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CSP, INVALIDATION_PATHS, SPA_ROUTER_CODE, WebStack } from "../lib/web-stack.ts";

const distPath = mkdtempSync(join(tmpdir(), "dist-"));
writeFileSync(join(distPath, "index.html"), "<!doctype html>");
const auth = { region: "ap-northeast-2", userPoolId: "ap-northeast-2_test", userPoolClientId: "testclient" };
const template = Template.fromStack(new WebStack(new App(), "Test", { distPath, auth, apiDomain: "abc123.execute-api.ap-northeast-2.amazonaws.com" }));

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
        // 403·404 → index.html 대체 응답은 없다(API의 401·404가 HTML 200으로 바뀌지 않게). 화면 주소는 SPA Function이 처리
        CustomErrorResponses: Match.absent(),
      }),
    });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [{ EventType: "viewer-request", FunctionARN: Match.anyValue() }],
        }),
      }),
    });
  });

  it("SPA 라우팅 함수: 확장자 없는 화면 주소만 /index.html로", () => {
    const handler = new Function(`${SPA_ROUTER_CODE}; return handler;`)() as (e: { request: { uri: string } }) => { uri: string };
    const route = (uri: string) => handler({ request: { uri } }).uri;
    expect(route("/")).toBe("/index.html");
    expect(route("/terms/csrf")).toBe("/index.html");
    expect(route("/auth/login")).toBe("/index.html");
    expect(route("/me")).toBe("/index.html");
    expect(route("/assets/index-abc.js")).toBe("/assets/index-abc.js");
    expect(route("/content/terms/csrf.json")).toBe("/content/terms/csrf.json");
    expect(route("/robots.txt")).toBe("/robots.txt");
    expect(route("/config.json")).toBe("/config.json");
  });

  it("/api/*: API Gateway로, 모든 메서드, 캐시 안 함, Host 빼고 모든 헤더(Authorization) 전달, 같은 보안 헤더", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [
          Match.objectLike({
            PathPattern: "/api/*",
            ViewerProtocolPolicy: "https-only",
            AllowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
            CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
            OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac", // AllViewerExceptHostHeader
            ResponseHeadersPolicyId: Match.anyValue(),
          }),
        ],
        Origins: Match.arrayWith([Match.objectLike({ DomainName: "abc123.execute-api.ap-northeast-2.amazonaws.com", CustomOriginConfig: Match.objectLike({ OriginProtocolPolicy: "https-only" }) })]),
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
    // 연결 대상은 자기 사이트와 서울 사용자 풀 엔드포인트뿐(와일드카드 없음, FR-DEP-04)
    expect(CSP.split("; ").find((d) => d.startsWith("connect-src"))).toBe("connect-src 'self' https://cognito-idp.ap-northeast-2.amazonaws.com");
    expect(CSP).not.toContain("*");
  });

  it("캐시 정책: 해시 파일은 immutable·지우지 않음, index.html·config.json·콘텐츠는 no-cache·무효화, 나머지는 1시간", () => {
    template.resourceCountIs("Custom::CDKBucketDeployment", 3);
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      Exclude: ["*"],
      Include: ["assets/*"],
      Prune: false,
      SystemMetadata: { "cache-control": "public, max-age=31536000, immutable" },
      DistributionPaths: Match.absent(),
    });
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      Exclude: ["*"],
      Include: ["index.html", "config.json", "content/*"],
      Prune: true,
      SystemMetadata: { "cache-control": "no-cache" },
      DistributionId: Match.anyValue(),
      DistributionPaths: INVALIDATION_PATHS,
    });
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      Exclude: ["assets/*", "index.html", "config.json", "content/*"],
      SystemMetadata: { "cache-control": "public, max-age=3600" },
    });
    expect(INVALIDATION_PATHS).toEqual(expect.arrayContaining(["/index.html", "/config.json", "/content/*"]));
  });

  it("index.html·콘텐츠는 해시 파일이 올라간 뒤에 바뀐다", () => {
    const deployments = template.findResources("Custom::CDKBucketDeployment");
    const id = (include: string) => Object.keys(deployments).find((k) => deployments[k]!.Properties.Include?.[0] === include)!;
    expect(deployments[id("index.html")]!.DependsOn).toEqual(expect.arrayContaining([expect.stringMatching(/^DeployAssets/)]));
    expect(id("assets/*")).toMatch(/^DeployAssets/);
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
        Origins: Match.arrayWith([Match.objectLike({ OriginAccessControlId: Match.anyValue(), S3OriginConfig: Match.objectLike({ OriginAccessIdentity: "" }) })]),
      }),
    });
  });
});
