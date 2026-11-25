// Runtime APIs retain Wrangler's generated types without replacing browser globals.
declare module "cloudflare:workers" {
  const DurableObject: typeof import("../worker-configuration").CloudflareWorkersModule.DurableObject;
  export { DurableObject };
}
type Env = import("../worker-configuration").Env;
type DurableObjectState = import("../worker-configuration").DurableObjectState;
type MessageBatch<T = unknown> = import("../worker-configuration").MessageBatch<T>;
