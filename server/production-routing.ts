/** Redirect www to the apex domain and route s3.bucket0.com requests to the S3 gateway. */
export function routeProductionRequest(request: Request) {
  const url = new URL(request.url);
  if (url.hostname === "www.bucket0.com") {
    url.hostname = "bucket0.com";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.href, 301);
  }
  if (url.hostname !== "s3.bucket0.com") return request;
  // Always prepend exactly once. The S3 verifier removes this one
  // internal prefix when reconstructing the path signed by the client.
  url.pathname = "/api/s3-api" + url.pathname;
  const routed = new Request(url, request);
  if (!routed.headers.has("host")) routed.headers.set("host", url.host);
  return routed;
}
