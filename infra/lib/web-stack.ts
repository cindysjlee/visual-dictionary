// 프론트엔드 호스팅: 비공개 S3 + CloudFront(OAC). FR-DEP-01, 02, 04
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import {
  AccessLevel,
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, CacheControl, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";
import { CSP } from "./csp.ts";

/** 배포 때 CloudFront에서 비우는 경로. "/"는 기본 루트 객체(index.html)의 캐시 키가 따로라서 함께 넣는다. 해시 파일은 이름이 바뀌므로 비울 필요가 없다 */
export const INVALIDATION_PATHS = ["/", "/index.html", "/config.json", "/content/*"];

export { COGNITO_ORIGIN, CSP } from "./csp.ts";

/** 브라우저 설정(/config.json): 배포 때 값이 채워진다. 풀·클라이언트 ID는 공개돼도 되는 값이고 저장소 파일에는 적지 않는다 */
export type WebAuthConfig = { region: string; userPoolId: string; userPoolClientId: string };
/** apiDomain: /api/*를 보낼 API Gateway 도메인(ApiStack). 같은 출처라 CSP connect-src와 CORS를 바꾸지 않는다 */
export type WebStackProps = StackProps & { distPath: string; auth: WebAuthConfig; apiDomain: string };

/**
 * SPA 라우팅(CloudFront Function, viewer-request, 기본 동작): 마지막 경로 조각에 확장자(.)가 없는 화면 주소만 /index.html로 바꾼다.
 * 그래서 없는 /assets·/content 파일은 진짜 404가 되고, /api/*는 다른 동작이라 여기 오지 않는다(403·404 → index.html 대체 응답 대신, 6단계)
 */
export const SPA_ROUTER_CODE = `function handler(event) {
  var request = event.request;
  var last = request.uri.split("/").pop();
  if (last.indexOf(".") === -1) request.uri = "/index.html";
  return request;
}`;

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "SiteBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const headers = new ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        contentSecurityPolicy: { contentSecurityPolicy: CSP, override: true },
      },
    });

    const spaRouter = new CfFunction(this, "SpaRouter", {
      code: FunctionCode.fromInline(SPA_ROUTER_CODE),
      runtime: FunctionRuntime.JS_2_0,
      comment: "확장자 없는 화면 주소만 /index.html로",
    });

    const distribution = new Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        // LIST: 없는 파일에 403이 아니라 404를 주게 한다(OAC에 목록 권한)
        origin: S3BucketOrigin.withOriginAccessControl(bucket, { originAccessLevels: [AccessLevel.READ, AccessLevel.LIST] }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: spaRouter, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        // 학습 기록 API: 캐시하지 않고, Host를 뺀 모든 헤더(Authorization 포함)를 API Gateway로 넘긴다
        "/api/*": {
          origin: new HttpOrigin(props.apiDomain, { protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
      defaultRootObject: "index.html",
    });

    // 캐시 정책별로 나눠 올린다. exclude된 파일은 sync 대상도 prune 대상도 아니라서 세 배포가 서로의 파일을 건드리지 않는다
    const source = [Source.asset(props.distPath)];
    // 해시 파일: 지우지 않는다(prune: false). 배포 전에 받은 옛 index.html·메인 JS가 옛 청크를 불러도 있어야 한다
    const assets = new BucketDeployment(this, "DeployAssets", {
      sources: source,
      destinationBucket: bucket,
      exclude: ["*"],
      include: ["assets/*"],
      prune: false,
      cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.days(365)), CacheControl.immutable()],
    });
    // 진입 HTML·브라우저 설정·콘텐츠: 매번 다시 확인(no-cache). 새 청크가 먼저 올라간 뒤에 바꾼다
    const pages = new BucketDeployment(this, "DeployPages", {
      sources: [...source, Source.jsonData("config.json", props.auth)],
      destinationBucket: bucket,
      exclude: ["*"],
      include: ["index.html", "config.json", "content/*"],
      cacheControl: [CacheControl.noCache()],
      distribution,
      distributionPaths: INVALIDATION_PATHS,
    });
    pages.node.addDependency(assets);
    // 나머지(robots.txt 등): 1시간
    new BucketDeployment(this, "DeployRest", {
      sources: source,
      destinationBucket: bucket,
      exclude: ["assets/*", "index.html", "config.json", "content/*"],
      cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.hours(1))],
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
  }
}
