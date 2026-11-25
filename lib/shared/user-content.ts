/**
 * Headers for responses that return user-uploaded bytes from the app origin.
 *
 * Passive media (images, audio, video, PDF, plain text) keeps the app CSP so
 * previews work. Anything else (HTML, SVG, XML, unknown types) is served under a
 * CSP sandbox without allow-scripts, so it renders in an opaque origin and cannot
 * run script with the viewer's session.
 */
const PASSIVE_CONTENT_TYPE =
  /^(image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|text\/plain)\s*(;|$)/i;

export const USER_CONTENT_SANDBOX_CSP = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";

export function isPassiveContentType(contentType: string | null | undefined): boolean {
  return !!contentType && PASSIVE_CONTENT_TYPE.test(contentType.trim());
}

export function userContentSecurityHeaders(contentType: string | null | undefined): Record<string, string> {
  return isPassiveContentType(contentType) ? {} : { "Content-Security-Policy": USER_CONTENT_SANDBOX_CSP };
}
