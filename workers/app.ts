import { consumeBackground } from "./background";
import type { ExecutionContext } from "hono";
export { RateLimitCounter } from "./rate-limit";
export { MediaContainer } from "./media-container";
import { app } from "@/server/app";
import { routeProductionRequest } from "@/server/production-routing";

export default {
  queue: consumeBackground,
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    const routed = routeProductionRequest(request);
    if (routed instanceof Response) return routed;
    return app.fetch(routed, env, ctx);
  },
};
