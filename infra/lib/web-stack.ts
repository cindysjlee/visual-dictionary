// 프론트엔드 호스팅: 비공개 S3 + CloudFront(OAC). FR-DEP-01, 02, 04
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, CacheControl, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

/** 배포 때 CloudFront에서 비우는 경로. "/"는 기본 루트 객체(index.html)의 캐시 키가 따로라서 함께 넣는다. 해시 파일은 이름이 바뀌므로 비울 필요가 없다 */
export const INVALIDATION_PATHS = ["/", "/index.html", "/content/*"];

// 5단계에서 Cognito·API 도메인을 connect-src에 추가한다
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export type WebStackProps = StackProps & { distPath: string };

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

    // SPA 라우팅: OAC는 없는 객체에 403을 주므로 403·404 둘 다 index.html(200)로 돌린다
    const spaFallback = (httpStatus: number) => ({
      httpStatus,
      responseHttpStatus: 200,
      responsePagePath: "/index.html",
      ttl: Duration.seconds(10),
    });

    const distribution = new Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
      },
      defaultRootObject: "index.html",
      errorResponses: [spaFallback(403), spaFallback(404)],
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
    // 진입 HTML과 콘텐츠: 매번 다시 확인(no-cache). 새 청크가 먼저 올라간 뒤에 바꾼다
    const pages = new BucketDeployment(this, "DeployPages", {
      sources: source,
      destinationBucket: bucket,
      exclude: ["*"],
      include: ["index.html", "content/*"],
      cacheControl: [CacheControl.noCache()],
      distribution,
      distributionPaths: INVALIDATION_PATHS,
    });
    pages.node.addDependency(assets);
    // 나머지(robots.txt 등): 1시간
    new BucketDeployment(this, "DeployRest", {
      sources: source,
      destinationBucket: bucket,
      exclude: ["assets/*", "index.html", "content/*"],
      cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.hours(1))],
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
  }
}
