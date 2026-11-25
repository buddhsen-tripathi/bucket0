import { describe, expect, it } from "vitest";
import { routeProductionRequest } from "@/server/production-routing";

describe("production host routing", () => {
  it("preserves the apex redirect and query string", () => {
    const response = routeProductionRequest(new Request("https://www.bucket0.com:8443/docs?a=1"));
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error("Expected redirect");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://bucket0.com/docs?a=1");
  });
  it("keeps the signed S3 path, host, query, and body available after routing", async () => {
    const source = new Request("https://s3.bucket0.com/bucket/folder/a%20b.txt?uploadId=a%2Fb&partNumber=1", {
      method: "PUT", body: "part bytes", headers: { host: "s3.bucket0.com", authorization: "AWS4-HMAC-SHA256 test", "x-amz-content-sha256": "test-hash" },
    });
    const routed = routeProductionRequest(source);
    if (!(routed instanceof Request)) throw new Error("Expected routed S3 request");
    const url = new URL(routed.url);
    expect(url.pathname).toBe("/api/s3-api/bucket/folder/a%20b.txt");
    expect(url.pathname.replace(/^\/api\/s3-api/, "")).toBe(new URL(source.url).pathname);
    expect(url.search).toBe(new URL(source.url).search);
    expect(routed.method).toBe("PUT");
    expect(routed.headers.get("host")).toBe("s3.bucket0.com");
    expect(routed.headers.get("authorization")).toBe(source.headers.get("authorization"));
    expect(await routed.text()).toBe("part bytes");
  });
  it("does not confuse an S3 object path beginning with the internal API prefix", () => {
    const routed = routeProductionRequest(new Request("https://s3.bucket0.com/api/s3-api/file"));
    if (!(routed instanceof Request)) throw new Error("Expected routed request");
    expect(new URL(routed.url).pathname).toBe("/api/s3-api/api/s3-api/file");
    expect(routed.headers.get("host")).toBe("s3.bucket0.com");
  });
  it("leaves ordinary API requests untouched", () => {
    const source = new Request("https://bucket0.com/api/s3-api/bucket/file");
    expect(routeProductionRequest(source)).toBe(source);
  });
});
